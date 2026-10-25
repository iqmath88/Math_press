import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { FilePlus2, FolderOpen, Download, Printer, Sigma, Check, AlertTriangle, Trash2, FileText, RotateCcw } from "lucide-react";
import type { MathPressDocument } from "./types";
import { createDocument, parseDocument } from "./document";
import { deleteDocument, loadDocuments, saveDocument } from "./storage";
import DocumentEditor from "./Editor";

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
  const [notice, setNotice] = useState("مرحبًا بك في MathPress 0.2");
  const [showLibrary, setShowLibrary] = useState(false);
  const [pages, setPages] = useState(1);
  const [booting, setBooting] = useState(true);
  const docRef = useRef(doc);
  const saveTimerRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  docRef.current = doc;

  const refreshLibrary = useCallback(async () => {
    try { setSavedDocs(await loadDocuments()); } catch { /* قد يكون التخزين غير متاح في التصفح الخاص */ }
  }, []);

  // لا ننشئ مستندًا فارغًا فوق آخر مستند محفوظ عند بدء التشغيل.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const docs = await loadDocuments();
        if (cancelled) return;
        setSavedDocs(docs);
        if (docs.length > 0) {
          setDoc(docs[0]);
          setNotice(`تمت استعادة آخر مستند: ${docs[0].title}`);
          setSaveState("saved");
        } else {
          setNotice("مستند جديد جاهز. سيُحفظ عملك تلقائيًا على هذا الجهاز.");
        }
      } catch {
        if (!cancelled) setNotice("تعذر قراءة التخزين المحلي. صدّر نسخة احتياطية من عملك بانتظام.");
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // تسلسل عمليات الحفظ يمنع كتابة نسخة أقدم بعد نسخة أحدث.
  const queueSave = useCallback((snapshot: MathPressDocument) => {
    const task = saveQueueRef.current.catch(() => undefined).then(() => saveDocument(snapshot));
    saveQueueRef.current = task;
    return task;
  }, []);

  const flushPendingSave = useCallback(async () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const snapshot = docRef.current;
    setSaveState("saving");
    try {
      await queueSave(snapshot);
      setSaveState("saved");
      await refreshLibrary();
    } catch {
      setSaveState("error");
      setNotice("تعذر حفظ المستند. صدّر نسخة احتياطية قبل متابعة العمل.");
      throw new Error("تعذر حفظ المستند الحالي");
    }
  }, [queueSave, refreshLibrary]);

  useEffect(() => {
    if (booting) return;
    setSaveState("saving");
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      saveTimerRef.current = null;
      try {
        await queueSave(doc);
        setSaveState("saved");
        void refreshLibrary();
      } catch {
        setSaveState("error");
        setNotice("تعذر الحفظ المحلي. صدّر نسخة احتياطية قبل متابعة العمل.");
      }
    }, 650);
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [doc, booting, queueSave, refreshLibrary]);

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
      await flushPendingSave();
      const parsed = parseDocument(JSON.parse(await file.text()));
      if (!parsed) throw new Error("صيغة المستند غير معروفة أو غير مكتملة.");
      setDoc(parsed);
      setNotice("تم فتح المستند بنجاح.");
      setShowLibrary(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر فتح الملف.");
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

      <nav className="toolbar no-print" aria-label="أدوات الملف">
        <button onClick={async () => {
          try {
            await flushPendingSave();
            const fresh = createDocument();
            setDoc(fresh);
            setNotice("تم إنشاء مستند جديد. المستند السابق محفوظ.");
          } catch { /* تبقى في المستند الحالي إذا تعذر حفظه */ }
        }}><FilePlus2 size={17} /> جديد</button>
        <button onClick={() => setShowLibrary(v => !v)}><FolderOpen size={17} /> مستنداتي</button>
        <button onClick={exportMathDoc}><Download size={17} /> تصدير المستند</button>
        <label className="toolbar-button"><FolderOpen size={17} /> فتح ملف
          <input type="file" accept=".mathdoc,.json,application/json" className="visually-hidden" onChange={e => { void openMathDoc(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <span className="toolbar-separator" />
        <button className="primary-action" onClick={print}><Printer size={17} /> طباعة / PDF</button>
      </nav>

      {showLibrary && <section className="library-panel no-print">
        <div className="panel-heading"><strong>المستندات المحفوظة على هذا الجهاز</strong><button className="icon-button" onClick={() => setShowLibrary(false)}>إغلاق</button></div>
        {savedDocs.length === 0 ? <p className="muted">لا توجد مستندات محفوظة بعد، أو أن التخزين المحلي غير متاح.</p> :
          savedDocs.map(item => <div className="library-item" key={item.id}>
            <button className="library-open" onClick={async () => {
              try {
                await flushPendingSave();
                const latestDocs = await loadDocuments();
                const latest = latestDocs.find(saved => saved.id === item.id) ?? item;
                setDoc(latest);
                setShowLibrary(false);
                setNotice(`تم فتح: ${latest.title}`);
              } catch { /* لا نغادر المستند إذا فشل حفظه */ }
            }}>
              <FileText size={18} /><span><b>{item.title}</b><small>{new Date(item.updatedAt).toLocaleString("ar-IQ")}</small></span>
            </button>
            <button className="icon-button danger" aria-label={`حذف ${item.title}`} onClick={async () => {
              if (confirm(`حذف «${item.title}» من هذا الجهاز؟`)) {
                try {
                  if (item.id === docRef.current.id) await flushPendingSave();
                  await deleteDocument(item.id);
                  if (item.id === docRef.current.id) {
                    setDoc(createDocument());
                    setNotice("تم حذف المستند النشط. أُنشئ مستند فارغ جديد.");
                  }
                  await refreshLibrary();
                } catch {
                  setNotice("تعذر حذف المستند بأمان. لم يتم إكمال العملية.");
                }
              }
            }}><Trash2 size={16} /></button>
          </div>)}
      </section>}

      <main className="editor-area">
        <div className="document-meta no-print">
          <input className="document-title-input" value={doc.title} disabled={booting} onChange={e => setDoc(old => ({ ...old, title: e.target.value }))} aria-label="عنوان المستند" placeholder="عنوان المستند" />
          <input className="footer-input" value={doc.footerText} disabled={booting} onChange={e => setDoc(old => ({ ...old, footerText: e.target.value }))} aria-label="نص التذييل" placeholder="نص التذييل (اختياري)" />
          <div className="page-chip">A4 · {pages} {pages === 1 ? "صفحة" : "صفحات"}</div>
        </div>
        {booting ? <div className="loading-state" role="status">جارٍ استعادة مستنداتك…</div> :
          <DocumentEditor key={doc.id} doc={doc} onChange={onContent} onPageCount={onPageCount} onNotice={setNotice} />}
      </main>

      <footer className="statusbar no-print"><span>{notice}</span><span className="status-right">حفظ محلي · لا يوجد حساب سحابي</span></footer>
    </div>
  );
}
