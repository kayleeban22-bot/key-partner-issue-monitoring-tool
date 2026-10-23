import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// 디자인 글꼴: Plus Jakarta Sans. 한글은 들어 있지 않아서 한글은 globals.css의 시스템 한국어 글꼴로 보인다.
// display: "block" — 등장 효과가 글자가 준비된 뒤에 재생되도록 한다.
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-pjs",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "800"],
  display: "block",
});

export const metadata: Metadata = {
  title: "경제협력 모니터링 보고 도구",
  description: "국가를 입력하면 공개 자료를 조사·요약해 표준 양식의 보고서를 만들어 줍니다",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // dark: 화면 전체를 어두운 무대(검정 바탕)로 고정한다. (globals.css의 dark 변형이 이 클래스를 따른다)
    <html lang="ko" className={`${plusJakarta.variable} dark h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
