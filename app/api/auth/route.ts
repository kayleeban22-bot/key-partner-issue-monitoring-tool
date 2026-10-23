// 비밀번호 확인 API. GET: 지금 로그인 상태인지, POST: 로그인, DELETE: 로그아웃.
// 비밀번호는 서버에서만 비교하고 어떤 응답에도 담지 않는다.
import {
  UNAUTHORIZED_MESSAGE,
  checkPassword,
  clearedSessionCookie,
  createSessionToken,
  isAuthenticated,
  isPasswordConfigured,
  sessionCookie,
} from "@/lib/auth";
import { canTryLogin, clearLoginFailures, clientIp, recordLoginFailure } from "@/lib/rate-limit";
import { guardJsonRequest } from "@/lib/request-guard";

export async function GET(request: Request) {
  return Response.json(
    { configured: isPasswordConfigured(), authenticated: isAuthenticated(request) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const rejected = guardJsonRequest(request, 2_000);
  if (rejected) return rejected;

  if (!isPasswordConfigured()) {
    return Response.json(
      { message: "서버에 비밀번호가 설정돼 있지 않습니다. 관리자가 APP_PASSWORD를 설정해야 합니다." },
      { status: 503 },
    );
  }

  const ip = clientIp(request);
  if (!canTryLogin(ip)) {
    return Response.json({ message: "비밀번호를 여러 번 틀려 잠시 막혔습니다. 10분 뒤에 다시 시도해 주세요." }, { status: 429 });
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password.slice(0, 200);
  } catch {
    return Response.json({ message: "요청 형식이 올바르지 않습니다" }, { status: 400 });
  }

  if (!checkPassword(password)) {
    recordLoginFailure(ip);
    return Response.json({ message: "비밀번호가 맞지 않습니다." }, { status: 401 });
  }

  clearLoginFailures(ip);
  const token = createSessionToken();
  if (!token) return Response.json({ message: UNAUTHORIZED_MESSAGE }, { status: 503 });
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } });
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearedSessionCookie(), "Cache-Control": "no-store" } });
}
