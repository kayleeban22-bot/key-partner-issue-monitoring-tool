// Design Ref: §2.3 — 보고서 제목, 6개 항목 본문(문장 끝 출처 번호), 출처 목록을 위에서 아래로 보여 준다.
// 보기만 하는 부분이다. 수정(작업 12), 빈 항목 안내(작업 11), 내려받기(작업 13·14)는 이어서 붙인다.
import { EMPTY_SECTION_TEXT } from "@/lib/report/outline";
import type { Report, Section, Source } from "@/lib/report/types";

// 본문 문장 끝의 [1] 같은 번호. 누르면 아래 출처 목록의 해당 줄로 이동한다.
function Citations({ ids }: { ids: number[] }) {
  if (ids.length === 0) return null;
  return (
    <sup className="ml-0.5 whitespace-nowrap text-xs">
      {ids.map((id) => (
        <a
          key={id}
          href={`#source-${id}`}
          aria-label={`출처 ${id}번`}
          className="px-0.5 text-blue-700 hover:underline dark:text-blue-400"
        >
          [{id}]
        </a>
      ))}
    </sup>
  );
}

function SectionView({ section }: { section: Section }) {
  const headingId = `section-${section.no}`;
  // 하위 항목이 하나뿐이면 항목 제목과 겹치므로 하위 제목은 숨긴다.
  const showSubsectionTitles = section.subsections.length > 1;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-lg font-semibold">
        {section.no}. {section.title}
      </h3>

      {section.isEmpty ? (
        <p className="text-zinc-500 dark:text-zinc-400">{EMPTY_SECTION_TEXT}</p>
      ) : (
        section.subsections.map((sub) => (
          <div key={sub.title} className="flex flex-col gap-1">
            {showSubsectionTitles && (
              <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {sub.title}
              </h4>
            )}
            <p className="leading-7">
              {sub.sentences.map((sentence, index) => (
                <span key={index}>
                  {index > 0 && " "}
                  {sentence.text}
                  <Citations ids={sentence.sourceIds} />
                </span>
              ))}
            </p>
          </div>
        ))
      )}
    </section>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <section aria-labelledby="source-list-title" className="flex flex-col gap-3">
      <h3 id="source-list-title" className="text-lg font-semibold">
        출처 목록
      </h3>
      {sources.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">등록된 출처가 없습니다</p>
      ) : (
        <ol className="flex flex-col gap-2 text-sm">
          {sources.map((source) => (
            <li key={source.id} id={`source-${source.id}`} className="scroll-mt-4 leading-6">
              <span className="font-medium">[{source.id}]</span> {source.org}, {source.title},{" "}
              {source.date}
              {source.isOld && (
                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  과거 자료
                </span>
              )}{" "}
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-blue-700 hover:underline dark:text-blue-400"
              >
                링크
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function ReportView({ report }: { report: Report }) {
  return (
    <article
      aria-label="생성된 보고서"
      className="flex flex-col gap-8 rounded-xl border border-black/10 bg-white p-5 dark:border-white/15 dark:bg-zinc-900 sm:p-8"
    >
      <h2 className="text-2xl font-bold tracking-tight">{report.title}</h2>
      {report.sections.map((section) => (
        <SectionView key={section.no} section={section} />
      ))}
      <hr className="border-black/10 dark:border-white/15" />
      <SourceList sources={report.sources} />
    </article>
  );
}
