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
    <form onSubmit={handleSubmit} noValidate className="flex flex-col items-center gap-3">
      <div className="flex w-full flex-col gap-2.5 sm:flex-row">
        <label htmlFor={inputId} className="sr-only">
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
          placeholder="국가명 (예: 베트남)"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          disabled={disabled}
          className="glass-input h-[46px] w-full sm:flex-1 rounded-full px-5 text-center text-[15px] text-white outline-none placeholder:text-white/55 sm:text-left"
        />
        <button type="submit" disabled={disabled} className="btn-light sm:w-auto">
          <span>보고서 생성</span>
          <svg width="13" height="11" viewBox="0 0 12 10" fill="none" aria-hidden>
            <path d="M0.8 5h10M7.1 1.4 10.9 5l-3.8 3.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <p
        id={messageId}
        role={error ? "alert" : undefined}
        className={error ? "text-sm text-red-400" : "text-[0.8rem] font-light text-[#cfcfcf]"}
      >
        {error ?? "공개 자료만 사용합니다. 비공개 정보는 입력하지 마세요."}
      </p>
    </form>
  );
}
