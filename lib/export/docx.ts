// Design Ref: §3.2 ⑦ — 보고서를 워드(.docx) 파일로 만든다. docx 라이브러리가 파일 구조를 만든다.
// 내용: 제목, 6개 항목 본문(문장 끝 출처 번호), 출처 목록. 경고와 빈 항목 안내는 담당자용이라 파일에 넣지 않는다. (Design §3.3)
// 양식(PRD 5번): A4, 본문 11pt, 여백 보통(2.54cm). 줄 간격은 160%로 두었다(layout.ts의 쪽수 추정과 같은 가정).
// 서버 전용 코드이다.
import "server-only";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  LineRuleType,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
  convertMillimetersToTwip,
} from "docx";
import { EMPTY_SECTION_TEXT } from "../report/outline";
import type { Report, Section } from "../report/types";
import { cleanText } from "./shared";

const FONT = { ascii: "맑은 고딕", hAnsi: "맑은 고딕", eastAsia: "맑은 고딕", cs: "맑은 고딕" };
const HALF_POINTS = (pt: number) => pt * 2; // 워드의 글자 크기는 반 포인트 단위이다.
const BODY_PT = 11;
const LINE_160 = 384; // 줄 간격 160% (240이 100%)
const MARGIN = convertMillimetersToTwip(25.4); // 여백 "보통" 2.54cm

function bodyParagraph(children: (TextRun | ExternalHyperlink)[], options: { before?: number; after?: number } = {}) {
  return new Paragraph({ children, spacing: { before: options.before ?? 0, after: options.after ?? 120 } });
}

// 한 문장: 본문 글자 뒤에 출처 번호 [n]을 위첨자로 붙인다.
function sentenceRuns(sentence: Section["subsections"][number]["sentences"][number]): TextRun[] {
  const runs = [new TextRun({ text: cleanText(sentence.text) })];
  for (const id of sentence.sourceIds) runs.push(new TextRun({ text: `[${id}]`, superScript: true }));
  return runs;
}

function sectionParagraphs(section: Section): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({
      heading: "Heading1",
      children: [new TextRun({ text: `${section.no}. ${cleanText(section.title)}` })],
    }),
  ];

  if (section.isEmpty) {
    out.push(bodyParagraph([new TextRun({ text: EMPTY_SECTION_TEXT })]));
    return out;
  }

  // 하위 항목이 하나뿐이면 항목 제목과 겹치므로 하위 제목은 쓰지 않는다. (화면과 같은 규칙)
  const showTitles = section.subsections.length > 1;
  for (const sub of section.subsections) {
    if (showTitles) {
      out.push(new Paragraph({ heading: "Heading2", children: [new TextRun({ text: cleanText(sub.title) })] }));
    }
    // 하위 항목의 문장들을 한 문단으로 이어 붙인다.
    const runs: TextRun[] = [];
    sub.sentences.forEach((sentence, index) => {
      if (index > 0) runs.push(new TextRun({ text: " " }));
      runs.push(...sentenceRuns(sentence));
    });
    out.push(bodyParagraph(runs));
  }
  return out;
}

export async function buildDocx(report: Report): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ heading: "Title", children: [new TextRun({ text: cleanText(report.title) })] }),
    ...report.sections.flatMap(sectionParagraphs),
    new Paragraph({ heading: "Heading1", children: [new TextRun({ text: "출처 목록" })] }),
  ];

  for (const source of report.sources) {
    const old = source.isOld ? " (과거 자료)" : "";
    children.push(
      new Paragraph({
        spacing: { before: 0, after: 60 },
        children: [
          new TextRun({
            text: `[${source.id}] ${cleanText(source.org)}, ${cleanText(source.title)}, ${source.date}${old}, `,
            size: HALF_POINTS(10),
          }),
          new ExternalHyperlink({
            link: source.url,
            children: [new TextRun({ text: source.url, size: HALF_POINTS(10), color: "0563C1", underline: {} })],
          }),
        ],
      }),
    );
  }

  const doc = new Document({
    title: cleanText(report.title),
    styles: {
      default: {
        document: {
          run: { font: FONT, size: HALF_POINTS(BODY_PT) },
          paragraph: { spacing: { line: LINE_160, lineRule: LineRuleType.AUTO } },
        },
      },
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: HALF_POINTS(18), bold: true, color: "000000" },
          paragraph: { spacing: { before: 0, after: 240, line: LINE_160, lineRule: LineRuleType.AUTO } },
        },
        {
          id: "Heading1",
          name: "heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: HALF_POINTS(13), bold: true, color: "000000" },
          paragraph: { spacing: { before: 240, after: 120, line: LINE_160, lineRule: LineRuleType.AUTO }, keepNext: true },
        },
        {
          id: "Heading2",
          name: "heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: HALF_POINTS(BODY_PT), bold: true, color: "000000" },
          paragraph: { spacing: { before: 120, after: 60, line: LINE_160, lineRule: LineRuleType.AUTO }, keepNext: true },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: HALF_POINTS(9) })] }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
