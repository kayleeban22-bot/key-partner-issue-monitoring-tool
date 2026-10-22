// Design Ref: §3.3 — 서버와 화면이 주고받는 데이터의 모양과 검사 규칙을 한 곳에 둔다.
// 타입은 여기서 만든 규칙에서 뽑아 쓰므로(types.ts), 규칙과 타입이 어긋날 수 없다.
import { z } from "zod";
import { EMPTY_SECTION_TEXT, SECTION_OUTLINE } from "./outline";

// 표준 목차 기준표와 빈 항목 문구는 outline.ts에 있다(화면에서도 쓰려고 zod와 분리). 기존 import가 그대로 되도록 다시 내보낸다.
export { EMPTY_SECTION_TEXT, SECTION_OUTLINE };

// 발행일은 있는 만큼만 적는다: "2026", "2026-03", "2026-03-01"
const publishedDateSchema = z
  .string()
  .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "발행일은 YYYY, YYYY-MM, YYYY-MM-DD 중 하나여야 합니다");

// 표준 목차 항목 번호(1~6)
export const sectionNoSchema = z.literal([1, 2, 3, 4, 5, 6]);

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
  topic: sectionNoSchema, // 이 자료가 쓰일 표준 목차 항목 번호
});

// Design Ref: §3.2 ③ — 요약 조각: 한 자료(sourceId)에 근거한 한국어 문장 하나.
// 작업 9가 이 조각들을 표준 목차 항목에 배치해 본문으로 만든다.
export const summaryPieceSchema = z.object({
  sourceId: z.number().int().positive(), // 근거가 된 출처 번호 (요약마다 출처가 반드시 하나 있다)
  topic: sectionNoSchema, // 쓰일 표준 목차 항목 번호
  text: z.string().min(1),
  // 둘 곳이 이미 정해진 하위 항목 번호(0부터). 공개 통계 문장처럼 코드가 직접 만든 문장에 쓰고, 없으면 AI가 배정한다.
  subsection: z.number().int().min(0).optional(),
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

// Design Ref: §3.2 ① — 서버가 받는 입력. 국가명 한 줄만 받고, 길이와 문자를 제한한다.
export const MAX_COUNTRY_LENGTH = 50;

export const countryInputSchema = z.object({
  country: z
    .string({ error: "국가명을 입력해 주세요" })
    .trim()
    .min(1, "국가명을 입력해 주세요")
    .max(MAX_COUNTRY_LENGTH, `국가명은 ${MAX_COUNTRY_LENGTH}자 이하로 입력해 주세요`)
    // 글자·숫자·공백과 . ' ’ ( ) · , - 만 허용한다. 줄바꿈이나 특수 기호는 막는다.
    .regex(/^[\p{L}\p{M}\p{N} .'’()·,-]+$/u, "국가명에 사용할 수 없는 문자가 있습니다"),
});

// /api/report가 진행 중에 흘려 보내는 조각
export const progressStepSchema = z.enum(["search", "summarize", "compose", "verify"]);

export const streamChunkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("progress"), step: progressStepSchema }),
  // 쉬운 한국어 문구. 키나 내부 정보는 넣지 않는다.
  z.object({ type: z.literal("error"), message: z.string().min(1) }),
  z.object({ type: z.literal("done"), report: reportSchema }),
]);
