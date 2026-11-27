import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { buildExtensions } from "./extensions";
import { createDocument, parseDocument } from "./document";
import { educationalStyleDeclarations, resolveEducationalStyles } from "./educationalStyles";
import { MAX_IMPORT_BYTES, preservesSuppliedContent, validateImportedContent } from "./importValidation";
import { createIncrementalLayout } from "./incrementalLayout";
import { loadJXG } from "./graph";
import type { MathPressDocument } from "./types";
import { comparePageSource, type PageRange, type PageSource } from "./pageLayoutModel";
import "./live-lab.css";

const demo = () => {
  const doc = createDocument("تطبيقات المعادلات التفاضلية");
  doc.headerText = "السادس العلمي · مختبر الصفحات";
  doc.footerText = "MathPress Studio";
  doc.content.content!.push({
    type: "paragraph", content: [
      { type: "text", text: "نكتب المعادلة التفاضلية ونفصل المتغيرات ثم نكامل الطرفين. ".repeat(95) },
      { type: "mathInline", attrs: { latex: String.raw`\frac{dy}{dx}=2x` } },
      { type: "text", text: " وبذلك نحصل على الحل العام. ".repeat(30) }
    ]
  }, { type: "graph" });
  return doc;
};

// Paragraph fragments use Unicode character offsets. Tables, lists and
// other compound blocks currently expose block-level addresses only.
function sourcePosition(editor: Editor, address: PageSource) {
  const doc = editor.state.doc;
  if (address.block >= doc.childCount) return null;
  let position = 0;
  for (let index = 0; index < address.block; index++) position += doc.child(index).nodeSize;
  const node = doc.child(address.block);
  if (!node.isTextblock) return position;
  let remaining = address.offset;
  let offset = 0;
  node.forEach(child => {
    if (!remaining) return;
    if (child.isText) {
      for (const character of child.text ?? "") {
        if (!remaining) break;
        remaining--;
        offset += character.length;
      }
    } else {
      remaining--;
      offset += child.nodeSize;
    }
  });
  return position + 1 + offset;
}

function currentPreviewPage(editor: Editor, ranges: (PageRange | null)[]) {
  const cursor = editor.state.selection.$head;
  const block = cursor.index(0);
  const node = cursor.depth === 1 ? cursor.parent : null;
  const offset = node?.isTextblock
    ? Array.from(node.textBetween(0, cursor.parentOffset, "", "\uFFFC")).length
    : 0;
  const address = { block, offset };
  const page = ranges.findIndex(range => range &&
    comparePageSource(range.start, address) <= 0 && comparePageSource(address, range.end) < 0);
  return page >= 0 ? page + 1 : null;
}

export default function LiveLayoutLab() {
  const [doc, setDoc] = useState(demo);
  const [live, setLive] = useState(true);
  const [zoom, setZoom] = useState(0.62);
  const [notice, setNotice] = useState("");
  const [ranges, setRanges] = useState<(PageRange | null)[]>([]);
  const [layoutMs, setLayoutMs] = useState(0);
  const [rebuilt, setRebuilt] = useState(0);
  const [direct, setDirect] = useState(false);
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [viewedPage, setViewedPage] = useState(1);
  const [thumbnails, setThumbnails] = useState<readonly (readonly string[])[]>([]);
  const thumbnailCache = useRef(new WeakMap<Element, readonly string[]>());
  const [overflow, setOverflow] = useState(false);
  const projection = useRef<HTMLDivElement>(null);
  const extensions = useMemo(() => buildExtensions().filter(ext => ext.name !== "pagination"), []);
  const editor = useEditor({ extensions, content: doc.content });
  const { marginsMm: margins, orientation } = doc.page;
  const landscape = orientation === "landscape";
  const width = landscape ? 297 : 210;
  const height = landscape ? 210 : 297;
  const style = {
    "--pw": `${width}mm`, "--ph": `${height}mm`, "--pt": `${margins.top}mm`,
    "--pb": `${margins.bottom}mm`, "--pl": `${margins.left}mm`, "--pr": `${margins.right}mm`,
    "--editor-zoom": zoom, "--numbering-start": (doc.numberingStart ?? 1) - 1,
    "--print-background": doc.background ? `url("${doc.background}")` : "none"
  } as CSSProperties;
  const educational = useMemo(() => resolveEducationalStyles(doc.educationalStyles).map(s =>
    `.live-lab [data-educational-style="${s.id}"] { ${educationalStyleDeclarations(s)} }`
  ).join("\n"), [doc.educationalStyles]);

  useEffect(() => {
    if (!editor || !live || direct) return;
    const update = () => setCurrentPage(currentPreviewPage(editor, ranges));
    update();
    editor.on("selectionUpdate", update);
    return () => { editor.off("selectionUpdate", update); };
  }, [editor, ranges, live, direct]);

  useEffect(() => {
    if (!editor || !live || direct) return;
    const source = editor.view.dom;
    let timer = 0;
    let pending = new AbortController();
    let invalidateAll = true;
    const invalidated = new Set<HTMLElement>();
    const paginate = createIncrementalLayout();
    const options = { headerText: doc.headerText, footerText: doc.footerText, showPageNumbers: doc.showPageNumbers };
    const schedule = () => {
      pending.abort();
      pending = new AbortController();
      const { signal } = pending;
      clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const target = projection.current;
        if (signal.aborted || !target || editor.isDestroyed) return;
        target.inert = true;
        const result = await paginate(editor.state.doc, source, target, options, signal, invalidateAll, invalidated);
        if (!result || signal.aborted) return;
        invalidateAll = false;
        invalidated.clear();
        setRanges(result.ranges);
        setViewedPage(page => Math.min(page, result.ranges.length));
        setThumbnails([...target.children].map(sheet => {
          const existing = thumbnailCache.current.get(sheet);
          if (existing) return existing;
          const blocks = [...(sheet.querySelector(".print-sheet-content")?.children ?? [])].slice(0, 10)
            .map(block => block.matches("table,.tableWrapper,.graph-node,.math-block,img") ? "figure" : "text");
          thumbnailCache.current.set(sheet, blocks);
          return blocks;
        }));
        setOverflow(result.overflow);
        setRebuilt(result.rebuilt);
        setLayoutMs(result.elapsed);
      }, 20);
    };
    let active = true;
    const refresh = () => { if (active) { invalidateAll = true; schedule(); } };
    const changedResource = (event: Event) => {
      const element = event.target;
      if (!(element instanceof HTMLElement) || !element.matches("img")) return;
      for (let block = element; block.parentElement; block = block.parentElement) {
        if (block.parentElement === source) { invalidated.add(block); schedule(); break; }
      }
    };
    source.addEventListener("load", changedResource, true);
    const mutations = new MutationObserver(records => {
      for (const record of records) {
        const element = record.target instanceof Element ? record.target : record.target.parentElement;
        const graph = element?.closest(".graph-box");
        if (!graph) continue;
        for (let block: Element = graph; block.parentElement; block = block.parentElement) {
          if (block.parentElement === source && block instanceof HTMLElement) {
            invalidated.add(block);
            schedule();
            break;
          }
        }
      }
    });
    mutations.observe(source, { subtree: true, childList: true });
    document.fonts.addEventListener("loadingdone", refresh);
    editor.on("update", schedule);
    void document.fonts.ready.then(refresh);
    if (source.querySelector(".graph-node")) void loadJXG().then(refresh).catch(() => {});
    schedule();
    return () => {
      active = false;
      pending.abort();
      clearTimeout(timer);
      mutations.disconnect();
      source.removeEventListener("load", changedResource, true);
      document.fonts.removeEventListener("loadingdone", refresh);
      editor.off("update", schedule);
    };
  }, [editor, live, direct, doc.headerText, doc.footerText, doc.showPageNumbers, landscape, margins, zoom, educational]);

  const open = async (file: File | undefined) => {
    if (!file || !editor) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("الملف أكبر من 32 ميغابايت.");
      const raw = JSON.parse(await file.text());
      const parsed = parseDocument(raw);
      const content = parsed && validateImportedContent(parsed.content);
      if (!parsed || !content || (parsed.schemaVersion === 4 && !preservesSuppliedContent(raw, { ...parsed, content })))
        throw new Error("تعذّر فتح الملف مع الحفاظ على محتواه.");
      editor.commands.setContent(content, true);
      setDoc(parsed);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذّر فتح الملف.");
    }
  };

  const returnToPage = () => {
    const range = ranges[viewedPage - 1];
    if (!editor || !range) return;
    const position = sourcePosition(editor, range.start);
    if (position === null) return;
    editor.commands.focus(position, { scrollIntoView: true });
  };

  return <main className="live-lab" dir="rtl">
    <style>{educational}{`@page { size: A4 ${orientation}; margin: 0 }`}</style>
    <header className="live-lab-tools no-print">
      <a href="./" onClick={event => {
        event.preventDefault();
        const destination = new URL(location.href);
        destination.hash = "";
        history.replaceState(null, "", destination);
        location.reload();
      }}>العودة إلى Studio</a>
      <strong>مختبر الصفحات الحية</strong>
      <span className="version" dir="ltr">v{import.meta.env.VITE_APP_VERSION}</span>
      <label><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /> عرض الصفحات الحية</label>
      <label><input type="checkbox" checked={direct} onChange={e => setDirect(e.target.checked)} /> تحرير مباشر تجريبي بالأعمدة</label>
      <label>ملف MathDoc <input type="file" accept=".mathdoc" onChange={e => {
        void open(e.currentTarget.files?.[0]);
        e.currentTarget.value = "";
      }} /></label>
      <label>التكبير <select value={zoom} onChange={e => setZoom(Number(e.target.value))}>
        <option value={0.62}>62%</option><option value={0.8}>80%</option><option value={1}>100%</option>
      </select></label>
      <label>الاتجاه <select value={orientation} onChange={e => setDoc(old => ({
        ...old, page: { ...old.page, orientation: e.target.value === "landscape" ? "landscape" : "portrait" }
      }))}><option value="portrait">عمودي</option><option value="landscape">أفقي</option></select></label>
      <label>الهامش الرأسي <select value={margins.top} onChange={e => {
        const mm = Number(e.target.value);
        setDoc(old => ({ ...old, page: { ...old.page, marginsMm: { ...old.page.marginsMm, top: mm, bottom: mm } } }));
      }}>{[...new Set([margins.top, 12, 20, 28])].map(mm => <option key={mm}>{mm}</option>)}</select></label>
      <button type="button" disabled={!live || direct || !ranges.length} onClick={() => window.print()}>طباعة / PDF</button>
      {notice && <span role="alert">{notice}</span>}
    </header>
    <p className="live-lab-note no-print">التحرير في مصدر متصل. حدود المعاينة مأخوذة من محرك الطباعة. يشير التنقل في الجداول والقوائم الممتدة إلى بداية الكتلة. تغييرات المختبر مؤقتة.</p>
    <div className="live-lab-columns" style={style}>
      <section aria-label="المصدر القابل للتحرير" className="live-lab-source no-print">
        <div className={`paper${direct ? " live-lab-direct" : ""}`}><EditorContent editor={editor} /></div>
      </section>
      {live && !direct && <section aria-label="الصفحات الحية للقراءة" className="live-lab-result">
        <nav className="live-lab-pages no-print" aria-label="صفحات المعاينة">
          <output data-rebuilt={rebuilt} data-pages={ranges.length} data-layout-ms={layoutMs} data-ranges={JSON.stringify(ranges)}>
            {ranges.length} صفحة{overflow ? " · توجد كتلة تتجاوز المساحة" : ""}
          </output>
          {currentPage && <span className="live-lab-current">المؤشر في صفحة المعاينة {currentPage}</span>}
          <button type="button" onClick={() => editor?.commands.focus()}>متابعة التحرير عند المؤشر</button>
          <button type="button" disabled={!ranges[viewedPage - 1]} onClick={returnToPage}>تحرير من بداية الصفحة {viewedPage}</button>
          {ranges.map((_, index) => <button type="button" key={index}
            className="live-lab-thumbnail" aria-label={`معاينة الصفحة ${index + 1}`}
            aria-current={viewedPage === index + 1 ? "page" : undefined} onClick={() => {
              setViewedPage(index + 1);
              projection.current?.querySelector(`[data-print-page="${index + 1}"]`)?.scrollIntoView({ block: "start" });
            }}>
            <span className="live-lab-thumbnail-sheet" aria-hidden="true">
              {thumbnails[index]?.map((kind, block) => <i className={kind} key={block} />)}
            </span>
            {index + 1}
          </button>)}
        </nav>
        <article className="paper" id="print-document"><div className="mp-editor print-pages" ref={projection} /></article>
      </section>}
    </div>
  </main>;
}
