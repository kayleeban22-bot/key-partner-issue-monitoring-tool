// Design Ref: §8 시험 계획, §9 쪽수 측정 — 서버에서는 글자 수로 쪽수를 "추정"만 한다.
// 실제 쪽수는 내려받은 파일을 열어 확인한다(작업 13~16). 파일이 만들어지면 아래 CHARS_PER_PAGE를 실제 값에 맞춰 보정한다.
import { EMPTY_SECTION_TEXT } from "./outline";
import type { Report } from "./types";

// 워드 파일(본문 11pt, 여백 2.54cm, 줄 간격 18pt 고정, 출처 목록 9pt)을 실제로 열어 쪽수를 재서 맞춘 값이다. (작업 16)
// 이 계산법으로 센 글자 수가 약 4,200자일 때 3쪽이 가득 찬다(베트남·부탄 보고서에 글자를 더해 가며 측정).
export const CHARS_PER_PAGE = 1400;

// PRD 5번: 제목과 출처 목록을 포함해 A4 2쪽 이상 3쪽 이하
export const MIN_PAGES = 2;
export const MAX_PAGES = 3;

// 한 항목·하위 항목마다 제목 줄과 문단 사이 빈 줄이 차지하는 공간을 글자 수로 환산한 값
const BLOCK_OVERHEAD = 30;

// 보고서에 실리는 글자 수 (제목, 항목·하위 항목 제목, 본문, 출처 번호 표시, 출처 목록)
export function countReportChars(report: Report): number {
  let chars = report.title.length + BLOCK_OVERHEAD;

  for (const section of report.sections) {
    chars += `${section.no}. ${section.title}`.length + BLOCK_OVERHEAD;
    if (section.isEmpty) {
      chars += EMPTY_SECTION_TEXT.length;
      continue;
    }
    for (const sub of section.subsections) {
      if (section.subsections.length > 1) chars += sub.title.length + BLOCK_OVERHEAD;
      for (const sentence of sub.sentences) {
        chars += sentence.text.length + sentence.sourceIds.length * 3; // "[1]" 표시
      }
    }
  }

  chars += "출처 목록".length + BLOCK_OVERHEAD;
  for (const source of report.sources) {
    chars += `[${source.id}] ${source.org}, ${source.title}, ${source.date} 링크`.length;
  }
  return chars;
}

export function estimatePages(report: Report): number {
  return countReportChars(report) / CHARS_PER_PAGE;
}
