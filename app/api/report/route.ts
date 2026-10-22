// Design Ref: §3.4 — 보고서 생성 API. 진행 상황을 한 줄씩(JSON) 흘려 보내고 마지막에 보고서를 보낸다.
// 지금은 검색·요약·작성 대신 가짜 보고서를 돌려주는 뼈대이다(작업 4). 실제 처리는 작업 6~9에서 채운다.
import { buildFakeReport } from "@/lib/report/fake";
import { countryInputSchema, reportSchema } from "@/lib/report/schema";
import type { ProgressStep, StreamChunk } from "@/lib/report/types";

// 최대 실행 시간(초). 실제 처리를 붙인 뒤 배포 환경(작업 17)에서 한계를 확인해 다시 정한다.
export const maxDuration = 60;

const encoder = new TextEncoder();

// 한 줄에 조각 하나: {"type":"progress",...}\n
function toLine(chunk: StreamChunk): Uint8Array {
  return encoder.encode(`${JSON.stringify(chunk)}\n`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const STEPS: ProgressStep[] = ["search", "summarize", "compose", "verify"];

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
        for (const step of STEPS) {
          if (request.signal.aborted) return; // 화면이 닫히면 중단한다
          controller.enqueue(toLine({ type: "progress", step }));
          await sleep(400); // 임시: 단계가 바뀌는 모습을 볼 수 있게 잠깐 쉰다
        }
        const report = reportSchema.parse(buildFakeReport(country));
        controller.enqueue(toLine({ type: "done", report }));
      } catch (error) {
        // 내부 정보는 화면에 보내지 않고, 서버 기록에만 남긴다.
        console.error("보고서 생성 중 오류", error instanceof Error ? error.name : "unknown");
        controller.enqueue(
          toLine({
            type: "error",
            message: "보고서를 만드는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.",
          }),
        );
      } finally {
        controller.close();
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
