import type { PublishingIdentity } from "./creativeDesign";
import type { JSONContent } from "@tiptap/core";

import type { EducationalStyle } from "./educationalStyles";

export type PageSettings = {
  size: "A4" | "A5" | "A3";
  orientation: "portrait" | "landscape";
  marginsMm: { top: number; right: number; bottom: number; left: number };
};

export type MathPressDocument = {
  format: "mathpress";
  schemaVersion: 3 | 4 | 5;
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
  creativeDesign?: string;
  publishingIdentity?: PublishingIdentity;
  educationalStyles?: EducationalStyle[];
  content: JSONContent;
  updatedAt: string;
};


export function paperDimensions(size: PageSettings["size"], landscape: boolean) {
  const [width,height] = size === "A5" ? [148,210] : size === "A3" ? [297,420] : [210,297];
  return landscape ? [height,width] as const : [width,height] as const;
}
