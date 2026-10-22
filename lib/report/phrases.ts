// 보고서에 들어가면 안 되는 표현. 보고서 자체를 "초안/예시"처럼 보이게 하는 말이다.
// 서버의 최종 검사(verify.ts)와 브라우저의 수정 기능이 함께 쓰도록 서버 전용 import 없이 둔다.
import type { Report } from "./types";

export const FORBIDDEN_PHRASES = ["초안", "(예시)", "예시 보고서", "샘플", "임시본"];

// 글 한 줄에서 금지 문구를 찾는다.
export function findForbiddenInText(text: string): string[] {
  return FORBIDDEN_PHRASES.filter((phrase) => text.includes(phrase));
}

// 제목과 본문에서 금지 문구를 찾는다. (경고 문구는 파일에 들어가지 않으므로 검사하지 않는다)
export function findForbiddenPhrases(report: Report): string[] {
  const texts = [
    report.title,
    ...report.sections.flatMap((section) =>
      section.subsections.flatMap((sub) => sub.sentences.map((sentence) => sentence.text)),
    ),
  ];
  return FORBIDDEN_PHRASES.filter((phrase) => texts.some((text) => text.includes(phrase)));
}
