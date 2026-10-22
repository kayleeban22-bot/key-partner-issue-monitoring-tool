// 임시 코드: 화면과 서버가 끝까지 이어지는지 보려고 만든 가짜 보고서이다.
// 출처 목록은 실제 검색 결과(작업 6), 본문은 실제 요약 조각(작업 7)을 담을 수 있다.
// 요약 조각을 항목별 하위 항목에 알맞게 배치하는 일은 작업 9에서 한다. 지금은 항목마다 첫 하위 항목에 모아 둔다.
// 작업 9가 끝나면 이 파일은 쓰지 않는다.
import { SECTION_OUTLINE, reportSchema } from "./schema";
import type { Report, Source, SummaryPiece } from "./types";

// 숫자가 들어 있는 문장은 핵심 주장으로 본다. (정확한 기준은 작업 8·9에서 다듬는다)
const hasNumber = (text: string) => /\d/.test(text);

export function buildFakeReport(
  country: string,
  sources: Source[] = [],
  pieces: SummaryPiece[] = [],
): Report {
  const report: Report = {
    title: `${country} 경제협력 현황 보고`,
    country,
    createdAt: new Date().toISOString(),
    sections: SECTION_OUTLINE.map((outline) => {
      const own = pieces.filter((piece) => piece.topic === outline.no);
      return {
        no: outline.no,
        title: outline.title,
        isEmpty: false,
        subsections: outline.subsections.map((title, index) => ({
          title,
          sentences:
            index === 0 && own.length > 0
              ? own.map((piece) => ({
                  text: piece.text,
                  sourceIds: [piece.sourceId],
                  isKeyClaim: hasNumber(piece.text),
                }))
              : [
                  {
                    text: `(예시) ${country}의 "${title}" 내용이 여기에 들어갑니다.`,
                    sourceIds: [],
                    isKeyClaim: false,
                  },
                ],
        })),
      };
    }),
    // 검색으로 찾은 자료가 있으면 그대로 담고, 없으면 예시 출처 한 건을 둔다.
    sources:
      sources.length > 0
        ? sources
        : [
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
    warnings: [
      sources.length > 0
        ? `자료 ${sources.length}건을 찾아 요약 ${pieces.length}개를 만들었습니다. 항목별 본문 작성은 이후 작업에서 연결됩니다.`
        : "예시 보고서입니다. 실제 자료 조사는 이후 작업에서 연결됩니다.",
    ],
  };
  // 가짜라도 실제 보고서와 같은 검사 규칙을 통과하는지 확인해 둔다.
  return reportSchema.parse(report);
}
