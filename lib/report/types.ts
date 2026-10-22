// Design Ref: §3.3 — 타입은 schema.ts의 검사 규칙에서 뽑아 쓴다.
import type { z } from "zod";
import type {
  progressStepSchema,
  rawSourceSchema,
  reportSchema,
  sectionNoSchema,
  sectionSchema,
  sentenceSchema,
  sourceSchema,
  streamChunkSchema,
  subsectionSchema,
  summaryPieceSchema,
} from "./schema";

export type Source = z.infer<typeof sourceSchema>;
export type RawSource = z.infer<typeof rawSourceSchema>; // 서버 안에서만 사용
export type SummaryPiece = z.infer<typeof summaryPieceSchema>;
export type Sentence = z.infer<typeof sentenceSchema>;
export type Subsection = z.infer<typeof subsectionSchema>;
export type SectionNo = z.infer<typeof sectionNoSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type Report = z.infer<typeof reportSchema>;
export type ProgressStep = z.infer<typeof progressStepSchema>;
export type StreamChunk = z.infer<typeof streamChunkSchema>;
