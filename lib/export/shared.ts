// 내려받기 파일(워드·한글)이 함께 쓰는 순수 함수들.
import type { Report } from "../report/types";

// 문서에 넣을 수 없는 제어 문자는 빼고, 공백을 정리한다. (&, < 같은 문자는 문서 라이브러리가 알아서 처리한다)
export function cleanText(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "").replace(/\s+/g, " ").trim();
}

// 내려받을 파일 이름. 파일 이름에 쓸 수 없는 문자는 밑줄로 바꾼다.
export function reportFileName(report: Report, extension: "docx" | "hwpx"): string {
  const base = `${cleanText(report.country)}_경제협력_현황_보고`.replace(/[\\/:*?"<>|\s]+/g, "_");
  return `${base}.${extension}`;
}
