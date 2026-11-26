import { getSchema, type JSONContent } from "@tiptap/core";
import { buildExtensions } from "./extensions";

export const MAX_IMPORT_BYTES = 32 * 1024 * 1024;
const excludedKeys = new Set(["__proto__", "constructor", "prototype"]);
const imageSource = /^(?:https?:\/\/[^\s]+|data:image\/(?:png|jpe?g|gif|webp|bmp|svg\+xml);base64,[a-z\d+/]+=*)$/i;
const cssColor = /^(?:#[a-f\d]{3,8}|rgba?\([\d.,%\s]+\)|hsla?\([\d.,%\s]+\)|[a-z]+)$/i;

let schema: ReturnType<typeof getSchema> | undefined;

export function validateImportedContent(input: unknown): JSONContent | null {
  let remainingNodes = 450_000;
  let remainingText = MAX_IMPORT_BYTES;

  const clean = (value: unknown, depth = 0): unknown => {
    if (--remainingNodes < 0 || depth > 48) throw new Error("Document nesting limit");
    if (typeof value === "string") {
      remainingText -= value.length;
      if (remainingText < 0) throw new Error("Document text limit");
      return value;
    }
    if (value === null || typeof value === "boolean" || typeof value === "number") return value;
    if (Array.isArray(value)) return value.map(item => clean(item, depth + 1));
    if (!value || typeof value !== "object") throw new Error("Invalid JSON value");
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!excludedKeys.has(key)) result[key] = clean(entry, depth + 1);
    }
    return result;
  };

  try {
    const raw = clean(input) as JSONContent;
    if (!raw || raw.type !== "doc" || !Array.isArray(raw.content)) return null;
    const check = (node: JSONContent) => {
      const attrs = node.attrs;
      if (attrs) {
        if (node.type === "image" && (typeof attrs.src !== "string" || !imageSource.test(attrs.src))) throw new Error("Invalid image source");
        if (node.type === "image" && attrs.width && !/^\d+(?:\.\d+)?%?$/.test(String(attrs.width))) attrs.width = null;
        if (node.type === "mathBlock" || node.type === "mathInline") {
          if (attrs.latex != null && (typeof attrs.latex !== "string" || attrs.latex.length > 40_000)) throw new Error("Invalid LaTeX source");
        }
        if (attrs.textAlign && !["left", "right", "center", "justify", "start", "end"].includes(attrs.textAlign)) attrs.textAlign = null;
        if (attrs.dir && attrs.dir !== "rtl" && attrs.dir !== "ltr") attrs.dir = null;
      }
      for (const mark of node.marks ?? []) {
        if (!mark.attrs) continue;
        if (mark.attrs.color && !cssColor.test(String(mark.attrs.color))) mark.attrs.color = null;
        if (mark.attrs.fontFamily && !/^[\p{L}\p{N}\s,'"-]{1,100}$/u.test(String(mark.attrs.fontFamily))) mark.attrs.fontFamily = null;
        if (mark.attrs.fontSize && !/^\d{1,3}(?:\.\d{1,2})?$/.test(String(mark.attrs.fontSize))) mark.attrs.fontSize = null;
      }
      node.content?.forEach(check);
    };
    check(raw);
    schema ??= getSchema(buildExtensions());
    const document = schema.nodeFromJSON(raw);
    document.check();
    return document.toJSON();
  } catch { return null; }
}
