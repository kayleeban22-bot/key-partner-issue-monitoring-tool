// 다른 사이트에서 몰래 보낸 요청(CSRF)과 엉뚱한 형식의 요청을 API 맨 앞에서 거절한다.
// - 본문 형식이 JSON이 아니면 거절한다. (HTML 폼은 JSON을 보낼 수 없다)
// - 브라우저가 "다른 사이트에서 온 요청"이라고 알려 주면(Sec-Fetch-Site, Origin) 거절한다.
// 서버 전용 코드이다.

export function guardJsonRequest(request: Request, maxBytes: number): Response | null {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") {
    return Response.json({ message: "요청 형식이 올바르지 않습니다" }, { status: 415 });
  }

  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return Response.json({ message: "허용되지 않은 요청입니다" }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      // 형식이 이상한 Origin은 아래에서 거절한다.
    }
    if (originHost !== host) {
      return Response.json({ message: "허용되지 않은 요청입니다" }, { status: 403 });
    }
  }

  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) {
    return Response.json({ message: "요청이 너무 큽니다" }, { status: 413 });
  }
  return null;
}
