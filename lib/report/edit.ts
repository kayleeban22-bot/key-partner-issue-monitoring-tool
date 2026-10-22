// Design Ref: §2.3 — 담당자가 화면에서 항목의 글을 직접 고칠 때 쓰는 순수 함수들.
// 문장 단위로 고치고(출처 번호는 문장에 붙어 다닌다), 저장하면 빈 항목·출처 목록을 다시 정리한다.
// 서버 전용 import가 없어 브라우저에서 그대로 쓴다.
import { EMPTY_SECTION_TEXT, SECTION_OUTLINE } from "./outline";
import { compactSources } from "./sources";
import type { Report, Section } from "./types";

export type DraftSentence = {
  key: string; // 화면에서 문장을 구분하는 값 (저장되지 않음)
  text: string;
  sourceIds: number[];
};
export type DraftSubsection = { title: string; sentences: DraftSentence[] };
export type DraftSection = { no: Section["no"]; title: string; subsections: DraftSubsection[] };

let sequence = 0;
const nextKey = () => `draft-${(sequence += 1)}`;

export function newDraftSentence(text = "", sourceIds: number[] = []): DraftSentence {
  return { key: nextKey(), text, sourceIds: [...sourceIds] };
}

// 항목을 고칠 수 있는 초안으로 바꾼다. "공개 자료 없음" 한 줄은 문장이 아니라 빈 자리 표시이므로 뺀다.
// 자료가 없던 항목은 표준 하위 항목을 모두 빈 칸으로 만들어 글을 새로 쓸 수 있게 한다.
export function toDraft(section: Section): DraftSection {
  const outline = SECTION_OUTLINE[section.no - 1];
  const existing = new Map(section.subsections.map((sub) => [sub.title, sub]));

  return {
    no: section.no,
    title: section.title,
    subsections: outline.subsections.map((title) => ({
      title,
      sentences: (existing.get(title)?.sentences ?? [])
        .filter((sentence) => sentence.text !== EMPTY_SECTION_TEXT)
        .map((sentence) => newDraftSentence(sentence.text, sentence.sourceIds)),
    })),
  };
}

// 초안을 보고서 항목으로 되돌린다.
// - 내용이 빈 문장은 버리고, 하위 항목에 문장이 없으면 "공개 자료 없음" 한 줄을 둔다.
// - 모든 하위 항목에 문장이 없으면 항목 전체를 빈 항목으로 만든다.
// - 출처가 붙은 문장만 핵심 주장(isKeyClaim)이다. 직접 쓴 문장과 출처를 뗀 문장은 출처 없이 둘 수 있다.
export function fromDraft(draft: DraftSection): Section {
  const subsections = draft.subsections.map((sub) => ({
    title: sub.title,
    sentences: sub.sentences
      .map((sentence) => ({ ...sentence, text: sentence.text.replace(/\s+/g, " ").trim() }))
      .filter((sentence) => sentence.text.length > 0)
      .map((sentence) => ({
        text: sentence.text,
        sourceIds: [...sentence.sourceIds],
        isKeyClaim: sentence.sourceIds.length > 0,
      })),
  }));

  if (subsections.every((sub) => sub.sentences.length === 0)) {
    return { no: draft.no, title: draft.title, isEmpty: true, subsections: [] };
  }
  return {
    no: draft.no,
    title: draft.title,
    isEmpty: false,
    subsections: subsections.map((sub) => ({
      title: sub.title,
      sentences:
        sub.sentences.length > 0
          ? sub.sentences
          : [{ text: EMPTY_SECTION_TEXT, sourceIds: [], isKeyClaim: false }],
    })),
  };
}

// 고친 항목을 보고서에 넣고, 빈 항목 목록과 출처 목록(안 쓰는 출처 제거, 번호 다시 매김)을 다시 정리한다.
export function applySection(report: Report, section: Section): Report {
  const sections = report.sections.map((current) => (current.no === section.no ? section : current));
  const compact = compactSources(sections, report.sources);
  return {
    ...report,
    sections: compact.sections,
    sources: compact.sources,
    emptySectionNos: compact.sections.filter((s) => s.isEmpty).map((s) => s.no),
  };
}
