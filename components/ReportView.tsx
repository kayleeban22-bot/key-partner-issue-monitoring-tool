// Design Ref: §2.3 — 보고서 제목, 담당자 안내(빈 항목·확인할 점), 6개 항목 본문(문장 끝 출처 번호), 출처 목록을 위에서 아래로 보여 준다.
// 수정(작업 12)과 내려받기(작업 13·14)는 이어서 붙인다.
import { EMPTY_SECTION_TEXT } from "@/lib/report/outline";
import type { Report, Section, Source } from "@/lib/report/types";

// 안내 상자의 공통 모양. 담당자에게만 보이고, 내려받는 보고서 파일에는 들어가지 않는다.
const NOTICE_BOX =
  "flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100";

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

// Plan SC: S5 — 자료가 없어 "공개 자료 없음"이 된 항목을 담당자에게 따로 알린다.
function EmptySectionsNotice({ report }: { report: Report }) {
  if (report.emptySectionNos.length === 0) return null;
  const titles = new Map(report.sections.map((section) => [section.no, section.title]));

  return (
    <aside aria-label="자료가 없는 항목 안내" className={NOTICE_BOX}>
      <p className="font-semibold">자료가 없는 항목 {report.emptySectionNos.length}개</p>
      <ul className="flex flex-col gap-1">
        {report.emptySectionNos.map((no) => (
          <li key={no}>
            <a href={`#section-${no}`} className="underline underline-offset-2 hover:no-underline">
              {no}. {titles.get(no)}
            </a>
          </li>
        ))}
      </ul>
      <p>{`이 항목은 보고서에 "${EMPTY_SECTION_TEXT}"으로 표시됩니다. 필요하면 직접 자료를 보완해 주세요.`}</p>
    </aside>
  );
}

// 서버가 남긴 경고(분량, 뺀 문장, AI 사용 불가 등). 담당자가 알아야 할 점만 모아 보여 준다.
function WarningsNotice({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <aside aria-label="확인할 점" className={NOTICE_BOX}>
      <p className="font-semibold">확인할 점</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {warnings.map((warning, index) => (
          <li key={index}>{warning}</li>
        ))}
      </ul>
    </aside>
  );
}

export default function ReportView({ report }: { report: Report }) {
  return (
    <article
      aria-label="생성된 보고서"
      className="flex flex-col gap-8 rounded-xl border border-black/10 bg-white p-5 dark:border-white/15 dark:bg-zinc-900 sm:p-8"
    >
      <h2 className="text-2xl font-bold tracking-tight">{report.title}</h2>
      <EmptySectionsNotice report={report} />
      <WarningsNotice warnings={report.warnings} />
      {report.sections.map((section) => (
        <SectionView key={section.no} section={section} />
      ))}
      <hr className="border-black/10 dark:border-white/15" />
      <SourceList sources={report.sources} />
    </article>
  );
}
