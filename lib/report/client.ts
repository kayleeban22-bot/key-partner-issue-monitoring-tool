// Design Ref: §3.4 — 브라우저에서 /api/report를 부르고, 흘러오는 진행 조각을 읽는다.
// 서버 전용 코드(config 등)를 가져오지 않고, 타입만 가져온다.
import type { ProgressStep, Report, StreamChunk } from "./types";

// 화면에 그대로 보여 줘도 되는 쉬운 문구를 message에 담는다.
export class ReportRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportRequestError";
  }
}

type Options = {
  onProgress: (step: ProgressStep) => void;
  signal?: AbortSignal;
};

const NETWORK_MESSAGE = "서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.";
const CUT_MESSAGE = "연결이 끊겨 보고서를 끝까지 받지 못했습니다. 다시 시도해 주세요.";

export async function requestReport(country: string, options: Options): Promise<Report> {
  let response: Response;
  try {
    response = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country }),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error; // 사용자가 멈춘 경우는 그대로 알린다
    throw new ReportRequestError(NETWORK_MESSAGE);
  }

  if (!response.ok || !response.body) {
    // 서버가 입력을 거절하면 { message }를 돌려준다.
    let message = "보고서를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
    try {
      const data = (await response.json()) as { message?: string };
      if (data.message) message = data.message;
    } catch {
      // 본문이 JSON이 아니면 기본 문구를 쓴다.
    }
    throw new ReportRequestError(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // 줄 단위로 잘라 한 조각씩 처리한다.
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line) continue;

        const chunk = JSON.parse(line) as StreamChunk;
        if (chunk.type === "progress") options.onProgress(chunk.step);
        else if (chunk.type === "error") throw new ReportRequestError(chunk.message);
        else return chunk.report;
      }
    }
  } catch (error) {
    if (error instanceof ReportRequestError || options.signal?.aborted) throw error;
    throw new ReportRequestError(CUT_MESSAGE); // 읽는 도중 연결이 끊긴 경우
  }

  throw new ReportRequestError("응답이 중간에 끊겼습니다. 다시 시도해 주세요.");
}
