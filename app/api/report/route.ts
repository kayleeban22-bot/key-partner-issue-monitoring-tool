// Design Ref: §3.4 — 보고서 생성 API. 진행 상황을 한 줄씩(JSON) 흘려 보내고 마지막에 보고서를 보낸다.
// 자료 검색(작업 6)과 요약(작업 7)은 실제로 동작하고, 작성·검증 단계는 아직 가짜이다(작업 8~9에서 채운다).
import { ConfigError } from "@/lib/config";
import { buildFakeReport } from "@/lib/report/fake";
import { countryInputSchema, reportSchema } from "@/lib/report/schema";
import { SearchError, searchSources } from "@/lib/report/search";
import { SummarizeError, summarizeSources } from "@/lib/report/summarize";
import type { ProgressStep, Source, StreamChunk } from "@/lib/report/types";

// 최대 실행 시간(초). 검색 호출은 각각 40초 안에 끝나도록 했다. 배포 환경(작업 17)에서 한계를 확인해 다시 정한다.
export const maxDuration = 60;

const encoder = new TextEncoder();

// 한 줄에 조각 하나: {"type":"progress",...}\n
function toLine(chunk: StreamChunk): Uint8Array {
  return encoder.encode(`${JSON.stringify(chunk)}\n`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 요약 다음 단계들. 아직 가짜라서 단계가 바뀌는 모습만 보이게 잠깐 쉰다.
const LATER_STEPS: ProgressStep[] = ["compose", "verify"];

const GENERIC_ERROR = "보고서를 만드는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.";

export async function POST(request: Request) {
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // ② 자료 검색 (실제)
        controller.enqueue(toLine({ type: "progress", step: "search" }));
        const result = await searchSources(country, { signal: request.signal });
        // 화면으로 보내는 출처에는 서버 안에서만 쓰는 발췌(excerpt)와 주제(topic)를 뺀다.
        const sources: Source[] = result.sources.map(
          ({ id, org, title, date, url, isOld }) => ({ id, org, title, date, url, isOld }),
        );

        // ③ 요약 (실제): 자료마다 한국어 요약 문장을 만들고 출처 번호를 붙인다.
        if (request.signal.aborted) return;
        controller.enqueue(toLine({ type: "progress", step: "summarize" }));
        const { pieces } = await summarizeSources(country, result.sources, {
          signal: request.signal,
        });

        // ④~⑥ 작성·검증 (아직 가짜)
        for (const step of LATER_STEPS) {
          if (request.signal.aborted) return; // 화면이 닫히면 중단한다
          controller.enqueue(toLine({ type: "progress", step }));
          await sleep(400);
        }
        const report = reportSchema.parse(buildFakeReport(country, sources, pieces));
        controller.enqueue(toLine({ type: "done", report }));
      } catch (error) {
        if (request.signal.aborted) return;
        // 내부 정보(키, 응답 내용)는 서버 기록에도 남기지 않고, 오류 종류와 메시지만 남긴다.
        // ConfigError·SearchError의 메시지에는 변수 이름과 HTTP 번호만 들어 있다.
        const known =
          error instanceof ConfigError ||
          error instanceof SearchError ||
          error instanceof SummarizeError;
        console.error("보고서 생성 중 오류:", known ? error.message : (error as Error)?.name);
        controller.enqueue(
          toLine({ type: "error", message: known ? error.userMessage : GENERIC_ERROR }),
        );
      } finally {
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
