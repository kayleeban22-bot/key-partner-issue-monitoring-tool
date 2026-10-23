// 무료 공개 통계(세계은행 WDI, IMF DataMapper)로 "국가 개요"와 "경제 동향"의 핵심 숫자 문장을 만든다.
// AI를 거치지 않으므로 숫자가 틀릴 수 없고 비용이 들지 않는다. 키도 필요 없다.
//   - 세계은행: 인구, GDP, 1인당 GDP, 실질 GDP 성장률, 외국인직접투자 순유입, 소비자물가 상승률, 소득 분류
//   - IMF: 실질 GDP 성장률과 소비자물가 상승률 전망
// 한계: 연 단위 확정치라 올해의 분기·월 속보는 없다. 그런 최신 동향은 AI 검색이 맡는다.
import type { Source, SummaryPiece } from "./types";

const REQUEST_TIMEOUT_MS = 8_000;

// ---------- 국가명 → 국가 코드 ----------

// 한국어 표기가 여러 가지인 국가. (Intl이 주는 공식 표기와 다른 흔한 이름)
const ALIASES: Record<string, string> = {
  한국: "KR",
  남한: "KR",
  터키: "TR",
  uae: "AE",
  유에이이: "AE",
  영국: "GB",
  체코공화국: "CZ",
  미얀마: "MM",
  버마: "MM",
  이란: "IR",
  시리아: "SY",
  라오스: "LA",
  브루나이: "BN",
  코트디부아르: "CI",
  아이보리코스트: "CI",
  동티모르: "TL",
  북마케도니아: "MK",
  마케도니아: "MK",
  스와질란드: "SZ",
  에스와티니: "SZ",
  캐나다: "CA",
  도미니카연방: "DM",
  콩고민주공화국: "CD",
  민주콩고: "CD",
  콩고공화국: "CG",
  호주: "AU",
  남아공: "ZA",
  남아프리카공화국: "ZA",
  대한민국: "KR",
  에리트레아: "ER",
};

// 현재 쓰이는 ISO 국가 코드. Intl은 옛 코드(VD: 북베트남 등)에도 같은 이름을 돌려줘서, 이 목록에 있는 코드만 쓴다.
const VALID_CODES = new Set(
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(" "),
);

// 한 이름이 둘 이상의 국가를 가리키는데 Intl은 하나로만 돌려주는 경우: 고르지 않고 모호하다고 알린다.
const AMBIGUOUS_NAMES: Record<string, string[]> = {
  도미니카: ["DM", "DO"], // 도미니카 연방 / 도미니카 공화국
};

const normalize = (text: string) => text.trim().toLowerCase().replace(/[\s\-·.]/g, "");

let nameIndex: Map<string, string[]> | null = null;

// ISO 2글자 코드마다 한국어·영어 이름을 모아 "이름 → 코드" 목록을 한 번만 만든다.
function buildNameIndex(): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const add = (name: string, code: string) => {
    const key = normalize(name);
    if (!key) return;
    const list = index.get(key) ?? [];
    if (!list.includes(code)) list.push(code);
    index.set(key, list);
  };

  const ko = new Intl.DisplayNames(["ko"], { type: "region" });
  const en = new Intl.DisplayNames(["en"], { type: "region" });
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const a of letters) {
    for (const b of letters) {
      const code = `${a}${b}`;
      const koName = ko.of(code);
      const enName = en.of(code);
      // 현재 쓰이는 코드만 쓰고, 이름이 없는 코드는(코드 그대로 돌려줌) 건너뛴다.
      if (!VALID_CODES.has(code) || !koName || koName === code || !enName || enName === code) continue;
      add(koName, code);
      add(enName, code);
      add(code, code);
    }
  }
  for (const [name, code] of Object.entries(ALIASES)) add(name, code);
  for (const [name, list] of Object.entries(AMBIGUOUS_NAMES)) index.set(normalize(name), [...list]);
  return index;
}

export type CountryLookup =
  | { kind: "ok"; iso2: string }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "none" };

// "베트남", "Vietnam", "VN"을 국가 코드로 바꾼다. "콩고"처럼 둘 이상에 해당하면 고르지 않고 ambiguous로 알린다.
export function lookupCountry(input: string): CountryLookup {
  nameIndex ??= buildNameIndex();
  const key = normalize(input);
  if (!key) return { kind: "none" };

  const exact = nameIndex.get(key);
  if (exact) return exact.length === 1 ? { kind: "ok", iso2: exact[0] } : { kind: "ambiguous", candidates: exact };

  // 이름의 앞부분만 입력한 경우(예: "콩고", "도미니카")는 해당하는 국가가 하나일 때만 인정한다.
  if (key.length >= 2) {
    const codes = new Set<string>();
    for (const [name, list] of nameIndex) {
      if (name.startsWith(key)) list.forEach((code) => codes.add(code));
    }
    if (codes.size === 1) return { kind: "ok", iso2: [...codes][0] };
    if (codes.size > 1) return { kind: "ambiguous", candidates: [...codes] };
  }
  return { kind: "none" };
}

// 모호한 이름의 후보 국가 코드를 한국어 국가 이름으로 바꿔 안내 문구에 쓴다. (예: CD, CG → 콩고민주공화국, 콩고공화국)
export function candidateNames(codes: string[]): string[] {
  const ko = new Intl.DisplayNames(["ko"], { type: "region" });
  // DM의 기본 이름 "도미니카"는 그 자체가 모호하므로 "도미니카 연방"으로 안내한다.
  return codes.map((code) => (code === "DM" ? "도미니카 연방" : (ko.of(code) ?? code)));
}

// ---------- 숫자 모양 만들기 ----------

const comma = (n: number) => Math.round(n).toLocaleString("en-US");

// 받침이 있으면 "은", 없으면 "는"을 붙인다. (베트남은 / 이집트는). 한글이 아니면 "은(는)"으로 둔다.
export function withTopicMarker(name: string): string {
  const last = name.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return `${name}은(는)`;
  return `${name}${(code - 0xac00) % 28 === 0 ? "는" : "은"}`;
}

// 달러 금액을 한국식 단위로 적는다. 코드가 직접 계산하므로 AI의 단위 변환 실수가 생기지 않는다.
export function formatUsd(value: number): string {
  const v = Math.abs(value);
  if (v >= 1e12) return `${Number((v / 1e12).toFixed(2))}조 달러`;
  if (v >= 1e8) {
    const eok = v / 1e8;
    return eok >= 1000 ? `${comma(eok)}억 달러` : `${Number(eok.toFixed(1))}억 달러`;
  }
  if (v >= 1e4) return `${comma(v / 1e4)}만 달러`;
  return `${comma(v)}달러`;
}

export const formatPercent = (value: number) => `${Number(value.toFixed(2))}%`;

// ---------- 공개 API 호출 ----------

async function getJson(url: string, signal: AbortSignal | undefined): Promise<unknown> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

type WbCountry = { iso3: string; name: string; region: string; income: string };

let wbCountries: Promise<Map<string, WbCountry>> | null = null;

// 세계은행 국가 목록(국가 코드, 지역, 소득 분류). 서버가 켜져 있는 동안 한 번만 받는다.
function loadWbCountries(signal: AbortSignal | undefined): Promise<Map<string, WbCountry>> {
  wbCountries ??= (async () => {
    const data = (await getJson("https://api.worldbank.org/v2/country?format=json&per_page=400", signal)) as [
      unknown,
      {
        id: string;
        iso2Code: string;
        name: string;
        region: { id: string; value: string };
        incomeLevel: { value: string };
      }[],
    ];
    const map = new Map<string, WbCountry>();
    for (const row of data[1]) {
      if (row.region.id === "NA") continue; // 지역 묶음(세계, 동아시아 등)은 국가가 아니다
      map.set(row.iso2Code, {
        iso3: row.id,
        name: row.name,
        region: row.region.value,
        income: row.incomeLevel.value,
      });
    }
    return map;
  })().catch((error) => {
    wbCountries = null; // 실패하면 다음 요청에서 다시 받는다
    throw error;
  });
  return wbCountries;
}

type YearValue = { year: number; value: number };

// 세계은행 지표의 최근 값(없는 해는 건너뜀)과 자료 갱신일
async function loadWbIndicator(
  iso2: string,
  code: string,
  signal: AbortSignal | undefined,
): Promise<{ values: YearValue[]; updated: string | null }> {
  const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${code}?format=json&per_page=10&mrv=6`;
  const data = (await getJson(url, signal)) as [{ lastupdated?: string }, { date: string; value: number | null }[]?];
  const rows = data[1];
  if (!Array.isArray(rows)) throw new Error("지표 응답 모양이 다릅니다");
  const values = rows
    .filter((row) => row.value !== null && Number.isFinite(Number(row.date)))
    .map((row) => ({ year: Number(row.date), value: row.value as number }))
    .sort((a, b) => b.year - a.year);
  return { values, updated: /^\d{4}-\d{2}-\d{2}$/.test(data[0]?.lastupdated ?? "") ? (data[0].lastupdated as string) : null };
}

// IMF DataMapper의 연도별 전망값
async function loadImf(indicator: string, iso3: string, signal: AbortSignal | undefined): Promise<YearValue[]> {
  const url = `https://www.imf.org/external/datamapper/api/v1/${indicator}/${iso3}`;
  const data = (await getJson(url, signal)) as { values?: Record<string, Record<string, Record<string, number>>> };
  const series = data.values?.[indicator]?.[iso3];
  if (!series) return [];
  return Object.entries(series)
    .filter(([year, value]) => Number.isFinite(Number(year)) && typeof value === "number")
    .map(([year, value]) => ({ year: Number(year), value }));
}

// ---------- 문장 만들기 ----------

const INCOME_KO: Record<string, string> = {
  "Low income": "저소득",
  "Lower middle income": "중하위 소득",
  "Upper middle income": "중상위 소득",
  "High income": "고소득",
};

const REGION_KO: Record<string, string> = {
  "East Asia & Pacific": "동아시아·태평양",
  "Europe & Central Asia": "유럽·중앙아시아",
  "Latin America & Caribbean": "중남미·카리브해",
  "Middle East & North Africa": "중동·북아프리카",
  "Middle East, North Africa, Afghanistan & Pakistan": "중동·북아프리카·아프가니스탄·파키스탄",
  "North America": "북미",
  "South Asia": "남아시아",
  "Sub-Saharan Africa": "사하라 이남 아프리카",
};

const yearList = (items: YearValue[], format: (v: number) => string) =>
  items.map((item) => `${item.year}년 ${format(item.value)}`).join(", ");

export type OpenDataResult =
  | { status: "ok"; sources: Source[]; pieces: SummaryPiece[]; notes: string[] }
  | { status: "unresolved" | "ambiguous" | "failed"; sources: []; pieces: []; notes: string[] };

// 국가명으로 공개 통계 문장과 출처를 만든다. 실패해도 오류를 던지지 않고 상태와 안내(notes)를 돌려준다.
export async function fetchOpenData(
  country: string,
  options: { signal?: AbortSignal; now?: Date } = {},
): Promise<OpenDataResult> {
  const now = options.now ?? new Date();
  const lookup = lookupCountry(country);
  if (lookup.kind === "none") {
    return { status: "unresolved", sources: [], pieces: [], notes: ["국가명을 공개 통계의 국가와 연결하지 못해 공개 통계는 쓰지 않았습니다."] };
  }
  if (lookup.kind === "ambiguous") {
    return { status: "ambiguous", sources: [], pieces: [], notes: [`"${country}"는 여러 국가에 해당해 공개 통계는 쓰지 않았습니다.`] };
  }

  let info: WbCountry | undefined;
  try {
    info = (await loadWbCountries(options.signal)).get(lookup.iso2);
  } catch {
    return { status: "failed", sources: [], pieces: [], notes: ["공개 통계(세계은행)에 연결하지 못했습니다."] };
  }
  if (!info) {
    return { status: "unresolved", sources: [], pieces: [], notes: ["이 국가는 세계은행 통계에 없어 공개 통계는 쓰지 않았습니다."] };
  }

  const iso2 = lookup.iso2;
  const wb = (code: string) => loadWbIndicator(iso2, code, options.signal);
  const [population, gdp, perCapita, growth, fdi, inflation, imfGrowth, imfInflation] = await Promise.allSettled([
    wb("SP.POP.TOTL"),
    wb("NY.GDP.MKTP.CD"),
    wb("NY.GDP.PCAP.CD"),
    wb("NY.GDP.MKTP.KD.ZG"),
    wb("BX.KLT.DINV.CD.WD"),
    wb("FP.CPI.TOTL.ZG"),
    loadImf("NGDP_RPCH", info.iso3, options.signal),
    loadImf("PCPIPCH", info.iso3, options.signal),
  ]);

  const latest = (result: PromiseSettledResult<{ values: YearValue[] }>): YearValue | null =>
    result.status === "fulfilled" ? (result.value.values[0] ?? null) : null;

  // 세계은행 문장: 토픽 번호, 하위 항목 번호(0부터)
  const wbDraft: { topic: 1 | 3; subsection: number; text: string }[] = [];

  const pop = latest(population);
  if (pop) wbDraft.push({ topic: 1, subsection: 0, text: `${pop.year}년 ${country}의 인구는 ${comma(pop.value)}명이다.` });

  const gdpValue = latest(gdp);
  if (gdpValue) wbDraft.push({ topic: 1, subsection: 0, text: `${gdpValue.year}년 ${country}의 명목 GDP는 약 ${formatUsd(gdpValue.value)}였다.` });

  const pc = latest(perCapita);
  if (pc) wbDraft.push({ topic: 1, subsection: 0, text: `${pc.year}년 ${country}의 1인당 명목 GDP는 약 ${comma(pc.value)}달러였다.` });

  const income = INCOME_KO[info.income];
  if (income) {
    const region = REGION_KO[info.region];
    wbDraft.push({
      topic: 1,
      subsection: 0,
      text: region
        ? `세계은행 분류에 따르면 ${withTopicMarker(country)} ${region}에 속하는 ${income} 국가이다.`
        : `세계은행 분류에 따르면 ${withTopicMarker(country)} ${income} 국가이다.`,
    });
  }

  if (growth.status === "fulfilled" && growth.value.values.length > 0) {
    const recent = growth.value.values.slice(0, 3).sort((a, b) => a.year - b.year);
    wbDraft.push({ topic: 3, subsection: 1, text: `세계은행 자료에 따르면 ${country}의 실질 GDP 성장률은 ${yearList(recent, formatPercent)}를 기록했다.` });
  }

  const fdiValue = latest(fdi);
  if (fdiValue) {
    const amount = formatUsd(fdiValue.value);
    wbDraft.push({
      topic: 3,
      subsection: 2,
      text:
        fdiValue.value >= 0
          ? `${fdiValue.year}년 ${country}의 외국인직접투자 순유입액(국제수지 기준)은 약 ${amount}였다.`
          : `${fdiValue.year}년 ${country}의 외국인직접투자(국제수지 기준)는 약 ${amount}의 순유출을 기록했다.`,
    });
  }

  const cpi = latest(inflation);
  if (cpi) wbDraft.push({ topic: 3, subsection: 2, text: `${cpi.year}년 ${country}의 소비자물가 상승률은 ${formatPercent(cpi.value)}였다.` });

  // IMF 전망: 올해부터 3개 연도
  const imfDraft: { topic: 3; subsection: number; text: string }[] = [];
  const forecast = (result: PromiseSettledResult<YearValue[]>) =>
    result.status === "fulfilled"
      ? result.value.filter((item) => item.year >= now.getUTCFullYear() && item.year <= now.getUTCFullYear() + 2).sort((a, b) => a.year - b.year)
      : [];
  const g = forecast(imfGrowth);
  if (g.length > 0) imfDraft.push({ topic: 3, subsection: 1, text: `IMF는 ${country}의 실질 GDP 성장률을 ${yearList(g, formatPercent)}로 전망했다.` });
  const p = forecast(imfInflation);
  if (p.length > 0) imfDraft.push({ topic: 3, subsection: 2, text: `IMF는 ${country}의 소비자물가 상승률을 ${yearList(p, formatPercent)}로 전망했다.` });

  if (wbDraft.length === 0 && imfDraft.length === 0) {
    return { status: "failed", sources: [], pieces: [], notes: ["공개 통계를 불러오지 못했습니다."] };
  }

  // 출처는 기관마다 하나씩. 쓰인 기관만 번호를 1번부터 매긴다.
  const sources: Source[] = [];
  const pieces: SummaryPiece[] = [];
  const today = now.toISOString().slice(0, 10);
  const updates = [population, gdp, perCapita, growth, fdi, inflation]
    .map((result) => (result.status === "fulfilled" ? result.value.updated : null))
    .filter((date): date is string => date !== null)
    .sort();

  if (wbDraft.length > 0) {
    sources.push({
      id: sources.length + 1,
      org: "World Bank",
      title: `World Development Indicators — ${info.name}`,
      date: updates[updates.length - 1] ?? today, // 세계은행이 알려 주는 자료 갱신일
      url: `https://data.worldbank.org/country/${iso2.toLowerCase()}`,
      isOld: false,
    });
    for (const draft of wbDraft) pieces.push({ sourceId: sources.length, ...draft });
  }
  if (imfDraft.length > 0) {
    sources.push({
      id: sources.length + 1,
      org: "IMF",
      title: `World Economic Outlook 전망 데이터(DataMapper, 조회일 기준) — ${info.name}`,
      date: today, // DataMapper는 발행일을 알려 주지 않아 조회일을 적는다
      url: `https://www.imf.org/external/datamapper/profile/${info.iso3}`,
      isOld: false,
    });
    for (const draft of imfDraft) pieces.push({ sourceId: sources.length, ...draft });
  }

  const missing = [population, gdp, perCapita, growth, fdi, inflation, imfGrowth, imfInflation].filter((r) => r.status === "rejected").length;
  const notes = missing > 0 ? [`공개 통계 지표 ${missing}개를 불러오지 못해 빠졌습니다.`] : [];
  return { status: "ok", sources, pieces, notes };
}
