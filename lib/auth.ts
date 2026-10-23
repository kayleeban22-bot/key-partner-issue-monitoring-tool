// 비밀번호 한 개로 나만 쓰게 막는 간단한 잠금이다. (계정·권한 관리가 아니다)
// 비밀번호는 .env의 APP_PASSWORD에만 둔다. 코드·문서·채팅에 적지 않고, 브라우저에는 절대 보내지 않는다.
// 로그인에 성공하면 서명된 쿠키(HttpOnly)를 준다. 서명 키는 APP_PASSWORD라서 비밀번호를 바꾸면 이전 로그인은 모두 무효가 된다.
// 비밀번호가 설정돼 있지 않으면 모두 막는다(실수로 열어 두지 않기 위함).
// 서버 전용 코드이다.
import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "kp_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60; // 로그인 유지 기간: 7일

function configuredPassword(): string | null {
  const value = process.env.APP_PASSWORD;
  return value && value.length > 0 ? value : null;
}

export const isPasswordConfigured = () => configuredPassword() !== null;

// 입력한 비밀번호가 맞는지 (길이가 달라도 같은 시간에 비교한다)
export function checkPassword(input: string): boolean {
  const expected = configuredPassword();
  if (!expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const sign = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest("base64url");

// 로그인 쿠키 값: "만료시각.서명"
export function createSessionToken(now = Date.now()): string | null {
  const secret = configuredPassword();
  if (!secret) return null;
  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  return `${expires}.${sign(secret, String(expires))}`;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

// 요청이 로그인된 것인지 (서명이 맞고 만료되지 않았을 때만)
export function isAuthenticated(request: Request, now = Date.now()): boolean {
  const secret = configuredPassword();
  if (!secret) return false;
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !/^\d+$/.test(expires)) return false;
  if (Number(expires) * 1000 < now) return false;
  const expected = Buffer.from(sign(secret, expires));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearedSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export const UNAUTHORIZED_MESSAGE = "비밀번호를 입력해 주세요";
