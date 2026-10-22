// 보고서의 출처 목록을 정리한다. 서버(본문 작성)와 브라우저(수정 기능) 모두 쓰므로 서버 전용 import가 없는 순수 함수만 둔다.
import type { Section, Source } from "./types";

// 쓰인 출처만 남기고, 본문에 처음 나오는 순서대로 1번부터 다시 매긴다. (안 쓴 출처가 쪽수만 차지하지 않게)
export function compactSources(
  sections: Section[],
  sources: Source[],
): { sections: Section[]; sources: Source[] } {
  const order: number[] = [];
  for (const section of sections) {
    for (const sub of section.subsections) {
      for (const sentence of sub.sentences) {
        for (const id of sentence.sourceIds) if (!order.includes(id)) order.push(id);
      }
    }
  }
  const newId = new Map(order.map((oldId, index) => [oldId, index + 1]));
  const byId = new Map(sources.map((source) => [source.id, source]));

  return {
    sections: sections.map((section) => ({
      ...section,
      subsections: section.subsections.map((sub) => ({
        ...sub,
        sentences: sub.sentences.map((sentence) => ({
          ...sentence,
          sourceIds: sentence.sourceIds.map((id) => newId.get(id) as number),
        })),
      })),
    })),
    sources: order.map((oldId) => {
      const source = byId.get(oldId) as Source;
      return {
        id: newId.get(oldId) as number,
        org: source.org,
        title: source.title,
        date: source.date,
        url: source.url,
        isOld: source.isOld,
      };
    }),
  };
}
