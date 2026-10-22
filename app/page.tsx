"use client";

// Design Ref: §2 — 화면은 이 한 장이고, 입력 → 생성 중 → 결과 순으로 바뀐다.
// 생성 중 표시·취소, 실패 안내와 다시 시도, 결과 수정, 내려받기 전 창 닫기·새로고침 경고(작업 15)까지 연결돼 있다.
import { useEffect, useRef, useState } from "react";
import CountryForm from "@/components/CountryForm";
import ProgressView from "@/components/ProgressView";
import ReportView from "@/components/ReportView";
import { ReportRequestError, requestReport } from "@/lib/report/client";
import type { ProgressStep, Report } from "@/lib/report/types";

type ViewState =
  | { kind: "idle" }
  | { kind: "running"; country: string; current: ProgressStep | null }
  | { kind: "done"; report: Report }
  // country: 다시 시도할 때 쓸 국가명
  | { kind: "error"; message: string; country: string };

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
      setView({ kind: "error", message, country });
    }
  }

  function handleCancel() {
    if (view.kind !== "running") return;
    abortRef.current?.abort();
    setView({ kind: "error", message: "보고서 만들기를 취소했습니다.", country: view.country });
  }

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
          <CountryForm onSubmit={handleSubmit} disabled={view.kind === "running"} />
        </section>

        {view.kind === "running" && (
          <ProgressView country={view.country} current={view.current} onCancel={handleCancel} />
        )}

        {view.kind === "error" && (
          <section
            role="alert"
            className="flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 p-5 text-sm text-red-900 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-100"
          >
            <p>{view.message}</p>
            <button
              type="button"
              onClick={() => handleSubmit(view.country)}
              className="self-start rounded-md bg-foreground px-3 py-1.5 font-medium text-background hover:opacity-85"
            >
              {view.country} 다시 시도
            </button>
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
      </main>
    </div>
  );
}
