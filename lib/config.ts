// Design Ref: §5, §7 — 비밀 키는 서버 쪽 코드에서만 읽는다.
// 아래 import 덕분에 이 파일을 브라우저 쪽 코드(클라이언트 컴포넌트)에서 가져오면 빌드가 실패한다.
import "server-only";

// 키 값은 어떤 메시지·로그에도 넣지 않는다. 변수 이름만 적는다.
export class ConfigError extends Error {
  // 화면에 그대로 보여 줘도 되는 쉬운 문구 (키 이름·값 없음)
  readonly userMessage = "서버 설정이 아직 끝나지 않았습니다. 관리자에게 문의해 주세요.";

  constructor(variableName: string) {
    super(`${variableName} 환경 변수가 설정되지 않았습니다 (.env 또는 배포 환경변수 확인)`);
    this.name = "ConfigError";
  }
}

function readRequired(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ConfigError(name);
  }
  return value;
}

// OpenAI 키. 호출할 때마다 읽어서, 값을 모듈 안에 오래 들고 있지 않는다.
// 키가 없거나 비어 있으면 ConfigError를 던진다. 호출한 쪽은 error.userMessage만 화면에 보낸다.
export function getOpenAIApiKey(): string {
  return readRequired("OPENAI_API_KEY");
}
