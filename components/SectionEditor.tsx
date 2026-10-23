"use client";

// Design Ref: §2.3 — [수정]을 누르면 항목이 그 자리에서 글 상자로 바뀌어 문장을 직접 고칠 수 있다.
// 문장 하나가 글 상자 하나이고, 출처 번호는 문장에 붙어 다닌다. 저장하면 빈 항목과 출처 목록이 다시 정리된다(edit.ts).
import { useEffect, useRef, useState } from "react";
import { fromDraft, newDraftSentence, toDraft } from "@/lib/report/edit";
import type { DraftSection } from "@/lib/report/edit";
import { EMPTY_SECTION_TEXT } from "@/lib/report/outline";
import { findForbiddenInText } from "@/lib/report/phrases";
import type { Section } from "@/lib/report/types";

const BUTTON =
  "rounded-none border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";
const PRIMARY_BUTTON =
  "rounded-none bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark";

// 글자 수에 맞춰 높이가 늘어나는 글 상자
function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={2} {...props} />;
}

type Props = {
  section: Section;
  onSave: (section: Section) => void;
  onCancel: () => void;
};

export default function SectionEditor({ section, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<DraftSection>(() => toDraft(section));
  const headingId = `section-${section.no}`;
  // 하위 항목이 하나뿐이면 항목 제목과 겹치므로 하위 제목은 숨긴다.
  const showSubsectionTitles = draft.subsections.length > 1;

  const updateSentences = (
    subIndex: number,
    change: (sentences: DraftSection["subsections"][number]["sentences"]) => DraftSection["subsections"][number]["sentences"],
  ) =>
    setDraft((current) => ({
      ...current,
      subsections: current.subsections.map((sub, index) =>
        index === subIndex ? { ...sub, sentences: change(sub.sentences) } : sub,
      ),
    }));

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 rounded-none border border-blue-300 bg-blue-50/40 p-4 dark:border-blue-700/60 dark:bg-blue-950/20">
      <h3 id={headingId} className="text-lg font-semibold">
        {section.no}. {section.title} <span className="text-sm font-normal text-blue-700 dark:text-blue-300">(수정 중)</span>
      </h3>

      {draft.subsections.map((sub, subIndex) => (
        <div key={sub.title} className="flex flex-col gap-2">
          {showSubsectionTitles && (
            <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{sub.title}</h4>
          )}

          {sub.sentences.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {EMPTY_SECTION_TEXT} — 아래 [문장 추가]로 직접 쓸 수 있습니다
            </p>
          )}

          {sub.sentences.map((sentence) => {
            const forbidden = findForbiddenInText(sentence.text);
            return (
              <div key={sentence.key} className="flex flex-col gap-1">
                <AutoTextarea
                  value={sentence.text}
                  aria-label={`${sub.title} 문장`}
                  onChange={(event) =>
                    updateSentences(subIndex, (list) =>
                      list.map((item) => (item.key === sentence.key ? { ...item, text: event.target.value } : item)),
                    )
                  }
                  className="w-full resize-none overflow-hidden rounded-none border border-black/20 bg-white px-3 py-2 leading-7 outline-none focus:border-black dark:border-white/25 dark:bg-black/80 dark:focus:border-white"
                />
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {sentence.sourceIds.length === 0 ? (
                    <span className="text-zinc-500 dark:text-zinc-400">출처 없음</span>
                  ) : (
                    sentence.sourceIds.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100">
                        [{id}]
                        <button
                          type="button"
                          aria-label={`출처 ${id}번 떼기`}
                          onClick={() =>
                            updateSentences(subIndex, (list) =>
                              list.map((item) =>
                                item.key === sentence.key
                                  ? { ...item, sourceIds: item.sourceIds.filter((value) => value !== id) }
                                  : item,
                              ),
                            )
                          }
                          className="hover:text-red-600"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => updateSentences(subIndex, (list) => list.filter((item) => item.key !== sentence.key))}
                    className="ml-auto text-red-700 hover:underline dark:text-red-400"
                  >
                    문장 삭제
                  </button>
                </div>
                {forbidden.length > 0 && (
                  <p role="alert" className="text-xs text-amber-800 dark:text-amber-300">
                    {`"${forbidden.join('", "')}" 표현이 들어 있습니다. 상급자에게 바로 올릴 보고서에는 쓰지 않는 표현입니다.`}
                  </p>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => updateSentences(subIndex, (list) => [...list, newDraftSentence()])}
            className={`${BUTTON} self-start`}
          >
            + 문장 추가
          </button>
        </div>
      ))}

      <div className="flex gap-2">
        <button type="button" onClick={() => onSave(fromDraft(draft))} className={PRIMARY_BUTTON}>
          저장
        </button>
        <button type="button" onClick={onCancel} className={BUTTON}>
          취소
        </button>
      </div>
    </section>
  );
}
