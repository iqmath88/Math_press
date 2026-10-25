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

type Props = {
  doc: MathPressDocument;
  onChange: (content: JSONContent) => void;
  onPageCount: (pages: number) => void;
  onNotice: (message: string) => void;
  actions: RibbonActions;
};

export default function DocumentEditor({ doc, onChange, onPageCount, onNotice, actions }: Props) {
  const m = doc.page.marginsMm;
  const landscape = doc.page.orientation === "landscape";
  const extensions = useMemo(() => buildExtensions(), []);
  const [latexOpen, setLatexOpen] = useState(false);
  const [latexDraft, setLatexDraft] = useState("");
  const [graph, setGraph] = useState<{ pos: number | null; spec: GraphSpec | null } | null>(null);
  const previewRef = useRef<MathfieldElement | null>(null);

  const editor = useEditor({
    extensions,
    content: doc.content,
    editorProps: {
      attributes: { dir: "rtl", lang: "ar", spellcheck: "true", class: "mp-editor", "aria-label": "محتوى المستند" }
    },
    onUpdate: ({ editor: ed }) => onChange(ed.getJSON())
  });

  useEffect(() => {
    if (!editor) return;
    editor.storage.pagination.onPages = onPageCount;
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
  }, [editor, landscape, m.top, m.bottom, doc.headerText, doc.footerText, doc.showPageNumbers]);

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
    dom.addEventListener(EDIT_GRAPH_EVENT, handler);
    return () => dom.removeEventListener(EDIT_GRAPH_EVENT, handler);
  }, [editor, openGraph]);

  useEffect(() => {
    if (latexOpen && previewRef.current) previewRef.current.value = latexDraft;
  }, [latexOpen, latexDraft]);

  if (!editor) return null;

  const insertLatex = (kind: "inline" | "block") => {
    const latex = latexDraft.trim();
    if (!latex) return;
    if (kind === "inline") editor.chain().focus().insertMathInline(latex, false).run();
    else editor.chain().focus().insertMathBlock(latex, false).run();
    setLatexOpen(false);
    setLatexDraft("");
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
    "--pt": `${m.top}mm`,
    "--pb": `${m.bottom}mm`,
    "--px": `${m.left}mm`,
    "--pw": landscape ? "297mm" : "210mm",
    "--ph": landscape ? "210mm" : "297mm"
  } as CSSProperties;

  return (
    <>
      <Toolbar
        editor={editor}
        page={doc.page}
        actions={actions}
        onOpenLatex={() => { setLatexDraft(""); setLatexOpen(true); }}
        onGraph={openGraph}
        onError={onNotice}
      />
      <div className="page-stage">
        <article className="paper" id="print-document" style={paperStyle}>
          <div className="paper-header" aria-hidden="true"><span>{doc.headerText}</span></div>
          <EditorContent editor={editor} />
        </article>
      </div>

      {graph && <GraphDialog initial={graph.spec} onSave={saveGraph} onClose={() => setGraph(null)} />}

      {latexOpen && (
        <div className="modal-backdrop no-print" onClick={() => setLatexOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="إدراج معادلة من LaTeX" onClick={e => e.stopPropagation()}>
            <strong>إدراج معادلة من LaTeX</strong>
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
            <div className="modal-actions">
              <button type="button" className="primary-action" disabled={!latexDraft.trim()} onClick={() => insertLatex("block")}>إدراج كتلة</button>
              <button type="button" disabled={!latexDraft.trim()} onClick={() => insertLatex("inline")}>إدراج داخل السطر</button>
              <button type="button" onClick={() => setLatexOpen(false)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
