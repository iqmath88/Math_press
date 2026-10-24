import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2, FolderOpen, Save, Download, Printer, Sigma, Type, FileText, Check, AlertTriangle, Trash2, BookOpen, Code2, RotateCcw } from "lucide-react";
import type { MathPressDocument, ContentBlock } from "./types";
import { createDocument, validateDocument } from "./document";
import { deleteDocument, loadDocuments, saveDocument } from "./storage";

type SaveState = "saved" | "saving" | "error" | "dirty";

function uid() { return crypto.randomUUID(); }

export default function App() {
  const [doc, setDoc] = useState<MathPressDocument>(() => createDocument());
  const [savedDocs, setSavedDocs] = useState<MathPressDocument[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("dirty");
  const [notice, setNotice] = useState("مرحبًا بك في النسخة الأولية من MathPress");
  const [latexMode, setLatexMode] = useState(false);
  const [latexDraft, setLatexDraft] = useState("");
  const [selectedMathId, setSelectedMathId] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const mathFieldRef = useRef<HTMLElement | null>(null);

  const refreshLibrary = useCallback(async () => {
    try { setSavedDocs(await loadDocuments()); } catch { /* Storage can be unavailable in private modes. */ }
  }, []);

  useEffect(() => { void refreshLibrary(); }, [refreshLibrary]);

  useEffect(() => {
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try {
        await saveDocument(doc);
        setSaveState("saved");
        void refreshLibrary();
      } catch {
        setSaveState("error");
        setNotice("تعذر الحفظ المحلي. صدّر نسخة احتياطية قبل متابعة العمل.");
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [doc, refreshLibrary]);

  const updateTitle = (title: string) => setDoc(old => ({ ...old, title }));
  const updateBlock = (id: string, patch: Partial<ContentBlock>) => {
    setDoc(old => ({ ...old, content: old.content.map(block => block.id === id ? { ...block, ...patch } as ContentBlock : block) }));
  };
  const addParagraph = () => setDoc(old => ({ ...old, content: [...old.content, { id: uid(), type: "paragraph", text: "" }] }));
  const addMath = () => {
    const id = uid();
    setDoc(old => ({ ...old, content: [...old.content, { id, type: "math", latex: "\\frac{a}{b}", display: true }] }));
    setSelectedMathId(id);
    setLatexDraft("\\frac{a}{b}");
    setLatexMode(true);
    setNotice("أُدرجت معادلة جديدة. عدّلها من لوحة المعادلات.");
  };
  const removeBlock = (id: string) => setDoc(old => ({ ...old, content: old.content.filter(block => block.id !== id) }));

  const exportMathDoc = () => {
    const blob = new Blob([JSON.stringify({ ...doc, updatedAt: new Date().toISOString() }, null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, `${safeName(doc.title)}.mathdoc`);
    setNotice("تم تجهيز نسخة المستند القابلة للتحرير.");
  };

  const openMathDoc = async (file?: File) => {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      if (!validateDocument(raw)) throw new Error("صيغة المستند غير معروفة أو غير مكتملة.");
      setDoc(raw);
      setNotice("تم فتح المستند بنجاح.");
      setShowLibrary(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر فتح الملف.");
    }
  };

  const exportPdf = () => {
    setNotice("افتح نافذة الطباعة، ثم اختر «حفظ بتنسيق PDF». راجع عدد الصفحات قبل الحفظ.");
    window.print();
  };

  const insertLatex = (snippet: string) => {
    setLatexDraft(old => old + snippet);
  };

  const applyLatex = () => {
    if (!selectedMathId) {
      const id = uid();
      setDoc(old => ({ ...old, content: [...old.content, { id, type: "math", latex: latexDraft, display: true }] }));
      setSelectedMathId(id);
    } else {
      updateBlock(selectedMathId, { latex: latexDraft } as Partial<ContentBlock>);
    }
    setNotice("تم تحديث مصدر المعادلة في المستند.");
  };

  const status = useMemo(() => ({
    saved: { label: "محفوظ محليًا", icon: <Check size={15} /> },
    saving: { label: "جارٍ الحفظ…", icon: <RotateCcw size={15} className="spin" /> },
    dirty: { label: "تعديلات غير محفوظة", icon: <AlertTriangle size={15} /> },
    error: { label: "مشكلة في الحفظ", icon: <AlertTriangle size={15} /> }
  }[saveState]), [saveState]);

  return (
    <div className="app-shell">
      <header className="topbar no-print">
        <div className="brand">
          <div className="brand-mark"><Sigma size={24} /></div>
          <div><strong>MathPress</strong><span>محرر الرياضيات الاحترافي</span></div>
        </div>
        <div className={`save-status ${saveState}`} aria-live="polite">{status.icon}<span>{status.label}</span></div>
      </header>

      <nav className="toolbar no-print" aria-label="أدوات المستند">
        <button onClick={() => { setDoc(createDocument()); setNotice("تم إنشاء مستند جديد."); }}><FilePlus2 size={17}/> جديد</button>
        <button onClick={() => setShowLibrary(v => !v)}><FolderOpen size={17}/> مستنداتي</button>
        <button onClick={exportMathDoc}><Download size={17}/> تصدير المستند</button>
        <label className="toolbar-button"><FolderOpen size={17}/> فتح ملف
          <input type="file" accept=".mathdoc,.json,application/json" onChange={e => void openMathDoc(e.target.files?.[0])} hidden />
        </label>
        <span className="toolbar-separator" />
        <button onClick={addParagraph}><Type size={17}/> نص</button>
        <button className="primary-action" onClick={addMath}><Sigma size={17}/> معادلة</button>
        <button onClick={exportPdf}><Printer size={17}/> طباعة / PDF</button>
      </nav>

      {showLibrary && <section className="library-panel no-print">
        <div className="panel-heading"><strong>المستندات المحفوظة على هذا الجهاز</strong><button className="icon-button" onClick={() => setShowLibrary(false)}>إغلاق</button></div>
        {savedDocs.length === 0 ? <p className="muted">لا توجد مستندات محفوظة بعد، أو أن التخزين المحلي غير متاح.</p> :
          savedDocs.map(item => <div className="library-item" key={item.id}>
            <button className="library-open" onClick={() => { setDoc(item); setShowLibrary(false); setNotice(`تم فتح: ${item.title}`); }}><FileText size={18}/><span><b>{item.title}</b><small>{new Date(item.updatedAt).toLocaleString("ar-IQ")}</small></span></button>
            <button className="icon-button danger" aria-label={`حذف ${item.title}`} onClick={async () => { if (confirm(`حذف «${item.title}» من هذا الجهاز؟`)) { await deleteDocument(item.id); await refreshLibrary(); } }}><Trash2 size={16}/></button>
          </div>)}
      </section>}

      <main className="workspace">
        <aside className="side-tools no-print">
          <div className="side-title"><BookOpen size={17}/> أدوات التحرير</div>
          <button className="side-tool active" onClick={addParagraph}><Type size={19}/><span>فقرة نصية</span></button>
          <button className="side-tool" onClick={addMath}><Sigma size={19}/><span>إدراج معادلة</span></button>
          <button className="side-tool" onClick={() => { setLatexMode(v => !v); setNotice("يمكنك تحرير LaTeX في لوحة المعادلات."); }}><Code2 size={19}/><span>محرر LaTeX</span></button>
          <div className="side-note"><b>تنبيه النسخة الأولية</b><p>المعاينة الحالية أساس قابل للتطوير. يلزم اجتياز اختبارات الصفحات وPDF قبل الاعتماد على التطبيق في طباعة الملازم النهائية.</p></div>
        </aside>

        <section className="editor-area">
          <div className="document-meta no-print">
            <input ref={titleRef} className="document-title-input" value={doc.title} onChange={e => updateTitle(e.target.value)} aria-label="عنوان المستند" />
            <div className="page-chip">A4 · عمودي · RTL</div>
          </div>
          <div className="page-stage">
            <article className={`paper ${doc.page.orientation}`} id="print-document" dir="rtl">
              <div className="paper-content" style={{ padding: `${doc.page.marginsMm.top}mm ${doc.page.marginsMm.right}mm ${doc.page.marginsMm.bottom}mm ${doc.page.marginsMm.left}mm` }}>
                <h1 className="paper-title">{doc.title || "مستند بلا عنوان"}</h1>
                {doc.content.map(block => block.type === "paragraph" ?
                  <div className="paragraph-row" key={block.id}>
                    <textarea className="editable-paragraph" value={block.text} onChange={e => updateBlock(block.id, { text: e.target.value } as Partial<ContentBlock>)} placeholder="اكتب النص هنا..." aria-label="فقرة المستند" rows={Math.max(1, Math.min(5, block.text.split("\n").length))} />
                    <button className="remove-block no-print" title="حذف الفقرة" onClick={() => removeBlock(block.id)}>×</button>
                  </div>
                  :
                  <div className={`math-row ${selectedMathId === block.id ? "selected" : ""}`} key={block.id} onClick={() => { setSelectedMathId(block.id); setLatexDraft(block.latex); }}>
                    <math-field
                      ref={el => { if (selectedMathId === block.id) mathFieldRef.current = el as unknown as HTMLElement; }}
                      className="math-field"
                      virtual-keyboard-mode="manual"
                      onInput={(event: React.FormEvent<HTMLElement>) => {
                        const target = event.target as HTMLElement & { value?: string };
                        updateBlock(block.id, { latex: target.value ?? block.latex } as Partial<ContentBlock>);
                      }}
                    >{block.latex}</math-field>
                    <button className="remove-block no-print" title="حذف المعادلة" onClick={e => { e.stopPropagation(); removeBlock(block.id); }}>×</button>
                  </div>
                )}
                {doc.content.length === 0 && <p className="empty-paper">ابدأ بكتابة النص أو أدرج معادلة من شريط الأدوات.</p>}
              </div>
              <footer className="paper-footer"><span>MathPress</span><span>مسودة قابلة للتحرير</span></footer>
            </article>
          </div>
        </section>

        {latexMode && <aside className="latex-panel no-print">
          <div className="side-title"><Sigma size={17}/> محرر المعادلات</div>
          <p className="muted">حدد معادلة من الصفحة ثم عدّل LaTeX، أو أنشئ معادلة جديدة.</p>
          <textarea className="latex-input" dir="ltr" value={latexDraft} onChange={e => setLatexDraft(e.target.value)} spellCheck={false} aria-label="مصدر LaTeX" />
          <div className="symbol-grid">
            {[["كسر","\\frac{}{}"],["جذر","\\sqrt{}"],["أس","^{}"],["مؤشر","_{}"],["تكامل","\\int_{}^{}"],["مجموع","\\sum_{}^{}"],["نهاية","\\lim_{x\\to}"],["ضرب","\\times"]].map(([label, value]) =>
              <button key={label} onClick={() => insertLatex(value)}>{label}</button>)}
          </div>
          <button className="primary-action full-width" onClick={applyLatex}>تطبيق المعادلة</button>
          <div className="latex-preview"><span>معاينة المصدر</span><code dir="ltr">{latexDraft || "اكتب LaTeX هنا"}</code></div>
        </aside>}
      </main>

      <footer className="statusbar no-print"><span>{notice}</span><span className="status-right">حفظ محلي · لا يوجد حساب سحابي</span></footer>
    </div>
  );
}

function safeName(value: string) {
  return (value.trim().replace(/[\\/:*?"<>|]/g, "-") || "mathpress-document").slice(0, 80);
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}