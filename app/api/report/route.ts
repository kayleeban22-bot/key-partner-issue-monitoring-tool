// Design Ref: §3.4 — 보고서 생성 API. 진행 상황을 한 줄씩(JSON) 흘려 보내고 마지막에 보고서를 보낸다.
// 흐름: 공개 통계(무료, 숫자) + AI 웹 검색(문장형 자료)을 함께 모아 → 요약 → 규칙 검사 → 본문 배치 → 최종 검사.
// AI를 쓸 수 없을 때(이용 한도 소진 등)에도 공개 통계만으로 보고서를 만든다.
import { ConfigError } from "@/lib/config";
import { admit, clientIp } from "@/lib/rate-limit";
import { guardJsonRequest } from "@/lib/request-guard";
import { composeReport } from "@/lib/report/compose";
import { candidateNames, fetchOpenData, lookupCountry } from "@/lib/report/opendata";
import { dropOverlaps } from "@/lib/report/overlap";
import { OpenAIError } from "@/lib/report/openai";
import { applyRules } from "@/lib/report/rules";
import { countryInputSchema } from "@/lib/report/schema";
import { SearchError, searchSources } from "@/lib/report/search";
import { SummarizeError, summarizeSources } from "@/lib/report/summarize";
import type { RawSource, StreamChunk, SummaryPiece } from "@/lib/report/types";
import { verifyReport } from "@/lib/report/verify";

// 최대 실행 시간(초). 함수가 이 시간에 강제 종료되면 결과가 통째로 사라지므로, 아래 시간 예산 안에 끝나도록 단계마다 제한한다.
export const maxDuration = 60;

// 시간 예산(밀리초): AI 검색·요약은 38초 안에 끝내지 못하면 멈추고 공개 통계만으로 계속한다.
// 본문 배치는 전체 56초 안에서 남은 시간만큼만 기다린다(실패해도 보고서는 만든다).
const AI_BUDGET_MS = 38_000;
const TOTAL_BUDGET_MS = 56_000;

const encoder = new TextEncoder();

// 한 줄에 조각 하나: {"type":"progress",...}\n
function toLine(chunk: StreamChunk): Uint8Array {
  return encoder.encode(`${JSON.stringify(chunk)}\n`);
}

const GENERIC_ERROR = "보고서를 만드는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.";

// 화면에 그대로 보여 줘도 되는 쉬운 문구(userMessage)를 가진 오류들
type KnownError = ConfigError | SearchError | SummarizeError | OpenAIError;
const isKnownError = (error: unknown): error is KnownError =>
  error instanceof ConfigError ||
  error instanceof SearchError ||
  error instanceof SummarizeError ||
  error instanceof OpenAIError;

// 경고 문구에 넣는 짧은 이유. (보고서는 만들어졌으므로 "만들 수 없습니다" 같은 오류 문구는 쓰지 않는다)
function failureReason(error: KnownError): string {
  if (error instanceof OpenAIError) return error.kind === "quota" ? "이용 한도 소진" : "AI 서비스 통신 오류";
  if (error instanceof ConfigError) return "서버 설정 필요";
  return "AI 처리 오류";
}

export async function POST(request: Request) {
  const rejected = guardJsonRequest(request, 2_000);
  if (rejected) return rejected;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "요청 형식이 올바르지 않습니다" }, { status: 400 });
  }

  // ① 입력 검증 — 화면에서도 확인하지만 서버가 한 번 더 거절한다.
  const parsed = countryInputSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message =
      issue.path[0] === "country" ? issue.message : "요청 형식이 올바르지 않습니다";
    return Response.json({ message }, { status: 400 });
  }
  const { country } = parsed.data;

  // 이름이 여러 나라에 해당하면(예: 콩고) 엉뚱한 나라의 보고서가 만들어지지 않도록, 만들기 전에 정확한 이름을 묻는다.
  const lookup = lookupCountry(country);
  if (lookup.kind === "ambiguous") {
    const names = candidateNames(lookup.candidates);
    // suggestions: 화면이 버튼으로 보여 주는 후보 이름. 누르면 그 이름으로 바로 보고서를 만든다.
    return Response.json(
      { message: `"${country}"은(는) 여러 나라에 해당합니다. 아래에서 만들 국가를 골라 주세요.`, suggestions: names },
      { status: 400 },
    );
  }
  // 어느 나라 이름도 아니면(오타 등) AI를 부르기 전에 돌려보낸다. 공개 주소에서 헛된 사용료가 나가지 않게 한다.
  if (lookup.kind === "none") {
    return Response.json(
      { message: `"${country}"에 해당하는 국가를 찾지 못했습니다. 국가 이름을 확인해 다시 입력해 주세요.` },
      { status: 400 },
    );
  }

  // 같은 주소의 반복 요청과 동시 요청을 제한한다.
  const admission = admit(clientIp(request));
  if (!admission.ok) {
    return Response.json({ message: admission.message }, { status: 429 });
  }
  const { release } = admission;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      try {
        controller.enqueue(toLine({ type: "progress", step: "search" }));

        // ② 공개 통계 (무료): AI 검색과 동시에 불러온다. 실패해도 오류를 던지지 않고 안내만 돌려준다.
        const openPromise = fetchOpenData(country, { signal: request.signal });

        // ② 자료 검색 → ③ 요약 → ④ 규칙 검사 (AI). 여기서 알려진 오류가 나면 공개 통계만으로 계속한다.
        let aiSources: RawSource[] = [];
        let aiPieces: SummaryPiece[] = [];
        const notes: string[] = [];
        let aiFailure: KnownError | null = null;
        // 사용자가 멈춘 경우(request.signal)와 시간 예산이 끝난 경우를 구분하기 위해 신호를 따로 둔다.
        const aiSignal = AbortSignal.any([request.signal, AbortSignal.timeout(AI_BUDGET_MS)]);
        try {
          const result = await searchSources(country, { signal: aiSignal });
          if (request.signal.aborted) return;
          controller.enqueue(toLine({ type: "progress", step: "summarize" }));
          const summary = await summarizeSources(country, result.sources, { signal: aiSignal });

          const { pieces, removed } = applyRules(summary.pieces, result.sources);
          aiSources = result.sources;
          aiPieces = pieces;
          if (removed.numberMismatch > 0) {
            notes.push(`숫자가 원문과 맞지 않아 문장 ${removed.numberMismatch}개를 뺐습니다.`);
          }
          if (removed.privateInfo > 0) {
            notes.push(`연락처·주소 같은 사적 정보가 있어 문장 ${removed.privateInfo}개를 뺐습니다.`);
          }
        } catch (error) {
          if (request.signal.aborted) return;
          // 시간 초과·네트워크 오류처럼 알려지지 않은 오류도 AI를 못 쓴 것으로 보고 공개 통계로 계속한다. (종류만 기록)
          aiFailure = isKnownError(error) ? error : new SearchError(`AI 단계 오류: ${(error as Error)?.name ?? "알 수 없음"}`);
        }

        const open = await openPromise;
        notes.unshift(...open.notes);

        // 공개 통계가 이미 알려 주는 지표(인구·GDP 규모·1인당 GDP·IMF 전망)를 AI 문장이 다시 말하면 숫자가 어긋날 수 있어 AI 문장을 뺀다.
        const overlap = dropOverlaps(aiPieces, open.pieces);
        aiPieces = overlap.pieces;
        if (overlap.removed > 0) {
          notes.push(`공개 통계와 같은 지표를 다른 숫자로 말하는 AI 검색 문장 ${overlap.removed}개를 뺐습니다. (공개 통계 값을 우선합니다)`);
        }

        // 공개 통계도 AI 자료도 없는데 AI가 실패했다면, 그 오류를 그대로 알린다.
        if (open.pieces.length === 0 && aiPieces.length === 0 && aiFailure) throw aiFailure;
        if (aiFailure) {
          console.error("AI 사용 불가, 공개 통계로 계속:", aiFailure.message);
          notes.push(`AI 자료 검색을 쓸 수 없어(${failureReason(aiFailure)}) 공개 통계 자료만으로 만들었습니다.`);
        }

        // 출처 번호를 합친다: 공개 통계 출처가 1번부터, AI 출처는 그 뒤로 이어 붙인다.
        const offset = open.sources.length;
        const sources: RawSource[] = [
          ...open.sources.map((source) => ({ ...source, excerpt: "", topic: 1 as const })),
          ...aiSources.map((source) => ({ ...source, id: source.id + offset })),
        ];
        const pieces: SummaryPiece[] = [
          ...open.pieces,
          ...aiPieces.map((piece) => ({ ...piece, sourceId: piece.sourceId + offset })),
        ];

        // ⑤ 본문 작성: 문장을 표준 목차 6개 항목과 하위 항목에 배치하고 분량을 맞춘다.
        if (request.signal.aborted) return;
        controller.enqueue(toLine({ type: "progress", step: "compose" }));
        const remainingMs = Math.max(1_000, TOTAL_BUDGET_MS - (Date.now() - startedAt));
        const composed = await composeReport({ country, sources, pieces, notes, signal: request.signal, budgetMs: remainingMs });

        // ⑥ 최종 검사: 목차·출처·금지 문구·분량을 확인하고, 담당자가 알아야 할 점을 경고에 더한다.
        controller.enqueue(toLine({ type: "progress", step: "verify" }));
        const report = verifyReport(composed);
        controller.enqueue(toLine({ type: "done", report }));
      } catch (error) {
        if (request.signal.aborted) return;
        // 내부 정보(키, 응답 내용)는 서버 기록에도 남기지 않고, 오류 종류와 메시지만 남긴다.
        // ConfigError·SearchError·OpenAIError의 메시지에는 변수 이름과 HTTP 번호만 들어 있다.
        console.error("보고서 생성 중 오류:", isKnownError(error) ? error.message : (error as Error)?.name);
        controller.enqueue(
          toLine({ type: "error", message: isKnownError(error) ? error.userMessage : GENERIC_ERROR }),
        );
      } finally {
        release();
        try {
          controller.close();
        } catch {
          // 화면이 이미 닫아서 스트림이 끝나 있는 경우
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
