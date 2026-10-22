"use client";

// Design Ref: §2 — 화면은 이 한 장이고, 입력 → 생성 중 → 결과 순으로 바뀐다.
// 입력, 생성 중 표시, 결과 보기까지 연결돼 있다. 수정은 작업 12, 로딩·실패 다듬기는 작업 15에서 이어 붙인다.
import { useEffect, useRef, useState } from "react";
import CountryForm from "@/components/CountryForm";
import ReportView from "@/components/ReportView";
import { ReportRequestError, requestReport } from "@/lib/report/client";
import type { ProgressStep, Report } from "@/lib/report/types";

const STEPS: { step: ProgressStep; label: string }[] = [
  { step: "search", label: "자료 검색" },
  { step: "summarize", label: "요약·출처 정리" },
  { step: "compose", label: "보고서 작성" },
  { step: "verify", label: "검증" },
];

type ViewState =
  | { kind: "idle" }
  | { kind: "running"; country: string; current: ProgressStep | null }
  | { kind: "done"; report: Report }
  | { kind: "error"; message: string };

export default function Home() {
  const [view, setView] = useState<ViewState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  // 화면을 떠나면 진행 중인 요청을 멈춘다.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleSubmit(country: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setView({ kind: "running", country, current: null });
    try {
      const report = await requestReport(country, {
        signal: controller.signal,
        onProgress: (step) => setView({ kind: "running", country, current: step }),
      });
      setView({ kind: "done", report });
    } catch (error) {
      if (controller.signal.aborted) return; // 새 요청이나 화면 이동으로 멈춘 경우
      const message =
        error instanceof ReportRequestError
          ? error.message
          : "보고서를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
      setView({ kind: "error", message });
    }
  }

  const running = view.kind === "running";
  const currentIndex =
    view.kind === "running" ? STEPS.findIndex((s) => s.step === view.current) : -1;

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black sm:py-20">
      <main className="flex w-full max-w-3xl flex-col gap-8">
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
          className="w-full max-w-xl rounded-xl border border-black/10 bg-white p-5 dark:border-white/15 dark:bg-zinc-900 sm:p-6"
        >
          <CountryForm onSubmit={handleSubmit} disabled={running} />
        </section>

        {view.kind === "running" && (
          <section
            aria-label="생성 진행 상황"
            role="status"
            className="flex flex-col gap-2 text-sm"
          >
            <p className="font-medium">{view.country} 보고서를 만들고 있습니다</p>
            <ul className="flex flex-col gap-1 text-zinc-600 dark:text-zinc-400">
              {STEPS.map(({ step, label }, index) => {
                const mark = index < currentIndex ? "✅" : index === currentIndex ? "🔄" : "⏳";
                return (
                  <li key={step}>
                    {mark} {label}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {view.kind === "error" && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {view.message}
          </p>
        )}

        {view.kind === "done" && <ReportView report={view.report} />}
      </main>
    </div>
  );
}
