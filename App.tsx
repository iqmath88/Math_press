import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { Sigma, Check, AlertTriangle, Trash2, FileText, RotateCcw, Moon, Sun } from "lucide-react";
import type { EducationalStyle } from "./educationalStyles";
import type { MathPressDocument } from "./types";
import { createDocument, parseDocument, protectEducationalDocument } from "./document";
import { deleteDocument, loadLibrary, saveDocument } from "./storage";
import DocumentEditor from "./Editor";
import PageSettingsDialog from "./PageSettingsDialog";
import { MAX_IMPORT_BYTES, preservesSuppliedContent, validateImportedContent } from "./importValidation";
import type { ImportResult } from "./docxImport";

const VERSION = import.meta.env.VITE_APP_VERSION;

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
  const [migrationBackups, setMigrationBackups] = useState<Map<string, unknown>>(() => new Map());
  const [editorRevision, setEditorRevision] = useState(0);
  const latest = useRef(doc);
  latest.current = doc;
  const queue = useRef({ snapshot: null as MathPressDocument | null, tail: Promise.resolve() });
  const [saveState, setSaveState] = useState<SaveState>("saving");
  const [notice, setNotice] = useState(`مرحبًا بك في MathPress v${VERSION}`);
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("mathpress-studio-theme") === "dark"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("mathpress-studio-theme", dark ? "dark" : "light"); } catch { /* unavailable */ }
  }, [dark]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showPageSettings, setShowPageSettings] = useState(false);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<{ title: string; result: ImportResult } | null>(null);

  const refreshLibrary = useCallback(async () => {
    try {
      const library = await loadLibrary();
      setSavedDocs(library.documents);
      setMigrationBackups(library.backups);
    } catch { /* قد يكون التخزين غير متاح في التصفح الخاص */ }
  }, []);
  useEffect(() => { void refreshLibrary(); }, [refreshLibrary]);

  const persist = useCallback((snapshot: MathPressDocument) => {
    const state = queue.current;
    if (state.snapshot === snapshot) return;
    state.snapshot = snapshot;
    state.tail = state.tail.then(async () => {
      try {
        await saveDocument(snapshot);
        if (latest.current === snapshot) setSaveState("saved");
      } catch {
        if (state.snapshot === snapshot) state.snapshot = null;
        if (latest.current === snapshot) setSaveState("error");
        setNotice(`تعذر حفظ «${snapshot.title}» محليًا. صدّر نسخة احتياطية قبل إغلاقه.`);
      }
    });
  }, []);

  useEffect(() => {
    if (showLibrary) void refreshLibrary();
  }, [showLibrary, refreshLibrary, saveState]);

  useEffect(() => {
    setSaveState("saving");
    const timer = window.setTimeout(() => persist(doc), 650);
    return () => window.clearTimeout(timer);
  }, [doc, persist]);

  useEffect(() => {
    const flush = () => persist(latest.current);
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState !== "saved") { flush(); e.preventDefault(); e.returnValue = ""; }
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", warn);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", warn);
    };
  }, [persist, saveState]);

  const replaceDocument = (next: MathPressDocument) => {
    persist(latest.current);
    setDoc(next);
    setEditorRevision(value => value + 1);
  };

  const onContent = useCallback((content: JSONContent) => setDoc(old => ({ ...old, content })), []);
  const onStyles = useCallback((educationalStyles: EducationalStyle[]) => {
    setDoc(old => ({ ...old, educationalStyles }));
  }, []);
  const onNumberStart = useCallback((numberingStart: number) => setDoc(old => ({ ...old, numberingStart })), []);

  const exportMathDoc = () => {
    const blob = new Blob([JSON.stringify({ ...protectEducationalDocument(doc), updatedAt: new Date().toISOString() }, null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, `${safeName(doc.title)}.mathdoc`);
    setNotice("تم تجهيز نسخة المستند القابلة للتحرير.");
  };

  const openMathDoc = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("ملف المستند أكبر من 32 ميغابايت.");
      const raw = JSON.parse(await file.text());
      if (raw?.format === "mathpress" && Number.isInteger(raw.schemaVersion) && raw.schemaVersion > 4)
        throw new Error("يتطلب هذا المستند إصدارًا أحدث من MathPress. لم يُستبدل المستند الحالي.");
      const parsed = parseDocument(raw);
      const protectedFormat = parsed?.schemaVersion === 4;
      const content = parsed && validateImportedContent(parsed.content);
      if (protectedFormat && (!content || !preservesSuppliedContent(raw, { ...parsed, content }))) {
        throw new Error("يتضمن ملف MathDoc 4 محتوى أو خصائص غير مدعومة. احتُفظ بالمستند المفتوح وبالملف الأصلي.");
      }
      if (!parsed || !content) throw new Error("صيغة المستند غير معروفة أو غير مكتملة.");
      // Opening a backup must not overwrite the current local editing copy.
      replaceDocument({ ...parsed, id: crypto.randomUUID(), content });
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
      if (file.size > MAX_IMPORT_BYTES) throw new Error("ملف Word أكبر من 32 ميغابايت.");
      const { importDocx } = await import("./docxImport");
      const result = await importDocx(await file.arrayBuffer());
      const title = file.name.replace(/\.docx$/i, "") || "مستند مستورد";
      const fresh = createDocument(title);
      const { scaleDataUrl } = await import("./imageUtil");
      const background = result.background ? await scaleDataUrl(result.background, 2000) : null;
      replaceDocument({
        ...fresh,
        background,
        showPageNumbers: background ? false : fresh.showPageNumbers,
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
    <div className="app-shell" data-theme={dark ? "dark" : "light"}>
      <header className="topbar no-print">
        <div className="brand">
          <div className="brand-mark"><Sigma size={24} /></div>
          <div><strong>MathPress Studio <small className="version" dir="ltr">v{VERSION}</small></strong></div>
        </div>
        <input className="document-title-input" value={doc.title} onChange={e => setDoc(old => ({ ...old, title: e.target.value }))} aria-label="عنوان المستند" placeholder="عنوان المستند" />
        <button type="button" className="studio-theme" aria-label="الوضع الداكن" aria-pressed={dark}
          onClick={() => setDark(value => !value)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        <div className={`save-status ${saveState}`} aria-live="polite">{status.icon}<span>{status.label}</span></div>
      </header>


      {showLibrary && <section className="library-panel no-print">
        <div className="panel-heading"><strong>المستندات المحفوظة على هذا الجهاز</strong><button className="icon-button" onClick={() => setShowLibrary(false)}>إغلاق</button></div>
        {savedDocs.length === 0 ? <p className="muted">لا توجد مستندات محفوظة بعد، أو أن التخزين المحلي غير متاح.</p> :
          savedDocs.map(item => <div className="library-item" key={item.id}>
            <button className="library-open" onClick={() => { if (item.id !== latest.current.id) replaceDocument(item); setShowLibrary(false); setNotice(`تم فتح: ${item.title}`); }}>
              <FileText size={18} /><span><b>{item.title}</b><small>{new Date(item.updatedAt).toLocaleString("ar-IQ")}</small></span>
            </button>
            {migrationBackups.has(item.id) && <button type="button" onClick={() => {
              const original = migrationBackups.get(item.id);
              downloadBlob(new Blob([JSON.stringify(original, null, 2)], { type: "application/json" }),
                `${safeName(item.title)}-قبل-الترقية.mathdoc`);
            }}>نسخة قبل الترقية</button>}
            <button className="icon-button danger" aria-label={`حذف ${item.title}`} onClick={async () => {
              if (confirm(`حذف «${item.title}» من هذا الجهاز؟`)) { await deleteDocument(item.id); await refreshLibrary(); }
            }}><Trash2 size={16} /></button>
          </div>)}
      </section>}

      <main className="editor-area">
        <DocumentEditor
          key={editorRevision} doc={doc} onChange={onContent} onStyles={onStyles} onNumberStart={onNumberStart} onNotice={setNotice}
          actions={{
            onNew: () => { replaceDocument(createDocument()); setNotice("تم إنشاء مستند جديد."); },
            onNewBlank: () => {
              replaceDocument({ ...createDocument("مستند فارغ"), content: { type: "doc", content: [{ type: "paragraph" }] } });
              setNotice("تم إنشاء مستند فارغ.");
            },
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
