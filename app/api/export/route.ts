// Design Ref: §3.4 — 수정이 끝난 보고서를 받아 파일(.docx)로 만들어 돌려준다. 서버에는 저장하지 않는다.
import { buildDocx } from "@/lib/export/docx";
import { reportFileName } from "@/lib/export/shared";
import { allowExport, clientIp } from "@/lib/rate-limit";
import { guardJsonRequest } from "@/lib/request-guard";
import { reportSchema } from "@/lib/report/schema";
import { z } from "zod";

const requestSchema = z.object({
  report: reportSchema,
  format: z.literal("docx"), // 한글(.hwpx)은 만들지 않는다. 워드 파일을 한글에서 열 수 있다.
});

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// 보고서 한 건은 수십 KB이다. 이보다 큰 요청은 거절한다.
const MAX_BODY_BYTES = 512 * 1024;

export async function POST(request: Request) {
  const rejected = guardJsonRequest(request, MAX_BODY_BYTES);
  if (rejected) return rejected;
  if (!allowExport(clientIp(request))) {
    return Response.json({ message: "짧은 시간에 너무 많이 요청했습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "요청 형식이 올바르지 않습니다" }, { status: 400 });
  }

  // 화면에서 고친 보고서도 서버의 보고서 규칙(목차 순서, 핵심 주장의 출처 등)을 다시 통과해야 한다.
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { message: "보고서 내용이 규칙에 맞지 않아 파일을 만들 수 없습니다. 내용을 확인해 주세요." },
      { status: 400 },
    );
  }
  const { report } = parsed.data;

  try {
    const file = await buildDocx(report);
    const name = reportFileName(report, "docx");
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": DOCX_TYPE,
        // 한글 파일 이름은 filename*(UTF-8)로 보낸다.
        "Content-Disposition": `attachment; filename="report.docx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("워드 파일 생성 중 오류:", (error as Error)?.name);
    return Response.json({ message: "파일을 만드는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
