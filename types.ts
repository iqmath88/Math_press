import type { JSONContent } from "@tiptap/core";

export type PageSettings = {
  size: "A4";
  orientation: "portrait" | "landscape";
  marginsMm: { top: number; right: number; bottom: number; left: number };
};

export type MathPressDocument = {
  format: "mathpress";
  schemaVersion: 3;
  id: string;
  title: string;
  language: "ar";
  direction: "rtl";
  page: PageSettings;
  headerText: string;
  footerText: string;
  showPageNumbers: boolean;
  content: JSONContent;
  updatedAt: string;
};
