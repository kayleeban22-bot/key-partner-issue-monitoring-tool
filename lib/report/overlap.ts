// 공개 통계(세계은행·IMF)가 이미 알려 주는 지표를 AI 검색 문장이 다시 말하면, 같은 지표가 서로 다른 숫자로 실리는 일이 생긴다.
// (예: 인구 "796,682명"과 AI의 "약 0.792 million명으로 추정") 공개 통계는 API 원값이라 더 믿을 수 있으므로 겹치는 AI 문장을 뺀다.
// 올해 분기·월 속보, 비율(GDP 대비 등)처럼 지표 값이 아닌 문장은 건드리지 않는다.
// 브라우저 쪽에서도 쓸 수 있도록 서버 전용 import가 없는 순수 함수만 둔다.
import type { SummaryPiece } from "./types";

type Metric = "population" | "gdp" | "perCapita" | "imfGrowth" | "imfInflation";

const HAS_DIGIT = /\d/;

// 공개 통계 문장(opendata.ts가 만든 문장)이 어떤 지표를 다루는지
function openMetrics(openPieces: SummaryPiece[]): Set<Metric> {
  const found = new Set<Metric>();
  for (const { text } of openPieces) {
    if (/인구는/.test(text)) found.add("population");
    else if (/1인당 명목 GDP/.test(text)) found.add("perCapita");
    else if (/명목 GDP는/.test(text)) found.add("gdp");
    else if (/^IMF는/.test(text) && /성장률/.test(text)) found.add("imfGrowth");
    else if (/^IMF는/.test(text) && /물가/.test(text)) found.add("imfInflation");
  }
  return found;
}

// AI 문장이 다루는 지표들. 숫자가 없는 문장(예: "인구 이동 문제")은 지표 값이 아니므로 비어 있다.
function aiMetrics(text: string): Metric[] {
  if (!HAS_DIGIT.test(text)) return [];
  const metrics: Metric[] = [];

  // IMF 전망: IMF(국제통화기금)가 성장률·물가를 전망했다는 문장
  if (/IMF|국제통화기금/.test(text) && /전망|예상/.test(text)) {
    if (/성장률/.test(text)) metrics.push("imfGrowth");
    if (/물가/.test(text)) metrics.push("imfInflation");
  }
  // 1인당 GDP
  if (/1인당/.test(text) && /GDP|국내총생산/.test(text)) metrics.push("perCapita");
  // 인구 규모: "인구는 ~명"처럼 인구 수를 말하는 문장 (증가율·비중 등 비율 문장은 제외)
  if (/인구/.test(text) && /(명|million|백만|천만|억)/.test(text) && !/(증가율|감소율|성장률|비중|%)/.test(text)) {
    metrics.push("population");
  }
  // 명목 GDP 규모: 금액으로 말하는 GDP 문장 (성장률·비중·"GDP 대비" 같은 비율 문장은 제외)
  if (
    /(명목\s*)?GDP|국내총생산/.test(text) &&
    /(달러|\$|억|조|billion|trillion)/.test(text) &&
    !/(성장률|증가율|대비|비중|1인당|%)/.test(text)
  ) {
    metrics.push("gdp");
  }
  return metrics;
}

// 공개 통계가 이미 다루는 지표를 다시 말하는 AI 문장을 뺀다. 문장이 다루는 지표가 모두 공개 통계에 있을 때만 뺀다.
export function dropOverlaps(aiPieces: SummaryPiece[], openPieces: SummaryPiece[]): { pieces: SummaryPiece[]; removed: number } {
  const covered = openMetrics(openPieces);
  if (covered.size === 0) return { pieces: aiPieces, removed: 0 };

  const pieces = aiPieces.filter((piece) => {
    const metrics = aiMetrics(piece.text);
    return !(metrics.length > 0 && metrics.every((metric) => covered.has(metric)));
  });
  return { pieces, removed: aiPieces.length - pieces.length };
}
