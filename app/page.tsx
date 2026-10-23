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
    <div className="relative flex flex-1 flex-col">
      <StageBackground />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pb-16 sm:px-10">
        {/* 머리글: 안쪽을 향한 화살표 로고와 이름 */}
        <header className="in-fade flex items-center gap-4 py-7" style={{ ["--d" as string]: "0s" }}>
          <svg aria-hidden width="40" height="40" viewBox="0 0 46 46" fill="none" stroke="#fff" strokeWidth="3">
            {[0, 90, 180, 270].map((angle) => (
              <g key={angle} transform={`rotate(${angle} 23 23)`}>
                <path d="M23 0V19.5" />
                <path d="M14 10.2L23 19.2L32 10.2" />
              </g>
            ))}
          </svg>
          <span className="font-jb text-sm tracking-tight text-[var(--sub)]">재정경제부 대외경제국 · 내부 보고용</span>
        </header>

        {/* 첫 화면: 큰 제목, 설명, 국가 입력, 통계 줄 */}
        <section aria-label="국가 입력" className="flex max-w-xl flex-col gap-6 pt-10 sm:pt-20">
          <h1 className="text-[2.6rem] font-bold leading-[1.08] tracking-[-0.035em] sm:text-[4.3rem]">
            <span className="in-line" style={{ ["--d" as string]: "0.34s" }}>
              <span>경제협력</span>
            </span>
            <span className="in-line" style={{ ["--d" as string]: "0.43s" }}>
              <span>모니터링 보고 도구</span>
            </span>
          </h1>
          <p className="in-rise font-jb text-[1.02rem] leading-7 tracking-[-0.03em] text-[var(--sub)]" style={{ ["--d" as string]: "0.74s" }}>
            국가를 입력하면 공개 자료를 조사·요약해
            <br />
            표준 양식의 보고서를 만들어 줍니다.
          </p>
          <div className="in-rise" style={{ ["--d" as string]: "0.9s" }}>
            <CountryForm onSubmit={handleSubmit} disabled={view.kind === "running"} />
          </div>

          <dl className="in-rise mt-6 flex items-stretch gap-6 sm:gap-8" style={{ ["--d" as string]: "1.04s" }}>
            {[
              ["6", "표준 목차 항목"],
              ["2–3", "A4 분량(쪽)"],
              ["12", "과거 자료 기준(개월)"],
            ].map(([number, label], index) => (
              <div key={label} className="flex items-stretch gap-6 sm:gap-8">
                {index > 0 && <span className="rule-v" aria-hidden />}
                <div className="flex flex-col gap-1">
                  <dt className="font-jb text-3xl font-medium text-white">{number}</dt>
                  <dd className="font-[family-name:var(--font-sg)] text-sm tracking-[-0.02em] text-[var(--lab)]">{label}</dd>
                </div>
              </div>
            ))}
          </dl>
        </section>

        {/* 진행·오류·결과는 첫 화면 아래에 이어서 보여 준다 */}
        <div className="mt-14 flex flex-col gap-8">
          {view.kind === "running" && (
            <ProgressView country={view.country} current={view.current} onCancel={handleCancel} />
          )}

        {view.kind === "error" && (
          <section
            role="alert"
            className="flex flex-col gap-3 rounded-none border border-red-300 bg-red-50 p-5 text-sm text-red-900 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-100"
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
                    className="rounded-none bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-dark"
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleSubmit(view.country)}
                className="self-start rounded-none bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-dark"
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
