"use client";

// Design Ref: §2.2 — 보고서를 만드는 동안 단계별 진행 상황을 보여 준다. 경과 시간, 닫으면 사라진다는 안내, 취소 버튼을 함께 둔다.
import { useEffect, useState } from "react";
import type { ProgressStep } from "@/lib/report/types";

const STEPS: { step: ProgressStep; label: string }[] = [
  { step: "search", label: "자료 검색" },
  { step: "summarize", label: "요약·출처 정리" },
  { step: "compose", label: "보고서 작성" },
  { step: "verify", label: "검증" },
];

type Props = {
  country: string;
  // 서버가 마지막으로 알려 준 단계. 아직 아무것도 못 받았으면 null (첫 단계가 곧 시작된다)
  current: ProgressStep | null;
  onCancel: () => void;
};

export default function ProgressView({ country, current, onCancel }: Props) {
  const [seconds, setSeconds] = useState(0);

  // 이 화면이 나타난 뒤 흐른 시간을 센다. (오래 걸려도 멈춘 게 아니라는 것을 보여 주려는 용도)
  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // 아직 서버 소식이 없으면 첫 단계를 진행 중으로 본다.
  const currentIndex = current === null ? 0 : STEPS.findIndex((item) => item.step === current);

  return (
    <section
      aria-label="생성 진행 상황"
      role="status"
      className="flex flex-col gap-3 rounded-none border border-black/10 bg-white p-5 text-sm dark:border-white/20 dark:bg-black/80"
    >
      <p className="font-medium">
        {country} 보고서를 만들고 있습니다 <span className="font-normal text-zinc-500 dark:text-zinc-400">({seconds}초 경과)</span>
      </p>

      <ol className="flex flex-col gap-1.5">
        {STEPS.map(({ step, label }, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "waiting";
          return (
            <li
              key={step}
              aria-current={state === "active" ? "step" : undefined}
              className={`flex items-center gap-2 ${state === "waiting" ? "text-zinc-400 dark:text-zinc-500" : state === "active" ? "font-medium" : "text-zinc-600 dark:text-zinc-400"}`}
            >
              <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center">
                {state === "done" ? (
                  "✓"
                ) : state === "active" ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  "·"
                )}
              </span>
              {label}
              <span className="sr-only">{state === "done" ? " 완료" : state === "active" ? " 진행 중" : " 대기"}</span>
            </li>
          );
        })}
      </ol>

      <p className="text-amber-800 dark:text-amber-300">
        보통 10~30초 걸립니다. 이 창을 닫거나 새로고침하면 만들던 보고서가 사라집니다.
      </p>

      <button
        type="button"
        onClick={onCancel}
        className="self-start rounded-none border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        취소
      </button>
    </section>
  );
}
