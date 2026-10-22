// Design Ref: §3.2 ④ — 자료 규칙을 코드로 확인한다. AI 지시문만 믿지 않고, 요약 조각을 한 번 더 걸러 낸다.
//   1) 숫자는 원문 발췌와 같아야 한다 (틀린 단위 변환·지어낸 숫자는 뺀다)    — PRD 5번 must 1, Plan SC: S4·S5
//   2) 연락처·주소 같은 사적 정보가 든 문장은 뺀다                           — PRD 7번 개인정보
//   3) 최근 자료를 먼저 두고, 12개월을 넘은 자료는 뒤로 보낸다               — PRD 5번, Plan SC: S9
// 브라우저 쪽에서도 쓸 수 있도록 서버 전용 import가 없는 순수 함수만 둔다.
import type { RawSource, SummaryPiece } from "./types";

// ---------- 숫자 읽기 ----------

// 1,234 / 1.234,5 / 22 730,6 처럼 천 단위 구분(쉼표·점·공백)이 있는 숫자와 소수를 한 덩어리로 읽는다.
const NUMBER_TOKEN = /\d{1,3}(?:[   .,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/gu;

// 숫자 바로 뒤에 붙는 단위 말. 한국어 단위(조·억·만·천)는 띄어쓰기 없이 붙는 경우만 인정한다.
const SCALES: { re: RegExp; value: number; korean: boolean }[] = [
  { re: /^\s*(?:nghìn\s+tỷ|trillion|trn|tn|трлн|تريليون)(?![\p{L}])/iu, value: 1e12, korean: false },
  { re: /^\s*(?:billion|bn|bln|млрд|tỷ|مليار)(?![\p{L}])/iu, value: 1e9, korean: false },
  { re: /^\s*(?:million|mn|mln|млн|triệu|مليون)(?![\p{L}])/iu, value: 1e6, korean: false },
  { re: /^\s*(?:thousand|тыс|nghìn|ngàn|ألف)(?![\p{L}])/iu, value: 1e3, korean: false },
  { re: /^조/u, value: 1e12, korean: true },
  { re: /^억/u, value: 1e8, korean: true },
  { re: /^만/u, value: 1e4, korean: true },
  { re: /^천/u, value: 1e3, korean: true },
];

type Token = {
  start: number;
  end: number; // 숫자 끝
  values: number[]; // 읽는 방법이 여럿이면 모두 (예: 103.077 → 103.077, 103077)
  scale: number | null;
  korean: boolean;
  scaleEnd: number; // 단위 말 끝
};

// "1.234,5"는 1234.5, "103.077"은 103.077 또는 103077(천 단위 구분)로 읽는다. 어느 쪽인지 알 수 없을 때는 둘 다 후보로 둔다.
function readValues(raw: string): number[] {
  const s = raw.replace(/[   ]/g, "");
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  const out = new Set<number>();
  const push = (text: string) => {
    const n = Number(text);
    if (Number.isFinite(n)) out.add(n);
  };

  if (dots + commas === 0) {
    push(s);
  } else if (dots > 0 && commas > 0) {
    // 마지막에 나온 쪽이 소수점이다.
    const decimal = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const thousand = decimal === "." ? "," : ".";
    push(s.split(thousand).join("").replace(decimal, "."));
  } else {
    const sep = dots > 0 ? "." : ",";
    const parts = s.split(sep);
    if (parts.length > 2) {
      push(parts.join("")); // 1.234.567 → 천 단위 구분만 있다
    } else {
      push(`${parts[0]}.${parts[1]}`); // 소수점으로 읽기
      if (parts[1].length === 3) push(`${parts[0]}${parts[1]}`); // 천 단위 구분으로 읽기
    }
  }
  return [...out];
}

function readTokens(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const rest = text.slice(end);
    let scale: number | null = null;
    let korean = false;
    let scaleEnd = end;
    for (const candidate of SCALES) {
      const found = rest.match(candidate.re);
      if (found) {
        scale = candidate.value;
        korean = candidate.korean;
        scaleEnd = end + found[0].length;
        break;
      }
    }
    tokens.push({ start, end, values: readValues(match[0]), scale, korean, scaleEnd });
  }
  return tokens;
}

type Figure = {
  label: string; // 문장에서 잘라 낸 모양 (예: "1억 3,077만")
  values: number[]; // 이 숫자가 뜻할 수 있는 값들
  skip: boolean; // 연도·날짜·순서처럼 원문과 대조하지 않는 숫자
};

const CURRENCY_CODES = ["USD", "KRW", "EUR", "JPY", "CNY", "VND", "GBP"];

// 연도, 월·일·분기, "1인당" 같은 숫자는 원문 표기와 달라도 이상하지 않아 대조에서 뺀다.
function isIgnorable(text: string, token: Token, values: number[], hasScale: boolean): boolean {
  if (!hasScale && values.length === 1 && Number.isInteger(values[0]) && values[0] >= 1900 && values[0] <= 2100) {
    return true; // 연도
  }
  if (/^\s*(?:월|일|분기|개월|주|차|위|세|번째|시|분|초|인당|명당|가지)/u.test(text.slice(token.end))) {
    return true; // 3분기, 9월, 1인당 …
  }
  if (/^\s*[~\-–]\s*\d+\s*(?:월|일|분기|개월|주)/u.test(text.slice(token.end))) {
    return true; // 1~5월 처럼 범위의 앞쪽 숫자
  }
  const before = text.slice(Math.max(0, token.start - 3), token.start);
  if (/[A-Za-z]$/.test(before)) {
    // G20, COVID-19, Q3, H1 같은 이름 속 숫자. 단, USD13.7 처럼 통화 코드 뒤 숫자는 대조한다.
    return !CURRENCY_CODES.some((code) => before.toUpperCase().endsWith(code));
  }
  return text[token.start - 1] === "제"; // 제3차 …
}

function readFigures(text: string): Figure[] {
  const tokens = readTokens(text);
  const figures: Figure[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token.korean && token.scale !== null) {
      // "1억 3,077만"처럼 이어진 한국식 단위는 합쳐서 하나의 값으로 읽는다. (1억 + 3,077만 = 130,770,000)
      let values = token.values.map((v) => v * (token.scale as number));
      let lastScale = token.scale;
      let end = token.scaleEnd;
      while (i + 1 < tokens.length) {
        const next = tokens[i + 1];
        const gap = text.slice(end, next.start);
        if (!(next.korean && next.scale !== null && next.scale < lastScale && /^\s*$/.test(gap))) break;
        values = values.flatMap((a) => next.values.map((v) => a + v * (next.scale as number)));
        lastScale = next.scale;
        end = next.scaleEnd;
        i += 1;
      }
      figures.push({ label: text.slice(token.start, end).trim(), values, skip: false });
      continue;
    }

    const hasScale = token.scale !== null;
    const values = hasScale ? token.values.map((v) => v * (token.scale as number)) : token.values;
    figures.push({
      label: text.slice(token.start, token.scaleEnd).trim(),
      values,
      skip: isIgnorable(text, token, token.values, hasScale),
    });
  }
  return figures;
}

// 원문 발췌에서 "있을 수 있는 값"을 모두 모은다. 단위 말이 붙은 숫자는 붙인 값과 붙이지 않은 값 둘 다 후보이다.
function excerptValues(excerpt: string): number[] {
  const values: number[] = [];
  const tokens = readTokens(excerpt);
  for (const token of tokens) values.push(...token.values);
  for (const figure of readFigures(excerpt)) values.push(...figure.values);

  // 표 머리글처럼 "GDP (in billions of U.S. dollars): 484.7"로 단위가 숫자와 떨어져 있는 경우가 있다.
  // 원문 어딘가에 단위 말이 있으면, 단위가 붙지 않은 숫자에도 그 단위를 붙인 값을 후보로 더한다.
  const globalScales = [
    { re: /\btrillions?\b/i, value: 1e12 },
    { re: /\bbillions?\b/i, value: 1e9 },
    { re: /\bmillions?\b/i, value: 1e6 },
    { re: /\bthousands?\b/i, value: 1e3 },
  ].filter((scale) => scale.re.test(excerpt));
  for (const token of tokens) {
    if (token.scale !== null) continue;
    for (const scale of globalScales) values.push(...token.values.map((v) => v * scale.value));
  }
  return values;
}

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

// 요약 문장 속 숫자가 모두 원문 발췌에 있는 값인지 확인한다.
// 억·만·조 ↔ million·billion 같은 단위 바꿈은 "값이 정확히 같을 때만" 인정한다. (103.077 million ≠ 1억 3,077만)
export function checkNumbers(text: string, excerpt: string): { ok: boolean; unmatched: string[] } {
  const known = excerptValues(excerpt);
  const unmatched: string[] = [];
  for (const figure of readFigures(text)) {
    if (figure.skip) continue;
    if (!figure.values.some((value) => known.some((k) => same(value, k)))) unmatched.push(figure.label);
  }
  return { ok: unmatched.length === 0, unmatched };
}

// ---------- 사적 정보 ----------

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/u;
// 02-123-4567, +82-2-123-4567, (02) 123-4567 같은 전화번호 모양. 2026-08-31 같은 날짜나 2026-2031 같은 연도 범위는 걸리지 않는다.
const PHONE = /(?<![\d,.])(?:\+\d{1,3}[ -]?)?(?:\(?\d{1,4}\)?[ -]){2,3}\d{3,4}(?![\d,.])|\(\d{2,4}\)\s?\d{3,4}[ -]\d{4}/u;
const KOREAN_ADDRESS = /[가-힣]+(?:시|도)\s[가-힣]+(?:구|군)\s[가-힣0-9]+(?:로|길|동)\s?\d+/u;
const CONTACT_WORDS = /(?:연락처|전화번호|팩스|이메일|우편번호|상세\s?주소|거주지)/u;

export function containsPrivateInfo(text: string): boolean {
  return EMAIL.test(text) || PHONE.test(text) || KOREAN_ADDRESS.test(text) || CONTACT_WORDS.test(text);
}

// ---------- 합치기 ----------

export type RuleResult = {
  pieces: SummaryPiece[];
  removed: {
    noSource: number; // 근거 자료를 찾을 수 없는 조각
    numberMismatch: number; // 숫자가 원문 발췌와 맞지 않아 뺀 조각
    privateInfo: number; // 연락처·주소 등이 있어 뺀 조각
  };
};

export function applyRules(pieces: SummaryPiece[], sources: RawSource[]): RuleResult {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const removed = { noSource: 0, numberMismatch: 0, privateInfo: 0 };
  const kept: SummaryPiece[] = [];

  for (const piece of pieces) {
    const source = byId.get(piece.sourceId);
    if (!source) {
      removed.noSource += 1;
    } else if (containsPrivateInfo(piece.text)) {
      removed.privateInfo += 1;
    } else if (!checkNumbers(piece.text, source.excerpt).ok) {
      removed.numberMismatch += 1;
    } else {
      kept.push(piece);
    }
  }

  // 최근 자료를 앞에, 12개월을 넘은 자료는 뒤에 둔다. 같은 무리 안에서는 발행일이 늦은 순서이다.
  kept.sort((a, b) => {
    const sa = byId.get(a.sourceId) as RawSource;
    const sb = byId.get(b.sourceId) as RawSource;
    return Number(sa.isOld) - Number(sb.isOld) || sb.date.localeCompare(sa.date);
  });

  return { pieces: kept, removed };
}
