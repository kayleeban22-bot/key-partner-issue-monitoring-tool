// 임시 코드: 화면과 서버가 끝까지 이어지는지 보려고 만든 가짜 보고서이다.
// 출처 목록은 실제 검색 결과(작업 6), 본문은 규칙을 통과한 실제 요약 조각(작업 7·8)을 담는다.
// 자료가 없는 항목은 "공개 자료 없음"(빈 항목)으로 처리한다(작업 8).
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
  notes: string[] = [],
): Report {
  // Plan SC: S5 — 자료(요약 조각)가 하나도 없는 항목은 비워 두고, 담당자에게 따로 알릴 빈 항목 목록에 올린다.
  const emptySectionNos = SECTION_OUTLINE.filter(
    (outline) => !pieces.some((piece) => piece.topic === outline.no),
  ).map((outline) => outline.no);

  const report: Report = {
    title: `${country} 경제협력 현황 보고`,
    country,
    createdAt: new Date().toISOString(),
    sections: SECTION_OUTLINE.map((outline) => {
      const own = pieces.filter((piece) => piece.topic === outline.no);
      if (own.length === 0) {
        return { no: outline.no, title: outline.title, isEmpty: true, subsections: [] };
      }
      return {
        no: outline.no,
        title: outline.title,
        isEmpty: false,
        subsections: outline.subsections.map((title, index) => ({
          title,
          sentences:
            index === 0
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
    sources,
    emptySectionNos,
    warnings: [
      `자료 ${sources.length}건을 찾아 요약 ${pieces.length}개를 만들었습니다. 항목별 본문 작성은 이후 작업에서 연결됩니다.`,
      ...notes,
    ],
  };
  // 가짜라도 실제 보고서와 같은 검사 규칙을 통과하는지 확인해 둔다.
  return reportSchema.parse(report);
}
