// OpenAI 호출을 한 곳에서 처리한다. (검색·요약·본문 배치가 같은 방식으로 호출하고, 실패를 같은 방식으로 다룬다)
//   - 일시적인 실패(요청이 몰렸을 때의 429, 서버 오류 5xx)는 잠깐 기다렸다가 두 번까지 다시 시도한다.
//   - 이용 한도(크레딧)가 바닥난 경우는 기다려도 소용없으므로 바로 알린다.
// 서버 전용 코드이다. 키는 config.ts에서만 읽고, 어떤 메시지에도 넣지 않는다.
import "server-only";
import { getOpenAIApiKey } from "../config";

export type OpenAIFailure = "quota" | "http";

// 화면에 그대로 보여 줘도 되는 쉬운 문구를 userMessage에 담는다. (키·응답 내용 없음)
export class OpenAIError extends Error {
  readonly kind: OpenAIFailure;
  readonly userMessage: string;

  constructor(kind: OpenAIFailure, status: number, code: string | null) {
    super(`OpenAI 호출 실패 (HTTP ${status}${code ? `, ${code}` : ""})`);
    this.name = "OpenAIError";
    this.kind = kind;
    this.userMessage =
      kind === "quota"
        ? "AI 서비스의 이용 한도가 소진되어 지금은 보고서를 만들 수 없습니다. 관리자에게 알려 주세요."
        : "AI 서비스와 통신하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
}

const MAX_RETRIES = 2;
const RETRY_CAP_MS = 10_000;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

// 응답 본문에서 오류 코드만 꺼낸다. (메시지 전체는 기록하지 않는다)
async function errorCode(response: Response): Promise<string | null> {
  try {
    const data = (await response.clone().json()) as { error?: { code?: string | null } };
    return data.error?.code ?? null;
  } catch {
    return null;
  }
}

export async function callOpenAI(
  body: unknown,
  options: { signal?: AbortSignal; timeoutMs: number },
): Promise<Response> {
  const apiKey = getOpenAIApiKey(); // 키가 없으면 ConfigError
  // 기다리는 시간까지 합쳐 전체 제한 시간 안에 끝내야 한다.
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const payload = JSON.stringify(body);

  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: payload,
      signal,
    });
    if (response.ok) return response;

    const code = await errorCode(response);
    // 크레딧이 바닥나면 429로 오지만 기다려도 풀리지 않는다.
    if (code === "insufficient_quota" || code === "credit_balance_exhausted") {
      throw new OpenAIError("quota", response.status, code);
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new OpenAIError("http", response.status, code);
    }

    // 서버가 알려 준 대기 시간(초)이 있으면 따르고, 없으면 1.5초, 3초 순서로 늘려 가며 기다린다.
    const headerSeconds = Number(response.headers.get("retry-after"));
    const delay = Math.min(
      RETRY_CAP_MS,
      Number.isFinite(headerSeconds) && headerSeconds > 0
        ? headerSeconds * 1000
        : 1500 * 2 ** attempt + Math.random() * 500,
    );
    await wait(delay, signal);
  }
}
