"use client";

// Design Ref: §2 — 화면은 이 한 장이고, 입력 → 생성 중 → 결과 순으로 바뀐다.
// 지금은 첫 번째 상태(입력)만 있다. 생성 중·결과 상태는 작업 4·5·15에서 이어 붙인다.
import { useState } from "react";
import CountryForm from "@/components/CountryForm";

export default function Home() {
  // 입력이 검사를 통과한 국가명. 서버 연결(작업 4) 전이라 확인 문구만 보여 준다.
  const [country, setCountry] = useState<string | null>(null);

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black sm:py-20">
      <main className="flex w-full max-w-xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            경제협력 모니터링 보고 도구
          </h1>
          <p className="text-base text-zinc-600 dark:text-zinc-400">
            국가를 입력하면 공개 자료로 보고서를 만듭니다
          </p>
        </header>

        <section
          aria-label="국가 입력"
          className="rounded-xl border border-black/10 bg-white p-5 dark:border-white/15 dark:bg-zinc-900 sm:p-6"
        >
          <CountryForm onSubmit={setCountry} />
        </section>

        {country && (
          <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
            「{country}」 입력을 받았습니다. 보고서 만들기는 다음 작업(서버 연결)에서 이어집니다.
          </p>
        )}
      </main>
    </div>
  );
}
