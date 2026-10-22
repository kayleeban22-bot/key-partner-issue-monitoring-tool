// Design Ref: §3.2 ⑥ — 최종 검사. 보고서가 약속한 모양과 규칙을 지키는지 한 번 더 확인하고, 담당자가 알아야 할 점은 경고로 남긴다.
//   - 목차 순서·이름·하위 항목, 핵심 주장의 출처, 빈 항목 목록 (reportSchema가 확인한다)   — Plan SC: S2·S4·S5
//   - "초안" 같은 금지 문구가 없는지                                                       — PRD 5번 must 2
//   - A4 2쪽 이상 3쪽 이하인지 (글자 수로 추정)                                             — Plan SC: S3
import { MAX_PAGES, MIN_PAGES, estimatePages } from "./layout";
import { reportSchema } from "./schema";
import type { Report } from "./types";

// 보고서 자체를 "초안/예시"처럼 보이게 하는 표현. 상급자에게 바로 올릴 문서이므로 들어가면 안 된다.
export const FORBIDDEN_PHRASES = ["초안", "(예시)", "예시 보고서", "샘플", "임시본"];

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

// 규칙에 맞지 않으면 오류를 던지고(호출한 쪽이 쉬운 문구로 바꿔 보낸다), 맞으면 경고를 더한 보고서를 돌려준다.
export function verifyReport(report: Report): Report {
  const checked = reportSchema.parse(report);
  const warnings = [...checked.warnings];

  const forbidden = findForbiddenPhrases(checked);
  if (forbidden.length > 0) {
    warnings.push(
      `보고서에 "${forbidden.join('", "')}" 표현이 들어 있습니다. 자료 원문에서 온 말일 수 있으니 확인해 주세요.`,
    );
  }

  const pages = estimatePages(checked);
  if (pages < MIN_PAGES) {
    warnings.push(
      `분량이 약 ${pages.toFixed(1)}쪽으로 ${MIN_PAGES}쪽에 못 미칩니다. 자료가 적어 내용을 지어내거나 채우지 않았습니다. (글자 수로 추정한 값입니다)`,
    );
  } else if (pages > MAX_PAGES) {
    warnings.push(
      `분량이 약 ${pages.toFixed(1)}쪽으로 ${MAX_PAGES}쪽을 넘을 수 있습니다. 내려받은 파일을 열어 쪽수를 확인해 주세요. (글자 수로 추정한 값입니다)`,
    );
  }

  return { ...checked, warnings };
}
