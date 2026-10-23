"use client";

// Design Ref: §2 — 화면은 이 한 장이고, 입력 → 생성 중 → 결과 순으로 바뀐다.
// 생성 중 표시·취소, 실패 안내와 다시 시도, 결과 수정, 내려받기 전 창 닫기·새로고침 경고(작업 15)까지 연결돼 있다.
import { useEffect, useRef, useState } from "react";
import CountryForm from "@/components/CountryForm";
import StageBackground from "@/components/StageBackground";
import ProgressView from "@/components/ProgressView";
import ReportView from "@/components/ReportView";
import { ReportRequestError, requestReport } from "@/lib/report/client";
import type { ProgressStep, Report } from "@/lib/report/types";

type ViewState =
  | { kind: "idle" }
  | { kind: "running"; country: string; current: ProgressStep | null }
  | { kind: "done"; report: Report }
  // country: 다시 시도할 때 쓸 국가명, suggestions: 이름이 여러 나라에 해당할 때 고를 수 있는 후보 이름
  | { kind: "error"; message: string; country: string; suggestions: string[] };

const CONFIRM_REPLACE =
  "아직 내려받지 않은 보고서가 있습니다. 새로 만들면 지금 보고서는 사라집니다. 계속할까요?";

export default function Home() {
  const [view, setView] = useState<ViewState>({ kind: "idle" });
  // 내려받은 시점의 보고서. 이후 고치면 다른 객체가 되어 "아직 안 받음"으로 돌아간다.
  const [downloadedReport, setDownloadedReport] = useState<Report | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // 화면을 떠나면 진행 중인 요청을 멈춘다.
  useEffect(() => () => abortRef.current?.abort(), []);

  // 잃으면 되살릴 수 없는 상태: 만드는 중이거나, 아직 내려받지 않은(또는 받은 뒤 고친) 보고서가 화면에 있는 경우.
  // 서버에는 저장하지 않으므로, 이때 창을 닫거나 새로고침하면 브라우저가 한 번 더 묻는다.
  const unsaved = view.kind === "running" || (view.kind === "done" && downloadedReport !== view.report);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = ""; // 브라우저가 정해진 문구로 확인 창을 띄운다 (문구는 바꿀 수 없다)
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  // 첫 화면이 화면 전체 높이라서, 만들기 시작·실패·완료 때 진행·결과 영역으로 부드럽게 내려간다.
  useEffect(() => {
    if (view.kind === "idle") return;
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [view.kind]);

  async function handleSubmit(country: string) {
    // 내려받지 않은 보고서가 있는데 새로 만들면 지금 것이 사라지므로 먼저 확인한다.
    if (view.kind === "done" && downloadedReport !== view.report && !window.confirm(CONFIRM_REPLACE)) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setView({ kind: "running", country, current: null });
    try {
      const report = await requestReport(country, {
        signal: controller.signal,
        onProgress: (step) => {
          if (!controller.signal.aborted) setView({ kind: "running", country, current: step });
        },
      });
      if (controller.signal.aborted) return; // 결과가 도착하기 전에 취소했거나 다른 요청이 시작된 경우
      setDownloadedReport(null);
      setView({ kind: "done", report });
    } catch (error) {
      if (controller.signal.aborted) return; // 새 요청, 취소, 화면 이동으로 멈춘 경우
      const message =
        error instanceof ReportRequestError
          ? error.message
          : "보고서를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
      setView({
        kind: "error",
        message,
        country,
        suggestions: error instanceof ReportRequestError ? error.suggestions : [],
      });
    }
  }

  function handleCancel() {
    if (view.kind !== "running") return;
    abortRef.current?.abort();
    setView({ kind: "error", message: "보고서 만들기를 취소했습니다.", country: view.country, suggestions: [] });
  }

  return (
    <div className="flex flex-1 flex-col bg-black">
      {/* 첫 화면: 영상 위에 가운데 정렬된 큰 제목, 설명, 국가 입력 */}
      <main className="hero">
        <StageBackground />
        <div className="hero-scrim" aria-hidden />

        <header className="absolute inset-x-0 top-0 z-10 flex h-16 items-center justify-between px-6 sm:px-10">
          <span className="e-lift text-[1.35rem] font-extrabold leading-none tracking-tight" style={{ ["--d" as string]: "0.46s" }}>
            경제협력 보고
          </span>
          <span
            className="glass-pill e-pill rounded-full px-4 py-1.5 text-[0.8rem] font-medium text-[#d9d9d9]"
            style={{ ["--d" as string]: "0.68s" }}
          >
            재정경제부 내부 보고용
          </span>
        </header>

        <section aria-label="국가 입력" className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center px-5 pb-10 pt-20 text-center">
          <h1 className="m-0 break-keep text-[clamp(2.7rem,8.4vw,5.6rem)] font-medium leading-[1.04] tracking-[-0.02em]">
            <span className="e-line" style={{ ["--d" as string]: "0.12s" }}>
              <span>경제협력</span>
            </span>
            <span className="e-line" style={{ ["--d" as string]: "0.22s" }}>
              <span>모니터링 보고 도구</span>
            </span>
          </h1>
          <p className="e-sub mt-5 max-w-[34rem] break-keep text-[clamp(0.98rem,2.4vw,1.1rem)] font-light leading-[1.7] text-[#f6f6f6]" style={{ ["--d" as string]: "0.58s" }}>
            국가를 입력하면 공개 자료를 조사·요약해
            <br className="hidden sm:block" /> 표준 양식의 보고서를 만들어 줍니다.
          </p>
          <div className="e-pill mt-7 w-full max-w-[34rem]" style={{ ["--d" as string]: "0.9s" }}>
            <CountryForm onSubmit={handleSubmit} disabled={view.kind === "running"} />
          </div>
        </section>
      </main>

      {/* 진행·오류·결과는 첫 화면 아래에 이어서 보여 준다 (새 소식이 생기면 자동으로 이 위치로 내려간다) */}
      <div ref={resultsRef} className="relative z-10 mx-auto w-full max-w-3xl scroll-mt-4 px-5 pb-20 sm:px-8">
        <div className="flex flex-col gap-8 pt-6">
          {view.kind === "running" && (
            <ProgressView country={view.country} current={view.current} onCancel={handleCancel} />
          )}

        {view.kind === "error" && (
          <section
            role="alert"
            className="flex flex-col gap-3 rounded-2xl border border-red-300 bg-red-50 p-5 text-sm text-red-900 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-100"
          >
            <p>{view.message}</p>
            {view.suggestions.length > 0 ? (
              // 이름이 여러 나라에 해당하면 같은 이름을 다시 보내는 [다시 시도] 대신, 후보를 골라 바로 만들게 한다.
              <div className="flex flex-wrap gap-2">
                {view.suggestions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleSubmit(name)}
                    className="rounded-full bg-brand px-3 py-1.5 font-medium text-[#050505] hover:bg-brand-dark"
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleSubmit(view.country)}
                className="self-start rounded-full bg-brand px-3 py-1.5 font-medium text-[#050505] hover:bg-brand-dark"
              >
                {view.country} 다시 시도
              </button>
            )}
          </section>
        )}

        {view.kind === "done" && (
          <ReportView
            report={view.report}
            onChange={(report) => setView({ kind: "done", report })}
            downloaded={downloadedReport === view.report}
            onDownloaded={() => setDownloadedReport(view.report)}
          />
        )}
        </div>
      </div>
    </div>
  );
}
