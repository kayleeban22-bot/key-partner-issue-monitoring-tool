// 임시 코드: 화면과 서버가 끝까지 이어지는지 보려고 만든 가짜 보고서이다.
// 실제 자료 검색·요약·작성(작업 6~9)이 연결되면 이 파일은 쓰지 않는다.
import { SECTION_OUTLINE, reportSchema } from "./schema";
import type { Report } from "./types";

export function buildFakeReport(country: string): Report {
  const report: Report = {
    title: `${country} 경제협력 현황 보고`,
    country,
    createdAt: new Date().toISOString(),
    sections: SECTION_OUTLINE.map((outline) => ({
      no: outline.no,
      title: outline.title,
      isEmpty: false,
      subsections: outline.subsections.map((title) => ({
        title,
        sentences: [
          {
            text: `(예시) ${country}의 "${title}" 내용이 여기에 들어갑니다.`,
            sourceIds: [1],
            isKeyClaim: false,
          },
        ],
      })),
    })),
    sources: [
      {
        id: 1,
        org: "예시 기관",
        title: "예시 자료",
        date: "2026-01-01",
        url: "https://example.com/sample",
        isOld: false,
      },
    ],
    emptySectionNos: [],
    warnings: ["예시 보고서입니다. 실제 자료 조사는 이후 작업에서 연결됩니다."],
  };
  // 가짜라도 실제 보고서와 같은 검사 규칙을 통과하는지 확인해 둔다.
  return reportSchema.parse(report);
}
