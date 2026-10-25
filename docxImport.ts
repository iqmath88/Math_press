import JSZip from "jszip";
import type { JSONContent } from "@tiptap/core";
import { ommlToLatex } from "./omml";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const M = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";

export type ImportStats = {
  paragraphs: number; headings: number; lists: number; tables: number; images: number; equations: number; mathType: number;
};
export type ImportResult = {
  content: JSONContent;
  stats: ImportStats;
  warnings: string[];
  /** أكبر صورة في رأس الصفحة (ورق رسمي/إطار) كـ data URL، أو null. */
  background: string | null;
  page: { orientation: "portrait" | "landscape"; marginsMm: { top: number; right: number; bottom: number; left: number } } | null;
};

const kids = (el: Element): Element[] => Array.from(el.children);
const isW = (el: Element, name: string) => el.namespaceURI === W && el.localName === name;
const isM = (el: Element, name: string) => el.namespaceURI === M && el.localName === name;
const wChild = (el: Element | null | undefined, name: string) => (el ? kids(el).find(c => isW(c, name)) : undefined);
const wVal = (el: Element | null | undefined) => el?.getAttributeNS(W, "val") ?? null;
const wFlag = (el: Element | null | undefined): boolean => {
  if (!el) return false;
  const v = wVal(el);
  return !(v === "0" || v === "false" || v === "off" || v === "none");
};

type StyleInfo = { name: string; outline: number | null; num: { numId: string; level: number } | null; basedOn: string | null };

type Ctx = {
  styles: Map<string, StyleInfo>;
  numbering: Map<string, boolean>; // "numId:ilvl" => ordered
  rels: Map<string, string>;
  zip: JSZip;
  baseSz: number; // نقطة
  baseCs: number;
  stats: ImportStats;
  warnings: Set<string>;
  images: Map<string, Promise<string | null>>;
};

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
const LATIN = /[A-Za-z]/;
const SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40];
const HIGHLIGHT: Record<string, string> = {
  yellow: "#fff2a8", green: "#b9f6ca", cyan: "#b2ebf2", magenta: "#f8bbd0", blue: "#bbdefb", red: "#ffcdd2",
  darkBlue: "#90caf9", darkCyan: "#80deea", darkGreen: "#a5d6a7", darkMagenta: "#e1bee7", darkRed: "#ef9a9a",
  darkYellow: "#fff59d", lightGray: "#e0e0e0", darkGray: "#bdbdbd"
};

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("ملف Word تالف أو غير مدعوم (تعذّر قراءة XML).");
  return doc;
}

async function readXml(zip: JSZip, path: string): Promise<Document | null> {
  const f = zip.file(path);
  return f ? parseXml(await f.async("string")) : null;
}

function snapSize(pt: number): number {
  return SIZES.reduce((best, s) => (Math.abs(s - pt) < Math.abs(best - pt) ? s : best), SIZES[0]);
}

/* ----------------------------- الأنماط والترقيم ----------------------------- */

function readStyles(doc: Document | null) {
  const map = new Map<string, StyleInfo>();
  let baseSz = 12, baseCs = 12;
  if (!doc) return { map, baseSz, baseCs };
  const root = doc.documentElement;
  const defaults = wChild(wChild(wChild(root, "docDefaults"), "rPrDefault"), "rPr");
  const sz = wVal(wChild(defaults, "sz")), szCs = wVal(wChild(defaults, "szCs"));
  if (sz) baseSz = Number(sz) / 2 || baseSz;
  baseCs = szCs ? Number(szCs) / 2 || baseSz : baseSz;
  for (const s of kids(root).filter(c => isW(c, "style"))) {
    const id = s.getAttributeNS(W, "styleId");
    if (!id) continue;
    const ol = wVal(wChild(wChild(s, "pPr"), "outlineLvl"));
    const np = wChild(wChild(s, "pPr"), "numPr");
    const nid = wVal(wChild(np, "numId"));
    map.set(id, {
      name: wVal(wChild(s, "name")) ?? id,
      outline: ol !== null ? Number(ol) : null,
      num: nid ? { numId: nid, level: Number(wVal(wChild(np, "ilvl")) ?? 0) || 0 } : null,
      basedOn: wVal(wChild(s, "basedOn"))
    });
  }
  return { map, baseSz, baseCs };
}

function readNumbering(doc: Document | null): Map<string, boolean> {
  const out = new Map<string, boolean>();
  if (!doc) return out;
  const root = doc.documentElement;
  const abstracts = new Map<string, Element>();
  for (const a of kids(root).filter(c => isW(c, "abstractNum"))) abstracts.set(a.getAttributeNS(W, "abstractNumId") ?? "", a);
  for (const n of kids(root).filter(c => isW(c, "num"))) {
    const numId = n.getAttributeNS(W, "numId") ?? "";
    const abs = abstracts.get(wVal(wChild(n, "abstractNumId")) ?? "");
    if (!abs) continue;
    for (const lvl of kids(abs).filter(c => isW(c, "lvl"))) {
      const ilvl = lvl.getAttributeNS(W, "ilvl") ?? "0";
      out.set(`${numId}:${ilvl}`, wVal(wChild(lvl, "numFmt")) !== "bullet");
    }
  }
  return out;
}

/* --------------------------------- الصور --------------------------------- */

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml"
};

function loadImage(ctx: Ctx, relId: string): Promise<string | null> {
  const cached = ctx.images.get(relId);
  if (cached) return cached;
  const p = (async () => {
    const target = ctx.rels.get(relId);
    if (!target) return null;
    const path = target.startsWith("/") ? target.slice(1) : `word/${target}`.replace(/\/\.\//g, "/");
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (!(ext in MIME)) {
      ctx.warnings.add(`صور بصيغة ${ext.toUpperCase()} (غالبًا معادلات MathType أو رسوم قديمة) لا يعرضها المتصفح، فاستُبدلت بعلامة.`);
      return null;
    }
    const f = ctx.zip.file(path);
    if (!f) return null;
    return `data:${MIME[ext]};base64,${await f.async("base64")}`;
  })();
  ctx.images.set(relId, p);
  return p;
}

/* ---------------------------------- النص ---------------------------------- */

type Inline = JSONContent;
type Piece = { kind: "inline"; node: Inline } | { kind: "block"; node: JSONContent };

type Mark = { type: string; attrs?: Record<string, any> };

function marksFor(run: Element, text: string, ctx: Ctx): Mark[] {
  const rPr = wChild(run, "rPr");
  if (!rPr) return [];
  const cs = !!wChild(rPr, "rtl") || (ARABIC.test(text) && !LATIN.test(text));
  const marks: Mark[] = [];
  if (wFlag(wChild(rPr, cs ? "bCs" : "b"))) marks.push({ type: "bold" });
  if (wFlag(wChild(rPr, cs ? "iCs" : "i"))) marks.push({ type: "italic" });
  if (wFlag(wChild(rPr, "u"))) marks.push({ type: "underline" });
  const va = wVal(wChild(rPr, "vertAlign"));
  if (va === "superscript") marks.push({ type: "superscript" });
  if (va === "subscript") marks.push({ type: "subscript" });

  const attrs: Record<string, string> = {};
  const color = wVal(wChild(rPr, "color"));
  if (color && color !== "auto" && /^[0-9a-fA-F]{6}$/.test(color) && color.toLowerCase() !== "000000") attrs.color = `#${color}`;
  const szEl = wVal(wChild(rPr, cs ? "szCs" : "sz"));
  if (szEl) {
    const base = cs ? ctx.baseCs : ctx.baseSz;
    const snapped = snapSize((Number(szEl) / 2) * (14 / base));
    if (snapped !== 14) attrs.fontSize = String(snapped);
  }
  if (Object.keys(attrs).length) marks.push({ type: "textStyle", attrs });

  const hl = wVal(wChild(rPr, "highlight"));
  if (hl && hl !== "none") marks.push({ type: "highlight", attrs: { color: HIGHLIGHT[hl] ?? "#fff2a8" } });
  else {
    const fill = wChild(rPr, "shd")?.getAttributeNS(W, "fill");
    if (fill && /^[0-9a-fA-F]{6}$/.test(fill) && fill.toLowerCase() !== "ffffff") marks.push({ type: "highlight", attrs: { color: `#${fill}` } });
  }
  return marks;
}

async function runPieces(run: Element, ctx: Ctx, allowLayout: boolean): Promise<Piece[]> {
  const out: Piece[] = [];
  const textOf = (): string => kids(run).filter(c => isW(c, "t")).map(c => c.textContent ?? "").join("");
  const marks = marksFor(run, textOf(), ctx);
  const text = (s: string) => {
    if (!s) return;
    out.push({ kind: "inline", node: { type: "text", text: s, ...(marks.length ? { marks } : {}) } });
  };
  for (const c of kids(run)) {
    if (c.namespaceURI !== W) continue;
    switch (c.localName) {
      case "t": text(c.textContent ?? ""); break;
      case "tab": text(" "); break;
      case "noBreakHyphen": text("-"); break;
      case "br": {
        const type = c.getAttributeNS(W, "type");
        if (type === "page" && allowLayout) out.push({ kind: "block", node: { type: "pageBreak" } });
        else if (!type || type === "textWrapping") out.push({ kind: "inline", node: { type: "hardBreak" } });
        break;
      }
      case "drawing": {
        const blip = c.getElementsByTagNameNS(A, "blip")[0];
        const rid = blip?.getAttributeNS(R, "embed");
        const ext = c.getElementsByTagNameNS(WP, "extent")[0];
        const cx = Number(ext?.getAttribute("cx") ?? 0);
        ctx.stats.images++;
        const src = rid ? await loadImage(ctx, rid) : null;
        if (src) {
          const pct = cx > 0 ? Math.max(10, Math.min(100, Math.round((cx / 6264000) * 100))) : 60;
          out.push({ kind: "block", node: { type: "image", attrs: { src, width: `${pct}%` } } });
        } else {
          out.push({ kind: "inline", node: { type: "text", text: "[صورة]", marks: [{ type: "highlight", attrs: { color: "#fde68a" } }] } });
        }
        break;
      }
      case "pict":
      case "object": {
        const isOle = c.getElementsByTagNameNS("urn:schemas-microsoft-com:office:office", "OLEObject").length > 0 || c.localName === "object";
        const img = c.getElementsByTagNameNS("urn:schemas-microsoft-com:vml", "imagedata")[0];
        const rid = img?.getAttributeNS(R, "id");
        if (isOle) {
          ctx.stats.mathType++;
          out.push({ kind: "inline", node: { type: "text", text: "[معادلة MathType]", marks: [{ type: "highlight", attrs: { color: "#fde68a" } }] } });
        } else if (rid) {
          ctx.stats.images++;
          const src = await loadImage(ctx, rid);
          out.push(src
            ? { kind: "block", node: { type: "image", attrs: { src } } }
            : { kind: "inline", node: { type: "text", text: "[صورة]", marks: [{ type: "highlight", attrs: { color: "#fde68a" } }] } });
        }
        break;
      }
      default: break;
    }
  }
  return out;
}

async function inlineChildren(parent: Element, ctx: Ctx, allowLayout: boolean): Promise<Piece[]> {
  const out: Piece[] = [];
  for (const c of kids(parent)) {
    if (isW(c, "r")) out.push(...await runPieces(c, ctx, allowLayout));
    else if (isW(c, "hyperlink") || isW(c, "ins") || isW(c, "smartTag") || isW(c, "fldSimple") || isW(c, "customXml")) {
      out.push(...await inlineChildren(c, ctx, allowLayout));
    } else if (isW(c, "sdt")) {
      const content = wChild(c, "sdtContent");
      if (content) out.push(...await inlineChildren(content, ctx, allowLayout));
    } else if (isM(c, "oMath")) {
      const latex = ommlToLatex(c);
      if (latex) { ctx.stats.equations++; out.push({ kind: "inline", node: { type: "mathInline", attrs: { latex } } }); }
    } else if (isM(c, "oMathPara")) {
      for (const m of kids(c).filter(x => isM(x, "oMath"))) {
        const latex = ommlToLatex(m);
        if (latex) { ctx.stats.equations++; out.push({ kind: "block", node: { type: "mathBlock", attrs: { latex } } }); }
      }
    }
  }
  return out;
}

function mergeText(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (prev && prev.type === "text" && n.type === "text" && JSON.stringify(prev.marks ?? []) === JSON.stringify(n.marks ?? [])) {
      prev.text = (prev.text ?? "") + (n.text ?? "");
    } else out.push({ ...n });
  }
  return out;
}

/* ------------------------------- الفقرات ------------------------------- */

type ParaInfo = {
  blocks: JSONContent[];
  heading: number | null;
  list: { numId: string; level: number } | null;
};

async function convertParagraph(p: Element, ctx: Ctx, allowLayout: boolean): Promise<ParaInfo> {
  const pPr = wChild(p, "pPr");
  const styleId = wVal(wChild(pPr, "pStyle"));
  const style = styleId ? ctx.styles.get(styleId) : undefined;
  const styleName = (style?.name ?? styleId ?? "").toLowerCase();
  let heading: number | null = null;
  const hm = /^(?:heading|عنوان)\s*(\d)/.exec(styleName) ?? /^heading(\d)/.exec((styleId ?? "").toLowerCase());
  if (hm) heading = Math.min(3, Math.max(1, Number(hm[1])));
  else if (styleName === "title" || styleName === "العنوان") heading = 1;
  else {
    const ol = wVal(wChild(pPr, "outlineLvl"));
    const lvl = ol !== null ? Number(ol) : style?.outline ?? null;
    if (lvl !== null && lvl >= 0 && lvl <= 2) heading = lvl + 1;
  }

  const numPr = wChild(pPr, "numPr");
  const numId = wVal(wChild(numPr, "numId"));
  // الترقيم قد يأتي من الفقرة مباشرة أو من نمطها (List Bullet…) أو من نمط موروث.
  let inherited: { numId: string; level: number } | null = null;
  for (let id = styleId, hops = 0; id && hops < 8 && !inherited; hops++) {
    const s = ctx.styles.get(id);
    inherited = s?.num ?? null;
    id = s?.basedOn ?? null;
  }
  const direct = numPr && numId ? { numId, level: Number(wVal(wChild(numPr, "ilvl")) ?? 0) || 0 } : null;
  const chosen = direct ?? inherited;
  const list = !heading && chosen && chosen.numId !== "0" ? chosen : null;

  const pieces = await inlineChildren(p, ctx, allowLayout);
  const blocks: JSONContent[] = [];
  if (wFlag(wChild(pPr, "pageBreakBefore")) && allowLayout) blocks.push({ type: "pageBreak" });

  const plain = pieces.filter(x => x.kind === "inline").map(x => x.node.text ?? "").join("");
  const bidi = !!wChild(pPr, "bidi");
  const arabic = (plain.match(new RegExp(ARABIC.source, "g")) ?? []).length;
  const latin = (plain.match(/[A-Za-z]/g) ?? []).length;
  const rtl = bidi || (arabic > 0 && arabic >= latin);

  const jc = wVal(wChild(pPr, "jc"));
  let visual: string | null = null;
  if (jc === "center") visual = "center";
  else if (jc === "both" || jc === "distribute" || jc === "lowKashida" || jc === "mediumKashida" || jc === "highKashida") visual = "justify";
  else if (jc === "left" || jc === "start") visual = bidi ? "right" : "left";
  else if (jc === "right" || jc === "end") visual = bidi ? "left" : "right";
  const natural = rtl ? "right" : "left";

  const attrs: Record<string, unknown> = {};
  if (!rtl) attrs.dir = "ltr";
  if (visual && visual !== natural) attrs.textAlign = visual;

  let cur: Inline[] = [];
  const flush = (force: boolean) => {
    const content = mergeText(cur);
    cur = [];
    if (!content.length && !force) return;
    const node: JSONContent = heading
      ? { type: "heading", attrs: { level: heading, ...attrs } }
      : { type: "paragraph", ...(Object.keys(attrs).length ? { attrs } : {}) };
    if (content.length) node.content = content;
    blocks.push(node);
  };

  let sawBlock = false;
  for (const piece of pieces) {
    if (piece.kind === "inline") cur.push(piece.node);
    else {
      if (piece.node.type === "pageBreak" && !allowLayout) continue;
      flush(false);
      blocks.push(piece.node);
      sawBlock = true;
    }
  }
  flush(!sawBlock && !blocks.some(b => b.type !== "pageBreak"));

  // فقرة لا تحوي إلا معادلة واحدة: تُعرض كمعادلة مستقلة (كما في Word).
  if (blocks.length === 1 && blocks[0].type === "paragraph") {
    const c = (blocks[0].content ?? []).filter(n => !(n.type === "text" && !(n.text ?? "").trim()));
    if (c.length === 1 && c[0].type === "mathInline") blocks[0] = { type: "mathBlock", attrs: { latex: c[0].attrs?.latex ?? "" } };
  }

  if (heading) ctx.stats.headings++; else if (!list) ctx.stats.paragraphs++;
  return { blocks, heading, list };
}

/* -------------------------------- القوائم -------------------------------- */

type ListItem = { level: number; ordered: boolean; numId: string; blocks: JSONContent[] };

function buildList(items: ListItem[]): JSONContent {
  type Frame = { level: number; list: JSONContent };
  const mk = (ordered: boolean): JSONContent => ({ type: ordered ? "orderedList" : "bulletList", content: [] });
  const stack: Frame[] = [];
  for (const it of items) {
    while (stack.length > 1 && it.level < stack[stack.length - 1].level) stack.pop();
    if (!stack.length) stack.push({ level: it.level, list: mk(it.ordered) });
    else if (it.level > stack[stack.length - 1].level) {
      const parent = stack[stack.length - 1].list;
      const last = parent.content![parent.content!.length - 1];
      const nested = mk(it.ordered);
      if (last) last.content!.push(nested);
      stack.push({ level: it.level, list: nested });
    }
    const blocks = it.blocks.length ? [...it.blocks] : [{ type: "paragraph" }];
    if (blocks[0].type !== "paragraph") blocks.unshift({ type: "paragraph" });
    stack[stack.length - 1].list.content!.push({ type: "listItem", content: blocks });
  }
  return stack[0].list;
}

/* --------------------------------- الجداول --------------------------------- */

async function convertTable(tbl: Element, ctx: Ctx): Promise<JSONContent | null> {
  const rowsEl = kids(tbl).filter(c => isW(c, "tr"));
  type Cell = { el: Element; col: number; span: number; vm: "restart" | "continue" | null };
  const grid: Cell[][] = rowsEl.map(tr => {
    let col = 0;
    return kids(tr).filter(c => isW(c, "tc")).map(tc => {
      const pr = wChild(tc, "tcPr");
      const span = Number(wVal(wChild(pr, "gridSpan")) ?? 1) || 1;
      const vmEl = wChild(pr, "vMerge");
      const vm = vmEl ? (wVal(vmEl) === "restart" ? "restart" : "continue") : null;
      const cell: Cell = { el: tc, col, span, vm };
      col += span;
      return cell;
    });
  });
  if (!grid.length) return null;
  ctx.stats.tables++;

  const rows: JSONContent[] = [];
  for (let r = 0; r < grid.length; r++) {
    const cells: JSONContent[] = [];
    for (const cell of grid[r]) {
      if (cell.vm === "continue") continue;
      let rowspan = 1;
      if (cell.vm === "restart") {
        for (let k = r + 1; k < grid.length; k++) {
          const below = grid[k].find(c => c.col === cell.col);
          if (below && below.vm === "continue") rowspan++; else break;
        }
      }
      const content = await convertBody(kids(cell.el), ctx, false);
      cells.push({
        type: "tableCell",
        attrs: { colspan: cell.span, rowspan },
        content: content.length ? content : [{ type: "paragraph" }]
      });
    }
    if (cells.length) rows.push({ type: "tableRow", content: cells });
  }
  return rows.length ? { type: "table", content: rows } : null;
}

/* --------------------------------- الجسم --------------------------------- */

async function convertBody(children: Element[], ctx: Ctx, allowLayout: boolean): Promise<JSONContent[]> {
  const out: JSONContent[] = [];
  let pending: ListItem[] = [];
  const flushList = () => {
    if (pending.length) { ctx.stats.lists++; out.push(buildList(pending)); pending = []; }
  };
  for (const el of children) {
    if (isW(el, "p")) {
      const info = await convertParagraph(el, ctx, allowLayout);
      if (info.list) {
        const ordered = ctx.numbering.get(`${info.list.numId}:${info.list.level}`) ?? false;
        // تغيّر نظام الترقيم عند المستوى الأعلى يبدأ قائمة جديدة (نقطية ثم مرقمة مثلًا).
        if (pending.length && info.list.level <= pending[0].level && (info.list.numId !== pending[0].numId || ordered !== pending[0].ordered)) flushList();
        pending.push({ level: info.list.level, ordered, numId: info.list.numId, blocks: info.blocks.filter(b => b.type !== "pageBreak") });
      } else {
        flushList();
        out.push(...info.blocks);
      }
    } else if (isW(el, "tbl")) {
      flushList();
      const t = await convertTable(el, ctx);
      if (t) out.push(t);
    } else if (isW(el, "sdt")) {
      flushList();
      const content = wChild(el, "sdtContent");
      if (content) out.push(...await convertBody(kids(content), ctx, allowLayout));
    }
  }
  flushList();
  return out;
}

/* ---------------------------------- الصفحة ---------------------------------- */

function readPage(body: Element): ImportResult["page"] {
  const sect = kids(body).find(c => isW(c, "sectPr")) ?? Array.from(body.getElementsByTagNameNS(W, "sectPr")).pop();
  if (!sect) return null;
  const sz = wChild(sect, "pgSz");
  const mar = wChild(sect, "pgMar");
  const w = Number(sz?.getAttributeNS(W, "w") ?? 0), h = Number(sz?.getAttributeNS(W, "h") ?? 0);
  const landscape = sz?.getAttributeNS(W, "orient") === "landscape" || (w > 0 && h > 0 && w > h);
  const mm = (name: string, dflt: number) => {
    const v = Number(mar?.getAttributeNS(W, name));
    return Number.isFinite(v) && v > 0 ? Math.min(40, Math.max(5, Math.round(v / 56.7))) : dflt;
  };
  const side = Math.round((mm("left", 18) + mm("right", 18)) / 2);
  return {
    orientation: landscape ? "landscape" : "portrait",
    marginsMm: { top: mm("top", 20), bottom: mm("bottom", 20), left: side, right: side }
  };
}

/** أكبر صورة مرسومة في رؤوس الصفحات (الإطار/الورق الرسمي)؛ تُهمل الصور الصغيرة (الشعارات). */
async function readBackground(zip: JSZip): Promise<string | null> {
  let best: { area: number; dataUrl: string } | null = null;
  for (const hf of zip.file(/^word\/header\d*\.xml$/)) {
    const xml = new DOMParser().parseFromString(await hf.async("string"), "application/xml");
    const relFile = zip.file(hf.name.replace("word/", "word/_rels/") + ".rels");
    if (!relFile) continue;
    const rels = new Map<string, string>();
    for (const r of Array.from(new DOMParser().parseFromString(await relFile.async("string"), "application/xml").getElementsByTagName("Relationship"))) {
      const id = r.getAttribute("Id"), t = r.getAttribute("Target");
      if (id && t) rels.set(id, t);
    }
    for (const d of Array.from(xml.getElementsByTagNameNS(W, "drawing"))) {
      const ext = d.getElementsByTagNameNS(WP, "extent")[0];
      const blip = d.getElementsByTagNameNS(A, "blip")[0];
      const id = blip?.getAttributeNS(R, "embed");
      if (!ext || !id) continue;
      // 914400 EMU = بوصة؛ نتجاهل ما هو أصغر من ربع صفحة تقريبًا
      const wIn = Number(ext.getAttribute("cx")) / 914400, hIn = Number(ext.getAttribute("cy")) / 914400;
      const area = wIn * hIn;
      if (!(area > 0.25 * 8.27 * 11.69) || (best && best.area >= area)) continue;
      const target = rels.get(id);
      if (!target) continue;
      const path = target.startsWith("/") ? target.slice(1) : `word/${target}`.replace(/\/\.\//g, "/");
      const ext2 = path.split(".").pop()?.toLowerCase() ?? "";
      const mime = ext2 === "png" ? "image/png" : ext2 === "jpg" || ext2 === "jpeg" ? "image/jpeg" : ext2 === "webp" ? "image/webp" : null;
      const f = zip.file(path);
      if (!mime || !f) continue;
      best = { area, dataUrl: `data:${mime};base64,${await f.async("base64")}` };
    }
  }
  return best?.dataUrl ?? null;
}

/** يقرأ ملف .docx ويحوّله إلى محتوى المحرر (مع المعادلات) وتقرير بما تعذّر تحويله. */
export async function importDocx(buffer: ArrayBuffer): Promise<ImportResult> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(buffer); } catch { throw new Error("الملف ليس بصيغة .docx صالحة (ملفات .doc القديمة غير مدعومة، احفظها من Word بصيغة docx)."); }
  const docXml = await readXml(zip, "word/document.xml");
  if (!docXml) throw new Error("لم أجد محتوى المستند داخل الملف (word/document.xml).");

  const styles = readStyles(await readXml(zip, "word/styles.xml"));
  const numbering = readNumbering(await readXml(zip, "word/numbering.xml"));
  const rels = new Map<string, string>();
  const relDoc = await readXml(zip, "word/_rels/document.xml.rels");
  if (relDoc) {
    for (const r of Array.from(relDoc.getElementsByTagName("Relationship"))) {
      const id = r.getAttribute("Id"), target = r.getAttribute("Target");
      if (id && target) rels.set(id, target);
    }
  }

  const ctx: Ctx = {
    styles: styles.map, numbering, rels, zip, baseSz: styles.baseSz, baseCs: styles.baseCs,
    stats: { paragraphs: 0, headings: 0, lists: 0, tables: 0, images: 0, equations: 0, mathType: 0 },
    warnings: new Set(), images: new Map()
  };

  const body = kids(docXml.documentElement).find(c => isW(c, "body"));
  if (!body) throw new Error("بنية المستند غير مفهومة (لا يوجد جسم).");
  let content = await convertBody(kids(body), ctx, true);
  if (!content.length) content = [{ type: "paragraph" }];

  if (ctx.stats.mathType > 0) {
    ctx.warnings.add(
      `${ctx.stats.mathType} معادلة بصيغة MathType لم تُحوَّل (وُضعت مكانها علامة [معادلة MathType]). في Word: من تبويب MathType اختر «Convert Equations» وحوّلها إلى «Office Math»، ثم احفظ الملف وأعد استيراده.`
    );
  }
  if (zip.file("word/footnotes.xml") && /<w:footnote\s[^>]*w:id="[1-9]/.test(await zip.file("word/footnotes.xml")!.async("string"))) {
    ctx.warnings.add("الحواشي السفلية لم تُستورد.");
  }
  if (Array.from(zip.file(/word\/(header|footer)\d*\.xml$/)).length) {
    ctx.warnings.add("رؤوس وتذييلات Word لم تُستورد؛ أضفها من «إعدادات الصفحة».");
  }
  const background = await readBackground(zip);
  if (background) ctx.warnings.add("صورة الرأس (الإطار/الورق الرسمي) استُوردت كخلفية لكل صفحة.");
  ctx.warnings.add("الخطوط الأصلية وتباعد الأسطر والأنماط المخصصة لا تُنقل؛ يُستخدم تنسيق المحرر.");

  return { content: { type: "doc", content }, stats: ctx.stats, warnings: Array.from(ctx.warnings), background, page: readPage(body) };
}
