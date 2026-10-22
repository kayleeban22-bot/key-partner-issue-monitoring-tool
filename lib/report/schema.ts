// Design Ref: §3.3 — 서버와 화면이 주고받는 데이터의 모양과 검사 규칙을 한 곳에 둔다.
// 타입은 여기서 만든 규칙에서 뽑아 쓰므로(types.ts), 규칙과 타입이 어긋날 수 없다.
import { z } from "zod";

// Plan SC: S2 — 표준 목차 6개 항목의 순서·이름·괄호 안 하위 항목을 100% 따르게 하는 기준표.
// PRD.md 5번 "표준 목차"와 같아야 한다. 1번 항목은 괄호 안 하위 항목이 없어 "국가 개요" 하나로 둔다.
export const SECTION_OUTLINE = [
  { no: 1, title: "간략한 국가 개요", subsections: ["국가 개요"] },
  {
    no: 2,
    title: "정치 동향",
    subsections: ["지정학적 위치 및 이슈", "대외관계", "정치동향"],
  },
  {
    no: 3,
    title: "경제 동향",
    subsections: ["국영기업 해외 투자 프로젝트", "경제동향 및 전망", "GDP·FDI 등"],
  },
  {
    no: 4,
    title: "주요 산업 현황 및 정책",
    subsections: ["우리 기업 수주 추진 현황", "산업 정책적 특징"],
  },
  {
    no: 5,
    title: "우리나라와의 관계",
    subsections: ["교역현황", "수주 및 투자 현황", "전략적 중요성"],
  },
  { no: 6, title: "경제외교 현황", subsections: ["주요 MOU 체결 현황"] },
] as const;

// 자료가 없는 항목의 본문. 화면과 파일 모두 이 문구 한 줄만 쓴다.
export const EMPTY_SECTION_TEXT = "공개 자료 없음";

// 발행일은 있는 만큼만 적는다: "2026", "2026-03", "2026-03-01"
const publishedDateSchema = z
  .string()
  .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "발행일은 YYYY, YYYY-MM, YYYY-MM-DD 중 하나여야 합니다");

export const sourceSchema = z.object({
  id: z.number().int().positive(), // 본문의 [1] 번호
  org: z.string().min(1), // 기관명
  title: z.string().min(1),
  date: publishedDateSchema,
  url: z.url(),
  isOld: z.boolean(), // 보고서 생성일 기준 12개월 초과면 true → "과거 자료" 표시
});

// 서버 안에서만 쓴다. 숫자를 원문과 대조하려고 발췌를 함께 들고 있고, 브라우저로는 보내지 않는다.
export const rawSourceSchema = sourceSchema.extend({
  excerpt: z.string(),
});

export const sentenceSchema = z.object({
  text: z.string().min(1),
  sourceIds: z.array(z.number().int().positive()),
  // 숫자나 사실을 담은 문장(핵심 주장). true면 sourceIds가 비어 있으면 안 된다.
  isKeyClaim: z.boolean(),
});

export const subsectionSchema = z.object({
  title: z.string().min(1),
  sentences: z.array(sentenceSchema),
});

export const sectionNoSchema = z.literal([1, 2, 3, 4, 5, 6]);

export const sectionSchema = z.object({
  no: sectionNoSchema,
  title: z.string().min(1), // 표준 목차 이름 (고정)
  // 자료가 없는 항목(isEmpty)은 빈 배열이고, 화면·파일에서 EMPTY_SECTION_TEXT 한 줄만 보여 준다.
  subsections: z.array(subsectionSchema),
  isEmpty: z.boolean(),
});

export const reportSchema = z
  .object({
    title: z.string().min(1), // 예: "베트남 경제협력 현황 보고"
    country: z.string().min(1),
    createdAt: z.iso.datetime(),
    sections: z.array(sectionSchema).length(6), // 항상 6개, 표준 순서
    sources: z.array(sourceSchema),
    emptySectionNos: z.array(sectionNoSchema), // 담당자에게 따로 알릴 빈 항목 (파일에는 넣지 않음)
    warnings: z.array(z.string()), // 예: "자료가 적어 2쪽에 못 미침" (파일에는 넣지 않음)
  })
  .superRefine((report, ctx) => {
    // Plan SC: S2 — 표준 목차의 순서·이름·하위 항목을 그대로 따르는지 확인한다.
    report.sections.forEach((section, index) => {
      const outline = SECTION_OUTLINE[index];
      if (section.no !== outline.no || section.title !== outline.title) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", index],
          message: `${index + 1}번째 항목은 "${outline.no}. ${outline.title}"이어야 합니다`,
        });
        return;
      }
      if (section.isEmpty) {
        if (section.subsections.length > 0) {
          ctx.addIssue({
            code: "custom",
            path: ["sections", index, "subsections"],
            message: "자료가 없는 항목은 하위 항목이 비어 있어야 합니다",
          });
        }
        return;
      }
      const titles = section.subsections.map((sub) => sub.title);
      if (titles.join("|") !== outline.subsections.join("|")) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", index, "subsections"],
          message: `하위 항목은 ${outline.subsections.join(", ")} 순서여야 합니다`,
        });
      }
    });

    // 빈 항목 목록은 실제로 비어 있는 항목과 정확히 같아야 한다.
    const empty = report.sections.filter((s) => s.isEmpty).map((s) => s.no);
    if (empty.join(",") !== [...report.emptySectionNos].sort((a, b) => a - b).join(",")) {
      ctx.addIssue({
        code: "custom",
        path: ["emptySectionNos"],
        message: "emptySectionNos가 isEmpty인 항목과 다릅니다",
      });
    }

    // 출처 번호는 겹치지 않아야 하고, 문장이 가리키는 번호는 출처 목록에 있어야 한다.
    const ids = new Set<number>();
    report.sources.forEach((source, index) => {
      if (ids.has(source.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["sources", index, "id"],
          message: `출처 번호 ${source.id}가 중복됩니다`,
        });
      }
      ids.add(source.id);
    });

    // Plan SC: S4 — 핵심 주장마다 출처가 붙어야 한다.
    report.sections.forEach((section, si) => {
      section.subsections.forEach((sub, bi) => {
        sub.sentences.forEach((sentence, ci) => {
          const path = ["sections", si, "subsections", bi, "sentences", ci];
          if (sentence.isKeyClaim && sentence.sourceIds.length === 0) {
            ctx.addIssue({
              code: "custom",
              path: [...path, "sourceIds"],
              message: "핵심 주장에는 출처가 하나 이상 있어야 합니다",
            });
          }
          sentence.sourceIds.forEach((id) => {
            if (!ids.has(id)) {
              ctx.addIssue({
                code: "custom",
                path: [...path, "sourceIds"],
                message: `출처 번호 ${id}가 출처 목록에 없습니다`,
              });
            }
          });
        });
      });
    });
  });

// /api/report가 진행 중에 흘려 보내는 조각
export const progressStepSchema = z.enum(["search", "summarize", "compose", "verify"]);

export const streamChunkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("progress"), step: progressStepSchema }),
  // 쉬운 한국어 문구. 키나 내부 정보는 넣지 않는다.
  z.object({ type: z.literal("error"), message: z.string().min(1) }),
  z.object({ type: z.literal("done"), report: reportSchema }),
]);
