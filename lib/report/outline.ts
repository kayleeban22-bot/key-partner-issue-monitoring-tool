// Design Ref: §3.3 — 표준 목차 기준표와 빈 항목 문구. zod를 쓰지 않아서 브라우저 쪽 코드(화면)도 가져다 쓸 수 있다.

// Plan SC: S2 — 표준 목차 6개 항목의 순서·이름·괄호 안 하위 항목을 100% 따르게 하는 기준표.
// PRD.md 5번 "표준 목차"와 같아야 한다. 1번 항목은 괄호 안 하위 항목이 없어 "국가 개요" 하나로 둔다.
export const SECTION_OUTLINE = [
  { no: 1, title: "간략한 국가 개요", subsections: ["국가 개요"] },
  {
    no: 2,
    title: "정치 동향",
    subsections: ["지정학적 위치 및 이슈", "대외관계", "정치동향"],
  },
  {
    no: 3,
    title: "경제 동향",
    subsections: ["국영기업 해외 투자 프로젝트", "경제동향 및 전망", "GDP·FDI 등"],
  },
  {
    no: 4,
    title: "주요 산업 현황 및 정책",
    subsections: ["우리 기업 수주 추진 현황", "산업 정책적 특징"],
  },
  {
    no: 5,
    title: "우리나라와의 관계",
    subsections: ["교역현황", "수주 및 투자 현황", "전략적 중요성"],
  },
  { no: 6, title: "경제외교 현황", subsections: ["주요 MOU 체결 현황"] },
] as const;

// 자료가 없는 항목의 본문. 화면과 파일 모두 이 문구 한 줄만 쓴다.
export const EMPTY_SECTION_TEXT = "공개 자료 없음";
