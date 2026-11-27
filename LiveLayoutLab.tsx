import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { buildExtensions } from "./extensions";
import { createDocument, parseDocument } from "./document";
import { educationalStyleDeclarations, resolveEducationalStyles } from "./educationalStyles";
import { MAX_IMPORT_BYTES, preservesSuppliedContent, validateImportedContent } from "./importValidation";
import { paginateForPrint } from "./PrintPagination";
import { loadJXG } from "./graph";
import type { MathPressDocument } from "./types";
import type { PageRange } from "./pageLayoutModel";
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

export default function LiveLayoutLab() {
  const [doc, setDoc] = useState(demo);
  const [live, setLive] = useState(true);
  const [zoom, setZoom] = useState(0.62);
  const [notice, setNotice] = useState("");
  const [ranges, setRanges] = useState<(PageRange | null)[]>([]);
  const [layoutMs, setLayoutMs] = useState(0);
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
    if (!editor || !live) return;
    const source = editor.view.dom;
    let timer = 0;
    let disposed = false;
    const reflow = () => {
      const target = projection.current;
      if (disposed || !target || editor.isDestroyed) return;
      target.inert = true;
      const started = performance.now();
      const result = paginateForPrint(source, target, { headerText: doc.headerText, footerText: doc.footerText });
      target.querySelectorAll(".pg-footer-num").forEach((label, index) => {
        label.textContent = doc.showPageNumbers ? `صفحة ${index + 1} من ${result.pages}` : "";
      });
      setRanges(result.ranges);
      setOverflow(result.overflow);
      setLayoutMs(performance.now() - started);
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = window.setTimeout(reflow, 240);
    };
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resize?.observe(source);
    // Graph SVG can arrive after the editor transaction and without a size change.
    const mutations = new MutationObserver(records => {
      if (records.some(record => (record.target as Element).closest?.(".graph-box") ||
        [...record.addedNodes].some(node => node instanceof Element && node.matches("svg")))) schedule();
    });
    mutations.observe(source, { subtree: true, childList: true });
    editor.on("update", schedule);
    void document.fonts.ready.then(() => { if (!disposed) schedule(); });
    if (source.querySelector(".graph-node")) void loadJXG().then(() => { if (!disposed) schedule(); }).catch(() => {});
    schedule();
    return () => {
      disposed = true;
      clearTimeout(timer);
      resize?.disconnect();
      mutations.disconnect();
      editor.off("update", schedule);
    };
  }, [editor, live, doc.headerText, doc.footerText, doc.showPageNumbers, landscape, margins, zoom, educational]);

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
      <button type="button" disabled={!live || !ranges.length} onClick={() => window.print()}>طباعة / PDF</button>
      {notice && <span role="alert">{notice}</span>}
    </header>
    <p className="live-lab-note no-print">التحرير في المصدر. تتحدث المعاينة تلقائيًا. تغييرات المختبر مؤقتة.</p>
    <div className="live-lab-columns" style={style}>
      <section aria-label="المصدر القابل للتحرير" className="live-lab-source no-print">
        <div className="paper"><EditorContent editor={editor} /></div>
      </section>
      {live && <section aria-label="الصفحات الحية للقراءة" className="live-lab-result">
        <nav className="live-lab-pages no-print" aria-label="صفحات المعاينة">
          <output data-pages={ranges.length} data-layout-ms={layoutMs} data-ranges={JSON.stringify(ranges)}>
            {ranges.length} صفحة{overflow ? " · توجد كتلة تتجاوز المساحة" : ""}
          </output>
          {ranges.map((_, index) => <button type="button" key={index} onClick={() =>
            projection.current?.querySelector(`[data-print-page="${index + 1}"]`)?.scrollIntoView({ block: "start" })
          }>{index + 1}</button>)}
        </nav>
        <article className="paper" id="print-document"><div className="mp-editor print-pages" ref={projection} /></article>
      </section>}
    </div>
  </main>;
}
