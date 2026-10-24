import type { JSONContent } from "@tiptap/core";

export type PageSettings = {
  size: "A4";
  orientation: "portrait";
  marginsMm: { top: number; right: number; bottom: number; left: number };
};

export type MathPressDocument = {
  format: "mathpress";
  schemaVersion: 2;
  id: string;
  title: string;
  language: "ar";
  direction: "rtl";
  page: PageSettings;
  footerText: string;
  content: JSONContent;
  updatedAt: string;
};
