// 공개 주소의 무단·과다 사용으로 AI 사용료가 새는 것을 줄이는 간단한 제한이다. (로그인이 없으므로 접속 주소(IP)로 센다)
// 서버 인스턴스의 메모리에만 기록하므로 인스턴스가 여러 개이거나 새로 뜨면 따로 센다. 완벽한 방어가 아니라 1차 안전장치이고,
// 확실한 상한은 OpenAI 계정의 월 사용 한도 설정이 맡는다.
// 서버 전용 코드이다. 기록은 접속 주소와 시각뿐이며 국가명·보고서 내용은 저장하지 않는다.
import "server-only";

const WINDOW_MS = 10 * 60 * 1000; // 10분
const MAX_PER_WINDOW = 6; // 같은 주소에서 10분에 6건까지
const MAX_CONCURRENT = 4; // 한 인스턴스에서 동시에 만드는 보고서 수
const MAX_CONCURRENT_PER_IP = 1; // 한 접속자가 동시에 만드는 보고서 수 (한 사람이 칸을 독점하지 못하게 한다)
const EXPORT_MAX_PER_WINDOW = 30; // 같은 주소에서 10분에 파일 30번까지
const MAX_TRACKED_IPS = 5000; // 기록이 무한히 커지지 않게 한다

const hits = new Map<string, number[]>();
let running = 0;
const runningByIp = new Map<string, number>();
const exportHits = new Map<string, number[]>();
const loginFailures = new Map<string, number[]>();
const LOGIN_MAX_FAILURES = 5; // 같은 주소에서 10분에 5번 틀리면 잠깐 막는다 (무차별 대입 방지)

export type Admission = { ok: true; release: () => void } | { ok: false; message: string };

// 요청 머리글에서 접속 주소를 꺼낸다. 배포 환경(Vercel)이 넣어 주는 값을 우선한다.
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return normalizeIp(forwarded || request.headers.get("x-real-ip") || "unknown");
}

// IPv6는 사용자가 /64 대역 안에서 주소를 마음대로 바꿀 수 있으므로 앞 4덩어리(/64)로 묶어 센다.
export function normalizeIp(ip: string): string {
  if (!ip.includes(":") || ip.includes(".")) return ip; // IPv4(또는 IPv4 매핑 주소)와 unknown은 그대로
  const [head, tail = ""] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = ip.includes("::") && tail ? tail.split(":") : [];
  const missing = ip.includes("::") ? 8 - headParts.length - tailParts.length : 0;
  const groups = [...headParts, ...Array(Math.max(0, missing)).fill("0"), ...tailParts];
  return `${groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

// 파일 내려받기용 가벼운 제한. 보고서 만들기와 따로 센다.
export function allowExport(ip: string, now = Date.now()): boolean {
  const recent = (exportHits.get(ip) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= EXPORT_MAX_PER_WINDOW) return false;
  recent.push(now);
  exportHits.set(ip, recent);
  if (exportHits.size > MAX_TRACKED_IPS) {
    for (const [key, times] of exportHits) {
      if (times.every((time) => now - time >= WINDOW_MS)) exportHits.delete(key);
    }
  }
  return true;
}

export function admit(ip: string, now = Date.now()): Admission {
  if (running >= MAX_CONCURRENT) {
    return { ok: false, message: "지금 요청이 많아 보고서를 만들 수 없습니다. 잠시 후 다시 시도해 주세요." };
  }

  if ((runningByIp.get(ip) ?? 0) >= MAX_CONCURRENT_PER_IP) {
    return { ok: false, message: "이미 보고서를 만드는 중입니다. 끝난 뒤에 다시 시도해 주세요." };
  }

  const recent = (hits.get(ip) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    const wait = Math.ceil((WINDOW_MS - (now - recent[0])) / 60_000);
    return { ok: false, message: `짧은 시간에 너무 많이 요청했습니다. 약 ${wait}분 뒤에 다시 시도해 주세요.` };
  }

  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > MAX_TRACKED_IPS) {
    for (const [key, times] of hits) {
      if (times.every((time) => now - time >= WINDOW_MS)) hits.delete(key);
    }
  }

  running += 1;
  runningByIp.set(ip, (runningByIp.get(ip) ?? 0) + 1);
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      running -= 1;
      const left = (runningByIp.get(ip) ?? 1) - 1;
      if (left <= 0) runningByIp.delete(ip);
      else runningByIp.set(ip, left);
    },
  };
}

// 비밀번호 시도 제한: 틀린 횟수만 센다. 막힌 동안에는 맞는 비밀번호도 받지 않는다.
export function canTryLogin(ip: string, now = Date.now()): boolean {
  const recent = (loginFailures.get(ip) ?? []).filter((time) => now - time < WINDOW_MS);
  return recent.length < LOGIN_MAX_FAILURES;
}

export function recordLoginFailure(ip: string, now = Date.now()): void {
  const recent = (loginFailures.get(ip) ?? []).filter((time) => now - time < WINDOW_MS);
  recent.push(now);
  loginFailures.set(ip, recent);
  if (loginFailures.size > MAX_TRACKED_IPS) {
    for (const [key, times] of loginFailures) {
      if (times.every((time) => now - time >= WINDOW_MS)) loginFailures.delete(key);
    }
  }
}

export function clearLoginFailures(ip: string): void {
  loginFailures.delete(ip);
}
