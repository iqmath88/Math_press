import { useEffect, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import {
  Undo2, Redo2, Bold, Italic, Underline, Subscript, Superscript, List, ListOrdered,
  AlignRight, AlignCenter, AlignLeft, AlignJustify, Table as TableIcon, ImagePlus, Sigma,
  Highlighter, Palette, SeparatorHorizontal, Quote, Minus, Code2, Eraser, RemoveFormatting,
  LineChart, Columns2, FilePlus2, FolderOpen, Download, Printer, SlidersHorizontal,
  RectangleHorizontal, RectangleVertical, ChevronUp, ChevronDown, FileUp, FileText
} from "lucide-react";
import type { PageSettings } from "./types";
import { fileToDataUrl } from "./imageUtil";

const FONTS = [
  { label: "نسخ", value: '"Noto Naskh Arabic", serif' },
  { label: "أميري", value: "Amiri, serif" },
  { label: "القاهرة", value: "Cairo, sans-serif" },
  { label: "Times", value: '"Times New Roman", serif' },
  { label: "Arial", value: "Arial, sans-serif" }
];
const SIZES = ["10", "11", "12", "13", "14", "16", "18", "20", "24", "28", "32", "40"];
const MARGIN_PRESETS = [
  { label: "ضيقة", mm: 12 },
  { label: "متوسطة", mm: 18 },
  { label: "واسعة", mm: 25 }
];

export type RibbonActions = {
  onNew: () => void;
  onLibrary: () => void;
  onExport: () => void;
  onOpenFile: (file: File) => void;
  onOpenWord: (file: File) => void;
  onPrint: () => void;
  onPageSettings: () => void;
  onQuickPage: (patch: { orientation?: "portrait" | "landscape"; marginMm?: number }) => void;
};

type Props = {
  editor: Editor;
  page: PageSettings;
  actions: RibbonActions;
  onOpenLatex: () => void;
  /** بلا وسيط: رسم جديد. مع موضع: تعديل الرسم الموجود. */
  onGraph: (pos?: number) => void;
  onError: (message: string) => void;
};

type TabId = "file" | "home" | "insert" | "layout" | "ctx";
type CtxId = "graph" | "table" | "image" | "columns";
const CTX_LABEL: Record<CtxId, string> = { graph: "الرسم", table: "الجدول", image: "الصورة", columns: "الأعمدة" };

function Btn(props: {
  label: string; active?: boolean; disabled?: boolean; onClick: () => void;
  children: ReactNode; wide?: boolean; primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={`tb-btn${props.active ? " on" : ""}${props.wide ? " wide" : ""}${props.primary ? " primary" : ""}`}
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active ?? undefined}
      disabled={props.disabled}
      onMouseDown={e => e.preventDefault()}
      onClick={props.onClick}
    >{props.children}</button>
  );
}

/** زر كبير (أيقونة فوق النص) لتبويب الإدراج. */
function Big(props: { label: string; text: string; onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`tb-big${props.active ? " on" : ""}`}
      title={props.label}
      aria-label={props.label}
      disabled={props.disabled}
      onMouseDown={e => e.preventDefault()}
      onClick={props.onClick}
    >{props.children}<span>{props.text}</span></button>
  );
}

function Group(props: { title: string; children: ReactNode; rows?: boolean }) {
  return (
    <section className="rb-group" aria-label={props.title}>
      <div className={props.rows ? "rb-rows" : "rb-line"}>{props.children}</div>
      <div className="rb-title">{props.title}</div>
    </section>
  );
}

const Row = ({ children }: { children: ReactNode }) => <div className="rb-line">{children}</div>;

export default function Toolbar({ editor, page, actions, onOpenLatex, onGraph, onError }: Props) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [tab, setTab] = useState<TabId>("home");
  const [collapsed, setCollapsed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const openRef = useRef<HTMLInputElement>(null);
  const wordRef = useRef<HTMLInputElement>(null);
  const prevCtx = useRef<CtxId | null>(null);

  // الشريط يحدّث نفسه عند كل تغيير في المحرر، فلا يحتاج المحرر إلى إعادة رسم كاملة مع كل ضغطة مفتاح.
  useEffect(() => {
    editor.on("transaction", rerender);
    return () => { editor.off("transaction", rerender); };
  }, [editor]);

  const chain = () => editor.chain().focus();
  const attrs = editor.getAttributes("textStyle") as { fontFamily?: string; fontSize?: string };

  const ctx: CtxId | null = editor.isActive("graph") ? "graph"
    : editor.isActive("table") ? "table"
    : editor.isActive("image") ? "image"
    : editor.isActive("columns") ? "columns" : null;

  // التبويب السياقي يظهر ويُختار عند دخول جدول أو صورة أو رسم أو أعمدة، ويختفي عند الخروج.
  useEffect(() => {
    if (ctx && ctx !== prevCtx.current) { setTab("ctx"); setCollapsed(false); }
    if (!ctx && tab === "ctx") setTab("home");
    prevCtx.current = ctx;
  }, [ctx, tab]);

  const headingValue = editor.isActive("heading", { level: 1 }) ? "1"
    : editor.isActive("heading", { level: 2 }) ? "2"
    : editor.isActive("heading", { level: 3 }) ? "3" : "p";

  const setBlock = (value: string) => {
    if (value === "p") chain().setParagraph().run();
    else chain().setHeading({ level: Number(value) as 1 | 2 | 3 }).run();
  };

  const pickImage = async (file?: File) => {
    if (!file) return;
    try {
      chain().setImage({ src: await fileToDataUrl(file), alt: file.name }).run();
    } catch (e) {
      onError(e instanceof Error ? e.message : "تعذر إدراج الصورة");
    }
  };

  const m = page.marginsMm;
  const uniformMargin = m.top === m.bottom && m.top === m.left && m.left === m.right ? m.top : null;

  const tabs: { id: TabId; label: string; ctx?: boolean }[] = [
    { id: "file", label: "ملف" },
    { id: "home", label: "الرئيسية" },
    { id: "insert", label: "إدراج" },
    { id: "layout", label: "الصفحة" },
    ...(ctx ? [{ id: "ctx" as TabId, label: CTX_LABEL[ctx], ctx: true }] : [])
  ];

  const selectTab = (id: TabId) => {
    if (id === tab) setCollapsed(c => !c);
    else { setTab(id); setCollapsed(false); }
  };

  return (
    <div className="ribbon no-print">
      <div className="rb-strip">
        <div className="rb-tabs" role="tablist" aria-label="الأقسام">
          {tabs.map(t => (
            <button
              key={t.id} type="button" role="tab" aria-selected={tab === t.id}
              className={`rb-tab${tab === t.id ? " on" : ""}${t.ctx ? " ctx" : ""}`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => selectTab(t.id)}
            >{t.label}</button>
          ))}
        </div>
        <div className="rb-quick">
          <Btn label="تراجع" disabled={!editor.can().undo()} onClick={() => chain().undo().run()}><Undo2 size={18} /></Btn>
          <Btn label="إعادة" disabled={!editor.can().redo()} onClick={() => chain().redo().run()}><Redo2 size={18} /></Btn>
          <Btn label="طباعة / PDF" wide primary onClick={actions.onPrint}><Printer size={17} /><span>طباعة / PDF</span></Btn>
          <Btn label={collapsed ? "إظهار الأدوات" : "إخفاء الأدوات"} onClick={() => setCollapsed(c => !c)}>
            {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </Btn>
        </div>
      </div>

      {!collapsed && (
        <div className="rb-panel" role="tabpanel">
          {tab === "file" && (<>
            <Group title="المستند">
              <Big label="مستند جديد" text="جديد" onClick={actions.onNew}><FilePlus2 size={24} /></Big>
              <Big label="المستندات المحفوظة على هذا الجهاز" text="مستنداتي" onClick={actions.onLibrary}><FolderOpen size={24} /></Big>
              <Big label="فتح ملف .mathdoc" text="فتح ملف" onClick={() => openRef.current?.click()}><FileUp size={24} /></Big>
              <Big label="استيراد ملف Word (.docx) بمعادلاته" text="استيراد Word" onClick={() => wordRef.current?.click()}><FileText size={24} /></Big>
              <input
                ref={wordRef} className="visually-hidden" type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={e => { const f = e.target.files?.[0]; if (f) actions.onOpenWord(f); e.target.value = ""; }}
              />
              <input
                ref={openRef} className="visually-hidden" type="file" accept=".mathdoc,.json,application/json"
                onChange={e => { const f = e.target.files?.[0]; if (f) actions.onOpenFile(f); e.target.value = ""; }}
              />
            </Group>
            <Group title="تصدير وطباعة">
              <Big label="تصدير المستند كملف قابل للتحرير" text="تصدير المستند" onClick={actions.onExport}><Download size={24} /></Big>
              <Big label="طباعة أو حفظ PDF" text="طباعة / PDF" onClick={actions.onPrint}><Printer size={24} /></Big>
            </Group>
          </>)}

          {tab === "home" && (<>
            <Group title="الخط" rows>
              <Row>
                <select
                  aria-label="الخط"
                  value={FONTS.some(f => f.value === attrs.fontFamily) ? attrs.fontFamily : ""}
                  onChange={e => (e.target.value ? chain().setFontFamily(e.target.value).run() : chain().unsetFontFamily().run())}
                >
                  <option value="">الخط الافتراضي</option>
                  {FONTS.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
                </select>
                <select
                  aria-label="حجم الخط" className="narrow"
                  value={SIZES.includes(attrs.fontSize ?? "") ? attrs.fontSize : ""}
                  onChange={e => (e.target.value ? chain().setFontSize(e.target.value).run() : chain().unsetFontSize().run())}
                >
                  <option value="">الحجم</option>
                  {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Row>
              <Row>
                <Btn label="غامق" active={editor.isActive("bold")} onClick={() => chain().toggleBold().run()}><Bold size={18} /></Btn>
                <Btn label="مائل" active={editor.isActive("italic")} onClick={() => chain().toggleItalic().run()}><Italic size={18} /></Btn>
                <Btn label="تسطير" active={editor.isActive("underline")} onClick={() => chain().toggleUnderline().run()}><Underline size={18} /></Btn>
                <Btn label="منخفض" active={editor.isActive("subscript")} onClick={() => chain().toggleSubscript().run()}><Subscript size={18} /></Btn>
                <Btn label="مرتفع" active={editor.isActive("superscript")} onClick={() => chain().toggleSuperscript().run()}><Superscript size={18} /></Btn>
              </Row>
            </Group>

            <Group title="الألوان" rows>
              <Row>
                <label className="tb-btn wide" title="لون الخط">
                  <Palette size={18} /><span>لون الخط</span>
                  <input className="visually-hidden" type="color" aria-label="لون الخط" onChange={e => chain().setColor(e.target.value).run()} />
                </label>
                <label className="tb-btn wide" title="تمييز بلون">
                  <Highlighter size={18} /><span>تمييز</span>
                  <input className="visually-hidden" type="color" defaultValue="#fff2a8" aria-label="لون التمييز" onChange={e => chain().setHighlight({ color: e.target.value }).run()} />
                </label>
              </Row>
              <Row>
                <Btn label="إلغاء التمييز عن النص المحدد" wide active={editor.isActive("highlight")} onClick={() => chain().unsetHighlight().run()}><Eraser size={17} /><span>بلا تمييز</span></Btn>
                <Btn label="إعادة لون الخط الافتراضي" wide onClick={() => chain().unsetColor().run()}><Palette size={17} /><span>بلا لون</span></Btn>
                <Btn label="مسح كل التنسيق عن النص المحدد" onClick={() => chain().unsetAllMarks().run()}><RemoveFormatting size={18} /></Btn>
              </Row>
            </Group>

            <Group title="الفقرة" rows>
              <Row>
                <select aria-label="نمط الفقرة" value={headingValue} onChange={e => setBlock(e.target.value)}>
                  <option value="p">فقرة</option>
                  <option value="1">عنوان 1</option>
                  <option value="2">عنوان 2</option>
                  <option value="3">عنوان 3</option>
                </select>
                <Btn label="اتجاه من اليمين إلى اليسار" wide onClick={() => chain().setDirection("rtl").run()}>RTL</Btn>
                <Btn label="اتجاه من اليسار إلى اليمين" wide onClick={() => chain().setDirection("ltr").run()}>LTR</Btn>
              </Row>
              <Row>
                <Btn label="محاذاة لليمين" active={editor.isActive({ textAlign: "right" })} onClick={() => chain().setTextAlign("right").run()}><AlignRight size={18} /></Btn>
                <Btn label="توسيط" active={editor.isActive({ textAlign: "center" })} onClick={() => chain().setTextAlign("center").run()}><AlignCenter size={18} /></Btn>
                <Btn label="محاذاة لليسار" active={editor.isActive({ textAlign: "left" })} onClick={() => chain().setTextAlign("left").run()}><AlignLeft size={18} /></Btn>
                <Btn label="ضبط" active={editor.isActive({ textAlign: "justify" })} onClick={() => chain().setTextAlign("justify").run()}><AlignJustify size={18} /></Btn>
              </Row>
            </Group>

            <Group title="القوائم">
              <Btn label="قائمة نقطية" active={editor.isActive("bulletList")} onClick={() => chain().toggleBulletList().run()}><List size={20} /></Btn>
              <Btn label="قائمة مرقمة" active={editor.isActive("orderedList")} onClick={() => chain().toggleOrderedList().run()}><ListOrdered size={20} /></Btn>
              <Btn label="اقتباس / مثال" active={editor.isActive("blockquote")} onClick={() => chain().toggleBlockquote().run()}><Quote size={20} /></Btn>
            </Group>
          </>)}

          {tab === "insert" && (<>
            <Group title="معادلات">
              <Big label="معادلة داخل السطر" text="سطرية" onClick={() => chain().insertMathInline().run()}><Sigma size={24} /></Big>
              <Big label="معادلة في سطر مستقل" text="كتلة" onClick={() => chain().insertMathBlock().run()}><Sigma size={24} /></Big>
              <Big label="إدراج معادلة من مصدر LaTeX" text="من LaTeX" onClick={onOpenLatex}><Code2 size={24} /></Big>
            </Group>
            <Group title="رسوم">
              <Big label="رسم بياني أو هندسي" text="رسم" onClick={() => onGraph()}><LineChart size={24} /></Big>
            </Group>
            <Group title="جداول وصور">
              <Big label="إدراج جدول 3×3" text="جدول" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={24} /></Big>
              <Big label="إدراج صورة" text="صورة" onClick={() => fileRef.current?.click()}><ImagePlus size={24} /></Big>
              <input
                ref={fileRef} className="visually-hidden" type="file" accept="image/*"
                onChange={e => { void pickImage(e.target.files?.[0]); e.target.value = ""; }}
              />
            </Group>
            <Group title="تخطيط">
              <Big label="كتلة بعمودين" text="عمودان" onClick={() => chain().insertColumns().run()}><Columns2 size={24} /></Big>
              <Big label="خط فاصل" text="خط فاصل" onClick={() => chain().setHorizontalRule().run()}><Minus size={24} /></Big>
              <Big label="فاصل صفحة" text="فاصل صفحة" onClick={() => chain().insertPageBreak().run()}><SeparatorHorizontal size={24} /></Big>
            </Group>
          </>)}

          {tab === "layout" && (<>
            <Group title="الاتجاه">
              <Big label="ورقة عمودية" text="عمودي" active={page.orientation === "portrait"} onClick={() => actions.onQuickPage({ orientation: "portrait" })}><RectangleVertical size={24} /></Big>
              <Big label="ورقة أفقية" text="أفقي" active={page.orientation === "landscape"} onClick={() => actions.onQuickPage({ orientation: "landscape" })}><RectangleHorizontal size={24} /></Big>
            </Group>
            <Group title="الهوامش">
              {MARGIN_PRESETS.map(p => (
                <Big key={p.mm} label={`هوامش ${p.label} (${p.mm} مم)`} text={`${p.label} ${p.mm}`} active={uniformMargin === p.mm} onClick={() => actions.onQuickPage({ marginMm: p.mm })}>
                  <SlidersHorizontal size={24} />
                </Big>
              ))}
            </Group>
            <Group title="خيارات متقدمة">
              <Big label="هوامش مخصصة، الرأس والتذييل، الترقيم" text="إعدادات الصفحة…" onClick={actions.onPageSettings}><SlidersHorizontal size={24} /></Big>
            </Group>
          </>)}

          {tab === "ctx" && ctx === "table" && (
            <Group title="الصفوف والأعمدة">
              <Btn wide label="إضافة صف بعد" onClick={() => chain().addRowAfter().run()}>+ صف</Btn>
              <Btn wide label="إضافة عمود قبل" onClick={() => chain().addColumnBefore().run()}>+ عمود قبل</Btn>
              <Btn wide label="إضافة عمود بعد" onClick={() => chain().addColumnAfter().run()}>+ عمود بعد</Btn>
              <Btn wide label="حذف الصف" onClick={() => chain().deleteRow().run()}>حذف صف</Btn>
              <Btn wide label="حذف العمود" onClick={() => chain().deleteColumn().run()}>حذف عمود</Btn>
              <Btn wide label="دمج أو فصل الخلايا" onClick={() => chain().mergeOrSplit().run()}>دمج/فصل</Btn>
              <Btn wide label="صف العناوين" onClick={() => chain().toggleHeaderRow().run()}>صف العناوين</Btn>
              <Btn wide label="حذف الجدول" onClick={() => chain().deleteTable().run()}>حذف الجدول</Btn>
            </Group>
          )}
          {tab === "ctx" && ctx === "image" && (
            <Group title="حجم الصورة">
              {["25%", "50%", "75%", "100%"].map(w => (
                <Btn key={w} wide label={`عرض ${w}`} onClick={() => chain().updateAttributes("image", { width: w }).run()}>{w}</Btn>
              ))}
              <Btn wide label="حذف الصورة" onClick={() => chain().deleteSelection().run()}>حذف</Btn>
            </Group>
          )}
          {tab === "ctx" && ctx === "graph" && (
            <Group title="الرسم">
              <Btn wide primary label="تعديل الرسم" onClick={() => onGraph(editor.state.selection.from)}>تعديل الرسم</Btn>
              <Btn wide label="حذف الرسم" onClick={() => chain().deleteSelection().run()}>حذف</Btn>
            </Group>
          )}
          {tab === "ctx" && ctx === "columns" && (
            <Group title="الأعمدة">
              <Btn wide label="حذف كتلة العمودين مع محتواها" onClick={() => chain().deleteColumns().run()}>حذف الكتلة</Btn>
            </Group>
          )}
        </div>
      )}
    </div>
  );
}
