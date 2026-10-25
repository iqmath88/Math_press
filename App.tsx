import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { Sigma, Check, AlertTriangle, Trash2, FileText, RotateCcw } from "lucide-react";
import type { MathPressDocument } from "./types";
import { createDocument, parseDocument } from "./document";
import { deleteDocument, loadDocuments, saveDocument } from "./storage";
import DocumentEditor from "./Editor";
import PageSettingsDialog from "./PageSettingsDialog";
import type { ImportResult } from "./docxImport";

type SaveState = "saved" | "saving" | "error";

function safeName(value: string) {
  return (value.trim().replace(/[\\/:*?"<>|]/g, "-") || "mathpress-document").slice(0, 80);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [doc, setDoc] = useState<MathPressDocument>(() => createDocument());
  const [savedDocs, setSavedDocs] = useState<MathPressDocument[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saving");
  const [notice, setNotice] = useState("مرحبًا بك في MathPress 0.3");
  const [showLibrary, setShowLibrary] = useState(false);
  const [pages, setPages] = useState(1);
  const [showPageSettings, setShowPageSettings] = useState(false);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<{ title: string; result: ImportResult } | null>(null);

  const refreshLibrary = useCallback(async () => {
    try { setSavedDocs(await loadDocuments()); } catch { /* قد يكون التخزين غير متاح في التصفح الخاص */ }
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

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState !== "saved") { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  const onContent = useCallback((content: JSONContent) => setDoc(old => ({ ...old, content })), []);
  const onPageCount = useCallback((n: number) => setPages(n), []);

  const exportMathDoc = () => {
    const blob = new Blob([JSON.stringify({ ...doc, updatedAt: new Date().toISOString() }, null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, `${safeName(doc.title)}.mathdoc`);
    setNotice("تم تجهيز نسخة المستند القابلة للتحرير.");
  };

  const openMathDoc = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parseDocument(JSON.parse(await file.text()));
      if (!parsed) throw new Error("صيغة المستند غير معروفة أو غير مكتملة.");
      setDoc(parsed);
      setNotice("تم فتح المستند بنجاح.");
      setShowLibrary(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر فتح الملف.");
    }
  };

  const openWord = async (file: File) => {
    if (importing) return;
    setImporting(true);
    setNotice(`جارٍ استيراد «${file.name}»…`);
    try {
      const { importDocx } = await import("./docxImport");
      const result = await importDocx(await file.arrayBuffer());
      const title = file.name.replace(/\.docx$/i, "") || "مستند مستورد";
      const fresh = createDocument(title);
      setDoc({
        ...fresh,
        content: result.content,
        page: result.page ? { ...fresh.page, orientation: result.page.orientation, marginsMm: result.page.marginsMm } : fresh.page
      });
      setReport({ title, result });
      setNotice(`تم استيراد «${file.name}». راجع التقرير.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر استيراد ملف Word.");
    } finally {
      setImporting(false);
    }
  };

  const print = () => {
    setNotice("اختر «حفظ بتنسيق PDF» من نافذة الطباعة، وراجع عدد الصفحات قبل الحفظ.");
    window.print();
  };

  const status = useMemo(() => ({
    saved: { label: "محفوظ محليًا", icon: <Check size={15} /> },
    saving: { label: "جارٍ الحفظ…", icon: <RotateCcw size={15} className="spin" /> },
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


      {showLibrary && <section className="library-panel no-print">
        <div className="panel-heading"><strong>المستندات المحفوظة على هذا الجهاز</strong><button className="icon-button" onClick={() => setShowLibrary(false)}>إغلاق</button></div>
        {savedDocs.length === 0 ? <p className="muted">لا توجد مستندات محفوظة بعد، أو أن التخزين المحلي غير متاح.</p> :
          savedDocs.map(item => <div className="library-item" key={item.id}>
            <button className="library-open" onClick={() => { setDoc(item); setShowLibrary(false); setNotice(`تم فتح: ${item.title}`); }}>
              <FileText size={18} /><span><b>{item.title}</b><small>{new Date(item.updatedAt).toLocaleString("ar-IQ")}</small></span>
            </button>
            <button className="icon-button danger" aria-label={`حذف ${item.title}`} onClick={async () => {
              if (confirm(`حذف «${item.title}» من هذا الجهاز؟`)) { await deleteDocument(item.id); await refreshLibrary(); }
            }}><Trash2 size={16} /></button>
          </div>)}
      </section>}

      <main className="editor-area">
        <div className="document-meta no-print">
          <input className="document-title-input" value={doc.title} onChange={e => setDoc(old => ({ ...old, title: e.target.value }))} aria-label="عنوان المستند" placeholder="عنوان المستند" />
          <div className="page-chip">A4 {doc.page.orientation === "landscape" ? "أفقي" : "عمودي"} · {pages} {pages === 1 ? "صفحة" : "صفحات"}</div>
        </div>
        <DocumentEditor
          key={doc.id} doc={doc} onChange={onContent} onPageCount={onPageCount} onNotice={setNotice}
          actions={{
            onNew: () => { setDoc(createDocument()); setNotice("تم إنشاء مستند جديد."); },
            onLibrary: () => setShowLibrary(v => !v),
            onExport: exportMathDoc,
            onOpenFile: f => { void openMathDoc(f); },
            onOpenWord: f => { void openWord(f); },
            onPrint: print,
            onPageSettings: () => setShowPageSettings(true),
            onQuickPage: q => setDoc(old => ({
              ...old,
              page: {
                ...old.page,
                orientation: q.orientation ?? old.page.orientation,
                marginsMm: q.marginMm !== undefined
                  ? { top: q.marginMm, bottom: q.marginMm, left: q.marginMm, right: q.marginMm }
                  : old.page.marginsMm
              }
            }))
          }}
        />
      </main>

      {showPageSettings && (
        <PageSettingsDialog
          doc={doc}
          onClose={() => setShowPageSettings(false)}
          onApply={patch => { setDoc(old => ({ ...old, ...patch })); setShowPageSettings(false); setNotice("تم تطبيق إعدادات الصفحة."); }}
        />
      )}

      {report && (
        <div className="modal-backdrop no-print" onClick={() => setReport(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="تقرير الاستيراد" onClick={e => e.stopPropagation()}>
            <strong>تم استيراد «{report.title}»</strong>
            <ul className="import-stats">
              <li><b>{report.result.stats.equations}</b> معادلة محوّلة إلى LaTeX قابل للتحرير</li>
              <li><b>{report.result.stats.headings}</b> عنوان · <b>{report.result.stats.paragraphs}</b> فقرة · <b>{report.result.stats.lists}</b> قائمة</li>
              <li><b>{report.result.stats.tables}</b> جدول · <b>{report.result.stats.images}</b> صورة</li>
            </ul>
            {report.result.warnings.length > 0 && (<>
              <span className="setting-title">ما لم يُنقل أو يحتاج مراجعة</span>
              <ul className="import-warnings">{report.result.warnings.map(w => <li key={w}>{w}</li>)}</ul>
            </>)}
            <p className="muted">راجع المعادلات والجداول بعين المدقق قبل الطباعة، وقارن بالأصل في Word للتأكد.</p>
            <div className="modal-actions"><button type="button" className="primary-action" onClick={() => setReport(null)}>متابعة</button></div>
          </div>
        </div>
      )}

      <footer className="statusbar no-print"><span>{notice}</span><span className="status-right">حفظ محلي · لا يوجد حساب سحابي</span></footer>
    </div>
  );
}
