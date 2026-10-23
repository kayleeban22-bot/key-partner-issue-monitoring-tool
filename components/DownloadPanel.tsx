"use client";

// Design Ref: §2.3 — [내려받기]를 누르면 지금 화면의(수정한) 보고서를 워드(.docx) 파일로 받는다.
// 서버에는 저장하지 않으므로 내려받기가 유일한 저장 수단이다.
// 한글(.hwpx)은 따로 만들지 않는다. 워드 파일을 한글에서 열 수 있다.
import { useState } from "react";
import type { Report } from "@/lib/report/types";

// 서버가 보낸 Content-Disposition에서 파일 이름을 꺼낸다. (없으면 국가명으로 만든다)
function fileNameFrom(header: string | null, fallback: string): string {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // 이름을 읽지 못하면 아래 기본값을 쓴다.
    }
  }
  return fallback;
}

type Props = {
  report: Report;
  // 이 보고서(수정본 포함)를 이미 내려받았는지. 수정하면 다시 false가 된다.
  downloaded: boolean;
  onDownloaded: () => void;
};

export default function DownloadPanel({ report, downloaded, onDownloaded }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report, format: "docx" }),
      });
      if (!response.ok) {
        let message = "파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
        try {
          const data = (await response.json()) as { message?: string };
          if (data.message) message = data.message;
        } catch {
          // 본문이 JSON이 아니면 기본 문구를 쓴다.
        }
        setError(message);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileNameFrom(response.headers.get("Content-Disposition"), `${report.country}.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      onDownloaded();
    } catch {
      setError("파일을 받지 못했습니다. 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="내려받기" className="flex flex-col gap-3 rounded-none border border-black/10 p-4 dark:border-white/20">
      <p className="text-sm font-medium">워드(.docx) 파일로 내려받습니다. 한글에서도 열 수 있습니다.</p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="rounded-none bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? "만드는 중…" : "내려받기"}
        </button>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">서버에 저장되지 않습니다. 꼭 내려받아 보관하세요.</p>
      </div>

      {/* 내려받았는지 눈에 띄게 알려 준다. 안 받았으면 창을 닫을 때 브라우저가 한 번 더 묻는다. */}
      <p
        role="status"
        className={`text-sm font-medium ${downloaded ? "text-green-700 dark:text-green-400" : "text-amber-800 dark:text-amber-300"}`}
      >
        {downloaded
          ? "✓ 내려받았습니다. 고치면 다시 내려받아야 합니다."
          : "아직 내려받지 않았습니다. 이 창을 닫거나 새로고침하면 보고서가 사라집니다."}
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
