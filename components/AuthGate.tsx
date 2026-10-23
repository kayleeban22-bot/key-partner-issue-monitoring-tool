"use client";

// 비밀번호 한 개로 나만 쓰게 하는 입구. 로그인돼 있으면 앱을 보여 주고, 아니면 비밀번호 입력 화면을 보여 준다.
// 진짜 잠금은 서버가 한다(보고서·내려받기 API가 로그인 쿠키를 확인). 이 화면은 입력을 받는 역할이다.
import { useEffect, useState } from "react";
import StageBackground from "@/components/StageBackground";

type Status = "checking" | "locked" | "open" | "unconfigured";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ configured: boolean; authenticated: boolean }>)
      .then((data) => {
        if (!alive) return;
        setStatus(!data.configured ? "unconfigured" : data.authenticated ? "open" : "locked");
      })
      .catch(() => alive && setStatus("locked"));
    return () => {
      alive = false;
    };
  }, []);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        setPassword("");
        setStatus("open");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      setError(data.message ?? "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } catch {
      setError("서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
    setStatus("locked");
  }

  if (status === "open") {
    return (
      <>
        {children}
        <button
          type="button"
          onClick={logout}
          className="fixed bottom-4 left-4 z-20 rounded-full px-3 py-1.5 text-[0.75rem] font-medium text-white/60 transition-colors hover:text-white"
        >
          로그아웃
        </button>
      </>
    );
  }

  if (status === "checking") return <div className="min-h-dvh bg-black" aria-busy />;

  return (
    <main className="hero">
      <StageBackground />
      <div className="hero-scrim" aria-hidden />
      <section aria-label="비밀번호 입력" className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-5 text-center">
        <h1 className="m-0 break-keep text-[clamp(1.8rem,5vw,3rem)] font-medium tracking-[-0.02em]">주요 협력국 현안 모니터링 툴</h1>
        {status === "unconfigured" ? (
          <p role="alert" className="mt-5 max-w-md break-keep text-[0.95rem] font-light leading-[1.7] text-[#f6f6f6]">
            서버에 비밀번호가 설정돼 있지 않습니다. <code>.env</code>(또는 Vercel 환경 변수)에 <code>APP_PASSWORD</code>를 넣은 뒤 다시 열어 주세요.
          </p>
        ) : (
          <form onSubmit={login} className="mt-7 flex w-full max-w-sm flex-col items-center gap-3">
            <label htmlFor="app-password" className="sr-only">
              비밀번호
            </label>
            <div className="flex w-full flex-col gap-2.5 sm:flex-row">
              <input
                id="app-password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) setError(null);
                }}
                placeholder="비밀번호"
                autoComplete="current-password"
                autoFocus
                aria-invalid={error ? true : undefined}
                aria-describedby="app-password-msg"
                className="glass-input h-[46px] w-full rounded-full px-5 text-center text-[15px] text-white outline-none placeholder:text-white/55 sm:flex-1 sm:text-left"
              />
              <button type="submit" disabled={busy || !password} className="btn-light sm:w-auto">
                {busy ? "확인 중…" : "입장"}
              </button>
            </div>
            <p id="app-password-msg" role={error ? "alert" : undefined} className="min-h-5 text-[0.8rem] font-light text-[#cfcfcf]">
              {error ?? "허가된 사용자만 쓸 수 있습니다."}
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
