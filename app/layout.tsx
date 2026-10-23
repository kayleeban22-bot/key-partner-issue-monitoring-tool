import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

// 디자인 글꼴: 제목·버튼·라벨은 Space Grotesk(SG), 보조 문구·숫자는 JetBrains Mono(JB).
// 두 글꼴에는 한글이 없어서 한글은 globals.css의 시스템 한국어 글꼴로 보인다.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-sg",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "block",
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jb",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "block",
});

export const metadata: Metadata = {
  title: "경제협력 모니터링 보고 도구",
  description: "국가를 입력하면 공개 자료를 조사·요약해 표준 양식의 보고서를 만들어 줍니다",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // dark: 화면 전체를 어두운 무대(검정 바탕)로 고정한다. (globals.css의 dark 변형이 이 클래스를 따른다)
    <html lang="ko" className={`${spaceGrotesk.variable} ${jetBrainsMono.variable} dark h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
