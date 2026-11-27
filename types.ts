import type { JSONContent } from "@tiptap/core";

import type { EducationalStyle } from "./educationalStyles";

export type PageSettings = {
  size: "A4";
  orientation: "portrait" | "landscape";
  marginsMm: { top: number; right: number; bottom: number; left: number };
};

export type MathPressDocument = {
  format: "mathpress";
  schemaVersion: 3 | 4;
  id: string;
  title: string;
  language: "ar";
  direction: "rtl";
  page: PageSettings;
  headerText: string;
  footerText: string;
  showPageNumbers: boolean;
  /** صورة تُرسم خلف كل صفحة (ورق رسمي، إطار، علامة مائية) كـ data URL، أو null. */
  background: string | null;
  numberingStart?: number;
  educationalStyles?: EducationalStyle[];
  content: JSONContent;
  updatedAt: string;
};
