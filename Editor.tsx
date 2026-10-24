import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import type { MathfieldElement } from "mathlive";
import type { MathPressDocument } from "./types";
import { buildExtensions } from "./extensions";
import Toolbar from "./Toolbar";

type Props = {
  doc: MathPressDocument;
  onChange: (content: JSONContent) => void;
  onPageCount: (pages: number) => void;
  onNotice: (message: string) => void;
};

export default function DocumentEditor({ doc, onChange, onPageCount, onNotice }: Props) {
  const m = doc.page.marginsMm;
  const extensions = useMemo(
    () => buildExtensions({ marginTopMm: m.top, marginBottomMm: m.bottom }),
    [m.top, m.bottom]
  );
  const [latexOpen, setLatexOpen] = useState(false);
  const [latexDraft, setLatexDraft] = useState("");
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

  useEffect(() => {
    if (!editor) return;
    editor.storage.pagination.footerText = doc.footerText;
    editor.commands.repaginate();
  }, [editor, doc.footerText]);

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

  const paperStyle = {
    "--pt": `${m.top}mm`,
    "--pb": `${m.bottom}mm`,
    "--px": `${m.left}mm`
  } as CSSProperties;

  return (
    <>
      <Toolbar
        editor={editor}
        onOpenLatex={() => { setLatexDraft(""); setLatexOpen(true); }}
        onError={onNotice}
      />
      <div className="page-stage">
        <article className="paper" id="print-document" style={paperStyle}>
          <EditorContent editor={editor} />
        </article>
      </div>

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
