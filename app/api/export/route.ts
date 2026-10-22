// Design Ref: §3.4 — 수정이 끝난 보고서를 받아 파일(.docx)로 만들어 돌려준다. 서버에는 저장하지 않는다.
import { buildDocx } from "@/lib/export/docx";
import { reportFileName } from "@/lib/export/shared";
import { reportSchema } from "@/lib/report/schema";
import { z } from "zod";

const requestSchema = z.object({
  report: reportSchema,
  format: z.enum(["docx", "hwpx"]),
});

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function POST(request: Request) {
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
  const { report, format } = parsed.data;

  if (format === "hwpx") {
    return Response.json(
      { message: "한글(.hwpx) 내려받기는 한글에서 열리는지 확인이 끝나지 않아 아직 쓸 수 없습니다. 워드(.docx)로 받아 한글에서 열 수 있습니다." },
      { status: 501 },
    );
  }

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
