"use client";

// Design Ref: §2.1 — 국가명 입력창과 "보고서 생성" 버튼. 빈 값이면 입력창 아래에 안내 문구를 보여 준다.
import { useId, useState } from "react";

// 서버도 한 번 더 검사한다(작업 4). 화면에서는 바로 알려 주려고 같은 기준을 먼저 쓴다.
const MAX_COUNTRY_LENGTH = 50;

type Props = {
  // 검사를 통과한 국가명(앞뒤 공백 제거)을 넘긴다.
  onSubmit: (country: string) => void;
  disabled?: boolean;
};

export default function CountryForm({ onSubmit, disabled = false }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const messageId = useId();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const country = value.trim();
    if (country.length === 0) {
      setError("국가명을 입력해 주세요");
      return;
    }
    if (country.length > MAX_COUNTRY_LENGTH) {
      setError(`국가명은 ${MAX_COUNTRY_LENGTH}자 이하로 입력해 주세요`);
      return;
    }
    setError(null);
    onSubmit(country);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <label htmlFor={inputId} className="text-sm font-medium">
        국가명
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (error) setError(null);
        }}
        placeholder="예: 베트남"
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        disabled={disabled}
        className="h-12 w-full rounded-lg border border-black/20 bg-transparent px-4 text-base outline-none focus:border-black dark:border-white/25 dark:focus:border-white"
      />
      <p
        id={messageId}
        role={error ? "alert" : undefined}
        className={
          error
            ? "text-sm text-red-600 dark:text-red-400"
            : "text-sm text-zinc-600 dark:text-zinc-400"
        }
      >
        {error ?? "공개 자료만 사용합니다. 비공개 정보는 입력하지 마세요."}
      </p>
      <button
        type="submit"
        disabled={disabled}
        className="h-12 self-end rounded-lg bg-foreground px-6 text-base font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        보고서 생성
      </button>
    </form>
  );
}
