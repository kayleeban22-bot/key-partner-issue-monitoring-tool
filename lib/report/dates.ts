// Design Ref: §3.3 — 발행일은 "YYYY", "YYYY-MM", "YYYY-MM-DD" 중 있는 만큼만 적는다.
// Plan SC: S9 — 보고서 생성일 기준 12개월을 넘은 자료는 "과거 자료"로 표시한다(날짜가 일부만 있으면 가장 이른 날짜로 계산).

// 모델이 적어 준 날짜 문자열을 3가지 형태 중 하나로 정리한다. 날짜가 아니거나 미래이면 null.
export function normalizePublishedDate(raw: string, now: Date = new Date()): string | null {
  // 모델이 줄바꿈 없는 하이픈(U+2011) 등 특수 하이픈으로 적는 경우가 있어 일반 하이픈으로 바꿔 읽는다.
  const text = raw.replace(/[‐-―−]/g, "-").trim();
  const match = text.match(/^(\d{4})(?:[-./](\d{1,2})(?:[-./](\d{1,2}))?)?$/);
  if (!match) return null;

  const [, year, month, day] = match;
  const y = Number(year);
  const m = month === undefined ? null : Number(month);
  const d = day === undefined ? null : Number(day);

  if (m !== null && (m < 1 || m > 12)) return null;
  if (m !== null && d !== null) {
    // 2월 30일 같은 없는 날짜를 걸러낸다.
    const check = new Date(Date.UTC(y, m - 1, d));
    if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  }

  const normalized =
    m === null
      ? year
      : d === null
        ? `${year}-${String(m).padStart(2, "0")}`
        : `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // 오늘보다 뒤의 날짜는 잘못된 값으로 본다.
  if (earliestDate(normalized).getTime() > now.getTime()) return null;
  return normalized;
}

// 정리된 날짜에서 가장 이른 날짜를 구한다. ("2026" → 2026-01-01, "2026-05" → 2026-05-01)
function earliestDate(date: string): Date {
  const [y, m = "1", d = "1"] = date.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

// 보고서 생성일(now) 기준으로 12개월을 넘은 자료인지 확인한다.
export function isOlderThanTwelveMonths(date: string, now: Date = new Date()): boolean {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  return earliestDate(date).getTime() < cutoff.getTime();
}
