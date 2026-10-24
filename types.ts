export type TextBlock = {
  id: string;
  type: "paragraph";
  text: string;
};
export type MathBlock = {
  id: string;
  type: "math";
  latex: string;
  display: boolean;
};
export type ContentBlock = TextBlock | MathBlock;
export type MathPressDocument = {
  format: "mathpress";
  schemaVersion: 1;
  id: string;
  title: string;
  language: "ar";
  direction: "rtl";
  page: {
    size: "A4";
    orientation: "portrait" | "landscape";
    marginsMm: { top: number; right: number; bottom: number; left: number };
  };
  content: ContentBlock[];
  updatedAt: string;
};