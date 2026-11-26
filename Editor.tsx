import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import type { MathfieldElement } from "mathlive";
import type { MathPressDocument } from "./types";
import { buildExtensions } from "./extensions";
import { EDIT_GRAPH_EVENT, type EditGraphDetail } from "./GraphNode";
import { sanitizeSpec, type GraphSpec } from "./graphSpec";
import Toolbar, { type RibbonActions } from "./Toolbar";
import GraphDialog from "./GraphDialog";
import SearchPanel from "./SearchPanel";
import ParagraphFormatDialog, { selectedParagraphFormat } from "./ParagraphFormat";
import EducationalInsert from "./EducationalInsert";
import MathTools from "./MathTools";
import { EDIT_MATH_EVENT, mathFormat } from "./MathNodes";
import PrintPreview, { type PrintOptions } from "./PrintPreview";
import StyleManager from "./StyleManager";
import {
  applyEducationalStyle, educationalStyleDeclarations, resolveEducationalStyles, updateParagraphAttributes, type EducationalStyle
} from "./educationalStyles";

type Props = {
  doc: MathPressDocument;
  onChange: (content: JSONContent) => void;
  onStyles: (styles: EducationalStyle[]) => void;
  onNumberStart: (numberingStart: number) => void;
  onPageCount: (pages: number) => void;
  onNotice: (message: string) => void;
  actions: RibbonActions;
};

type ZoomMode = number | "width" | "page";

export default function DocumentEditor({ doc, onChange, onStyles, onNumberStart, onPageCount, onNotice, actions }: Props) {
  const m = doc.page.marginsMm;
  const landscape = doc.page.orientation === "landscape";
  const extensions = useMemo(() => buildExtensions(), []);
  const [pageCount, setPageCount] = useState(1);
  const [printOptions, setPrintOptions] = useState<PrintOptions | null>(null);
  const [zoomMode, setZoomMode] = useState<ZoomMode>(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [focusMode, setFocusMode] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [wordCount, setWordCount] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLElement>(null);
  const zoom = printOptions ? 1 : typeof zoomMode === "number" ? zoomMode : fitZoom;
  const [showSearch, setShowSearch] = useState(false);
  const [showParagraphFormat, setShowParagraphFormat] = useState(false);
  const [copiedParagraph, setCopiedParagraph] = useState<ReturnType<typeof selectedParagraphFormat> | undefined>(undefined);
  const [showStyles, setShowStyles] = useState(false);
  const styles = useMemo(() => resolveEducationalStyles(doc.educationalStyles), [doc.educationalStyles]);
  const styleSheet = useMemo(() => styles.map(style =>
    `.mp-editor [data-educational-style="${style.id}"] { ${educationalStyleDeclarations(style)} }`
  ).join("\n"), [styles]);
  const [latexOpen, setLatexOpen] = useState(false);
  const [latexDraft, setLatexDraft] = useState("");
  const [latexTarget, setLatexTarget] = useState<{ pos: number; inline: boolean } | null>(null);
  const [latexFormat, setLatexFormat] = useState<ReturnType<typeof mathFormat>>(() => mathFormat({}));
  const [latexWarning, setLatexWarning] = useState(false);
  const [graph, setGraph] = useState<{ pos: number | null; spec: GraphSpec | null } | null>(null);
  const previewRef = useRef<MathfieldElement | null>(null);

  const editor = useEditor({
    extensions,
    content: doc.content,
    editorProps: {
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "f") {
          event.preventDefault();
          setShowSearch(true);
          return true;
        }
        return false;
      },
      attributes: { dir: "rtl", lang: "ar", spellcheck: "true", class: "mp-editor", "aria-label": "محتوى المستند" }
    },
    onUpdate: ({ editor: ed }) => onChange(ed.getJSON())
  });

  useEffect(() => {
    if (!editor) return;
    editor.storage.pagination.onPages = (n: number) => { setPageCount(n); onPageCount(n); };
    setPageCount(editor.storage.pagination.pages);
    onPageCount(editor.storage.pagination.pages);
    return () => { editor.storage.pagination.onPages = null; };
  }, [editor, onPageCount]);

  // إعدادات الصفحة تصل إلى مقسّم الصفحات عبر تخزين الإضافة ثم يُعاد القياس.
  useEffect(() => {
    if (!editor) return;
    const st = editor.storage.pagination;
    st.footerText = doc.footerText;
    st.layout = {
      pageHeightMm: landscape ? 210 : 297,
      marginTopMm: m.top,
      marginBottomMm: m.bottom,
      headerText: doc.headerText,
      showPageNumbers: doc.showPageNumbers
    };
    editor.commands.repaginate();
  }, [editor, landscape, m.top, m.bottom, m.left, m.right, doc.headerText, doc.footerText, doc.showPageNumbers]);

  // اتجاه الصفحة عند الطباعة (@page لا يقبل متغيرات CSS فنكتبه ديناميكيًا).
  useEffect(() => {
    let style = document.getElementById("mp-page-style") as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "mp-page-style";
      document.head.appendChild(style);
    }
    style.textContent = `@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:0}`;
  }, [landscape]);

  const openGraph = useCallback((pos?: number) => {
    if (!editor) return;
    if (typeof pos === "number") {
      const node = editor.state.doc.nodeAt(pos);
      if (node?.type.name === "graph") {
        setGraph({ pos, spec: sanitizeSpec(node.attrs.spec) });
        return;
      }
    }
    setGraph({ pos: null, spec: null });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const handler = (e: Event) => openGraph((e as CustomEvent<EditGraphDetail>).detail.pos);
    const mathHandler = (e: Event) => {
      const { pos } = (e as CustomEvent<{ pos: number }>).detail;
      const node = editor.state.doc.nodeAt(pos);
      if (!node || !["mathInline", "mathBlock"].includes(node.type.name)) return;
      setLatexTarget({ pos, inline: node.type.name === "mathInline" });
      setLatexDraft(String(node.attrs.latex ?? ""));
      setLatexFormat(mathFormat(node.attrs));
      setLatexOpen(true);
    };
    dom.addEventListener(EDIT_GRAPH_EVENT, handler);
    dom.addEventListener(EDIT_MATH_EVENT, mathHandler);
    return () => {
      dom.removeEventListener(EDIT_GRAPH_EVENT, handler);
      dom.removeEventListener(EDIT_MATH_EVENT, mathHandler);
    };
  }, [editor, openGraph]);

  useEffect(() => {
    if (!latexOpen || !previewRef.current) return;
    previewRef.current.value = latexDraft;
    setLatexWarning(previewRef.current.errors.length > 0);
  }, [latexOpen, latexDraft]);

  useEffect(() => {
    editor?.commands.repaginate();
  }, [editor, styleSheet, zoom]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof zoomMode === "number" || printOptions) return;
    const width = (landscape ? 297 : 210) * 96 / 25.4;
    const height = (landscape ? 210 : 297) * 96 / 25.4;
    const fit = () => {
      const css = getComputedStyle(stage);
      const availableWidth = stage.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const availableHeight = viewportHeight - Math.max(0, stage.getBoundingClientRect().top) - 56;
      setFitZoom(Math.max(.2, Math.min(2, availableWidth / width, zoomMode === "page" ? availableHeight / height : 2)));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    fit();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
    };
  }, [zoomMode, landscape, printOptions]);

  useEffect(() => {
    if (!editor) return;
    const refreshWords = () => {
      const content = editor.state.doc;
      const text = content.textBetween(0, content.content.size, " ");
      setWordCount(text.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)?.length ?? 0);
    };
    const refreshPage = () => {
      const { from } = editor.state.selection;
      const starts = editor.storage.pagination.pageStarts as number[];
      setCurrentPage(1 + starts.filter(pos => pos <= from).length);
    };
    editor.on("update", refreshWords);
    editor.on("transaction", refreshPage);
    refreshWords();
    refreshPage();
    return () => { editor.off("update", refreshWords); editor.off("transaction", refreshPage); };
  }, [editor]);

  useEffect(() => {
    const source = paperRef.current?.querySelector<HTMLElement>(".editor-source");
    if (source) source.inert = !!printOptions;
  }, [printOptions]);

  if (!editor) return null;

  const openNewLatex = (latex = "") => {
    setLatexTarget(null);
    setLatexFormat(mathFormat({}));
    setLatexDraft(latex);
    setLatexOpen(true);
  };
  const closeLatex = () => {
    setLatexOpen(false);
    editor.commands.focus();
  };
  const insertLatex = (kind: "inline" | "block", duplicate = false) => {
    const latex = latexDraft.trim();
    if (!latex) return;
    if (!latexTarget) {
      if (kind === "inline") editor.chain().focus().insertMathInline(latex, false).run();
      else editor.chain().focus().insertMathBlock(latex, false).run();
    } else {
      const { pos, inline } = latexTarget;
      const node = editor.state.doc.nodeAt(pos);
      if (!node || node.type.name !== (inline ? "mathInline" : "mathBlock")) return;
      const type = kind === "inline" ? "mathInline" : "mathBlock";
      const attrs = { ...node.attrs, ...mathFormat(latexFormat), latex };
      if (type === node.type.name && !duplicate) {
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, attrs));
      } else {
        const equation = { type, attrs };
        const content = kind === "inline" && !inline ? { type: "paragraph", content: [equation] } : equation;
        const range = duplicate ? pos + node.nodeSize : { from: pos, to: pos + node.nodeSize };
        if (!editor.commands.insertContentAt(range, content)) {
          onNotice("تعذر تغيير موضع المعادلة في الكتلة الحالية.");
          return;
        }
      }
    }
    closeLatex();
  };
  const deleteLatex = () => {
    if (!latexTarget) return;
    const node = editor.state.doc.nodeAt(latexTarget.pos);
    if (node?.type.name === (latexTarget.inline ? "mathInline" : "mathBlock"))
      editor.commands.deleteRange({ from: latexTarget.pos, to: latexTarget.pos + node.nodeSize });
    closeLatex();
  };

  const saveGraph = (spec: GraphSpec) => {
    if (graph?.pos != null && editor.state.doc.nodeAt(graph.pos)?.type.name === "graph") {
      editor.view.dispatch(editor.state.tr.setNodeMarkup(graph.pos, undefined, { spec }));
    } else {
      editor.chain().focus().insertGraph(spec).run();
    }
    setGraph(null);
  };

  const paperStyle = {
    "--editor-zoom": zoom,
    "--numbering-start": (doc.numberingStart ?? 1) - 1,
    "--pt": `${m.top}mm`,
    "--pb": `${m.bottom}mm`,
    "--px": `${m.left}mm`,
    "--pl": `${m.left}mm`,
    "--pr": `${m.right}mm`,
    "--pw": landscape ? "297mm" : "210mm",
    "--ph": landscape ? "210mm" : "297mm"
  } as CSSProperties;
  if (doc.background && printOptions?.backgrounds && !printOptions.economical) {
    Object.assign(paperStyle, { "--print-background": `url("${doc.background}")` });
  } else if (doc.background && !printOptions) {
    // طبقة لكل صفحة؛ المسافة بين الصفحات على الشاشة 26px وتُصفَّر عند الطباعة (--gap)
    const n = Math.max(1, Math.min(pageCount, 60));
    const url = `url("${doc.background}")`;
    const pos = Array.from({ length: n }, (_, k) => `0 calc(${k} * (var(--ph) + var(--gap)))`).join(",");
    Object.assign(paperStyle, {
      backgroundImage: Array(n).fill(url).join(","),
      backgroundSize: "var(--pw) var(--ph)",
      backgroundRepeat: "no-repeat",
      backgroundPosition: pos
    });
  }

  const openPrint = () => {
    setShowSearch(false);
    setPrintOptions({ backgrounds: true, numbers: doc.showPageNumbers, economical: false });
  };

  const goToPage = (page: number) => {
    const target = page === 1 ? paperRef.current : paperRef.current?.querySelectorAll(".pg-header")[page - 2];
    target?.scrollIntoView({ block: "start", inline: "nearest" });
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else onNotice("وضع ملء الشاشة غير متاح في هذا المتصفح.");
    } catch { onNotice("تعذر تفعيل وضع ملء الشاشة."); }
  };

  return (
    <>
      <style>{styleSheet}</style>
      {printOptions && <PrintPreview paper={paperRef} editor={editor} options={printOptions}
        onChange={setPrintOptions} usableHeightMm={(landscape ? 210 : 297) - m.top - m.bottom}
        onClose={() => { setPrintOptions(null); editor.commands.focus(); }} onPrint={actions.onPrint} />}
      {!printOptions && focusMode && <div className="focus-controls no-print">
        <button type="button" onClick={() => { setFocusMode(false); editor.commands.focus(); }}>إنهاء وضع التركيز</button>
      </div>}
      {!printOptions && !focusMode && <Toolbar
        editor={editor}
        page={doc.page}
        actions={{ ...actions, onPrint: openPrint }}
        onSearch={() => setShowSearch(v => !v)}
        paragraphTools={<section className="rb-group" aria-label="تنسيق متقدم للفقرة">
          <div className="rb-line">
            <button type="button" onClick={() => setShowParagraphFormat(true)}>تنسيق الفقرة</button>
            <button type="button" onClick={() => setCopiedParagraph(selectedParagraphFormat(editor))}>نسخ تنسيق الفقرة</button>
            <button type="button" disabled={copiedParagraph === undefined}
              onClick={() => updateParagraphAttributes(editor, { paragraphFormat: copiedParagraph })}>لصق تنسيق الفقرة</button>
          </div>
        </section>}
        viewTools={<section className="rb-group" aria-label="عرض المستند">
          <div className="rb-line">
            <label>التكبير <select aria-label="تكبير العرض" value={zoomMode}
              onChange={e => {
                const value = e.target.value;
                setZoomMode(value === "width" || value === "page" ? value : Number(value));
              }}>
              <option value="width">ملاءمة العرض</option><option value="page">صفحة كاملة</option>
              {[.5, .75, 1, 1.25, 1.5, 2].map(value => <option key={value} value={value}>{value * 100}%</option>)}
            </select></label>
            <button type="button" onClick={() => setShowPages(v => !v)} aria-pressed={showPages}>لوحة الصفحات</button>
            <button type="button" onClick={() => setFocusMode(true)}>وضع التركيز</button>
            <button type="button" onClick={() => { void toggleFullscreen(); }}>ملء الشاشة</button>
          </div>
        </section>}
        mathTools={<MathTools editor={editor} onSource={openNewLatex} />}
        educationalTools={<>
          <section className="rb-group" aria-label="الأنماط التعليمية">
            <div className="rb-line">
              <select aria-label="تطبيق نمط تعليمي" value="" onChange={e => applyEducationalStyle(editor, e.target.value || null)}>
                <option value="" disabled>تطبيق نمط…</option>
                {styles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}
              </select>
              <button type="button" onClick={() => applyEducationalStyle(editor, null)}>إزالة النمط</button>
              <button type="button" onClick={() => setShowStyles(true)}>إدارة الأنماط</button>
            </div>
          </section>
          <EducationalInsert editor={editor} numberStart={doc.numberingStart ?? 1} onNumberStart={onNumberStart} />
        </>}
        onOpenLatex={() => openNewLatex()}
        onGraph={openGraph}
        onError={onNotice}
      />}
      {!printOptions && !focusMode && showSearch && <SearchPanel editor={editor} close={() => { setShowSearch(false); editor.commands.focus(); }} />}
      {showParagraphFormat && <ParagraphFormatDialog editor={editor} close={() => setShowParagraphFormat(false)} />}
      {showStyles && <StyleManager key={doc.id} overrides={doc.educationalStyles ?? []}
        onChange={onStyles} onApply={id => applyEducationalStyle(editor, id)} onClose={() => setShowStyles(false)} />}
      <div className={`page-stage${focusMode ? " document-focus" : ""}`} ref={stageRef}>
        {showPages && !focusMode && !printOptions && <nav className="page-navigation no-print" aria-label="التنقل بين الصفحات">
          {Array.from({ length: pageCount }, (_, index) => <button type="button" key={index}
            aria-current={currentPage === index + 1 ? "page" : undefined} onClick={() => goToPage(index + 1)}>صفحة {index + 1}</button>)}
        </nav>}
        <article ref={paperRef} className={`paper${printOptions ? " preview-paper" : ""}${printOptions?.economical ? " economical-paper" : ""}`}
          id="print-document" style={paperStyle}>
          <div className="editor-source">
            <div className="paper-header" aria-hidden="true"><span>{doc.headerText}</span></div>
            <EditorContent editor={editor} />
          </div>
          {printOptions && <div className="mp-editor print-pages" />}
        </article>
      </div>

      {!focusMode && !printOptions && <div className="document-view-status no-print">
        <span>صفحة {currentPage} من {pageCount}</span><span>{wordCount} كلمة</span><span dir="ltr">{Math.round(zoom * 100)}%</span>
      </div>}
      {graph && <GraphDialog initial={graph.spec} onSave={saveGraph} onClose={() => setGraph(null)} />}

      {latexOpen && (
        <div className="modal-backdrop no-print" onClick={closeLatex}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={latexTarget ? "تحرير معادلة LaTeX" : "إدراج معادلة من LaTeX"}
            onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") closeLatex(); }}>
            <strong>{latexTarget ? "تحرير معادلة LaTeX" : "إدراج معادلة من LaTeX"}</strong>
            <p className="muted">الصق أو اكتب مصدر LaTeX، مثل <code dir="ltr">\int_0^1 x^2\,dx</code></p>
            <textarea
              className="latex-input"
              dir="ltr"
              autoFocus
              value={latexDraft}
              onChange={e => setLatexDraft(e.target.value)}
              spellCheck={false}
              aria-label="مصدر LaTeX"
            />
            <div className="latex-preview">
              <math-field ref={el => { previewRef.current = el as unknown as MathfieldElement | null; }} read-only />
            </div>
            {latexWarning && <p className="gerror" role="status">راجع صياغة LaTeX قبل الحفظ.</p>}
            {latexTarget && <div className="grow-row">
              <label className="gfield">لون المعادلة<input type="color" value={latexFormat.color ?? "#161616"}
                onChange={e => setLatexFormat({ ...latexFormat, color: e.target.value })} /></label>
              <label className="gfield">الحجم (نقطة)<input type="number" min="8" max="72" value={latexFormat.size ?? ""}
                onChange={e => setLatexFormat({ ...latexFormat, size: e.target.valueAsNumber || null })} /></label>
              <label className="gfield">محاذاة الكتلة<select value={latexFormat.align ?? ""}
                onChange={e => setLatexFormat(mathFormat({ ...latexFormat, align: e.target.value }))}>
                <option value="">افتراضية</option><option value="right">يمين</option><option value="center">وسط</option><option value="left">يسار</option>
              </select></label>
            </div>}
            <div className="modal-actions">
              <button type="button" className="primary-action" disabled={!latexDraft.trim()} onClick={() => insertLatex("block")}>
                {latexTarget ? "حفظ ككتلة" : "إدراج كتلة"}
              </button>
              <button type="button" disabled={!latexDraft.trim()} onClick={() => insertLatex("inline")}>
                {latexTarget ? "حفظ داخل السطر" : "إدراج داخل السطر"}
              </button>
              {latexTarget && <>
                <button type="button" disabled={!latexDraft.trim()} onClick={() => insertLatex(latexTarget.inline ? "inline" : "block", true)}>تكرار</button>
                <button type="button" onClick={() => {
                  void navigator.clipboard.writeText(latexDraft).then(() => onNotice("تم نسخ LaTeX."))
                    .catch(() => onNotice("تعذر النسخ تلقائيًا."));
                }}>نسخ LaTeX</button>
                <button type="button" className="danger" onClick={deleteLatex}>حذف المعادلة</button>
              </>}
              <button type="button" onClick={closeLatex}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
