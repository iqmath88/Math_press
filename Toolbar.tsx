import { useRef } from "react";
import type { Editor } from "@tiptap/react";
import {
  Undo2, Redo2, Bold, Italic, Underline, Subscript, Superscript, List, ListOrdered,
  AlignRight, AlignCenter, AlignLeft, AlignJustify, Table as TableIcon, ImagePlus, Sigma,
  Highlighter, Palette, SeparatorHorizontal, Quote, Minus, Code2
} from "lucide-react";
import { fileToDataUrl } from "./imageUtil";

const FONTS = [
  { label: "نسخ", value: '"Noto Naskh Arabic", serif' },
  { label: "أميري", value: "Amiri, serif" },
  { label: "القاهرة", value: "Cairo, sans-serif" },
  { label: "Times", value: '"Times New Roman", serif' },
  { label: "Arial", value: "Arial, sans-serif" }
];
const SIZES = ["10", "11", "12", "13", "14", "16", "18", "20", "24", "28", "32", "40"];

type Props = {
  editor: Editor;
  onOpenLatex: () => void;
  onError: (message: string) => void;
};

function Btn(props: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <button
      type="button"
      className={`tb-btn${props.active ? " on" : ""}${props.wide ? " wide" : ""}`}
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active ?? undefined}
      disabled={props.disabled}
      onMouseDown={e => e.preventDefault()}
      onClick={props.onClick}
    >{props.children}</button>
  );
}

export default function Toolbar({ editor, onOpenLatex, onError }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const chain = () => editor.chain().focus();
  const attrs = editor.getAttributes("textStyle") as { fontFamily?: string; fontSize?: string };

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
      const src = await fileToDataUrl(file);
      chain().setImage({ src, alt: file.name }).run();
    } catch (e) {
      onError(e instanceof Error ? e.message : "تعذر إدراج الصورة");
    }
  };

  const inTable = editor.isActive("table");
  const inImage = editor.isActive("image");

  return (
    <div className="ribbon no-print" role="toolbar" aria-label="أدوات التنسيق">
      <div className="ribbon-row">
        <div className="tb-group">
          <Btn label="تراجع" disabled={!editor.can().undo()} onClick={() => chain().undo().run()}><Undo2 size={18} /></Btn>
          <Btn label="إعادة" disabled={!editor.can().redo()} onClick={() => chain().redo().run()}><Redo2 size={18} /></Btn>
        </div>

        <div className="tb-group">
          <select aria-label="نمط الفقرة" value={headingValue} onChange={e => setBlock(e.target.value)}>
            <option value="p">فقرة</option>
            <option value="1">عنوان 1</option>
            <option value="2">عنوان 2</option>
            <option value="3">عنوان 3</option>
          </select>
          <select
            aria-label="الخط"
            value={FONTS.some(f => f.value === attrs.fontFamily) ? attrs.fontFamily : ""}
            onChange={e => (e.target.value ? chain().setFontFamily(e.target.value).run() : chain().unsetFontFamily().run())}
          >
            <option value="">الخط الافتراضي</option>
            {FONTS.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
          </select>
          <select
            aria-label="حجم الخط"
            className="narrow"
            value={SIZES.includes(attrs.fontSize ?? "") ? attrs.fontSize : ""}
            onChange={e => (e.target.value ? chain().setFontSize(e.target.value).run() : chain().unsetFontSize().run())}
          >
            <option value="">الحجم</option>
            {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="tb-group">
          <Btn label="غامق" active={editor.isActive("bold")} onClick={() => chain().toggleBold().run()}><Bold size={18} /></Btn>
          <Btn label="مائل" active={editor.isActive("italic")} onClick={() => chain().toggleItalic().run()}><Italic size={18} /></Btn>
          <Btn label="تسطير" active={editor.isActive("underline")} onClick={() => chain().toggleUnderline().run()}><Underline size={18} /></Btn>
          <Btn label="منخفض" active={editor.isActive("subscript")} onClick={() => chain().toggleSubscript().run()}><Subscript size={18} /></Btn>
          <Btn label="مرتفع" active={editor.isActive("superscript")} onClick={() => chain().toggleSuperscript().run()}><Superscript size={18} /></Btn>
          <label className="tb-btn" title="لون الخط">
            <Palette size={18} />
            <input className="visually-hidden" type="color" aria-label="لون الخط" onChange={e => chain().setColor(e.target.value).run()} />
          </label>
          <label className="tb-btn" title="تمييز بلون">
            <Highlighter size={18} />
            <input className="visually-hidden" type="color" defaultValue="#fff2a8" aria-label="لون التمييز" onChange={e => chain().setHighlight({ color: e.target.value }).run()} />
          </label>
          <Btn label="إزالة التمييز" onClick={() => chain().unsetHighlight().run()}><Minus size={18} /></Btn>
        </div>

        <div className="tb-group">
          <Btn label="محاذاة لليمين" active={editor.isActive({ textAlign: "right" })} onClick={() => chain().setTextAlign("right").run()}><AlignRight size={18} /></Btn>
          <Btn label="توسيط" active={editor.isActive({ textAlign: "center" })} onClick={() => chain().setTextAlign("center").run()}><AlignCenter size={18} /></Btn>
          <Btn label="محاذاة لليسار" active={editor.isActive({ textAlign: "left" })} onClick={() => chain().setTextAlign("left").run()}><AlignLeft size={18} /></Btn>
          <Btn label="ضبط" active={editor.isActive({ textAlign: "justify" })} onClick={() => chain().setTextAlign("justify").run()}><AlignJustify size={18} /></Btn>
          <Btn label="اتجاه من اليمين إلى اليسار" wide onClick={() => chain().setDirection("rtl").run()}>RTL</Btn>
          <Btn label="اتجاه من اليسار إلى اليمين" wide onClick={() => chain().setDirection("ltr").run()}>LTR</Btn>
        </div>

        <div className="tb-group">
          <Btn label="قائمة نقطية" active={editor.isActive("bulletList")} onClick={() => chain().toggleBulletList().run()}><List size={18} /></Btn>
          <Btn label="قائمة مرقمة" active={editor.isActive("orderedList")} onClick={() => chain().toggleOrderedList().run()}><ListOrdered size={18} /></Btn>
          <Btn label="اقتباس / مثال" active={editor.isActive("blockquote")} onClick={() => chain().toggleBlockquote().run()}><Quote size={18} /></Btn>
        </div>

        <div className="tb-group">
          <Btn label="معادلة داخل السطر" wide onClick={() => chain().insertMathInline().run()}><Sigma size={18} /><span>سطرية</span></Btn>
          <Btn label="معادلة في سطر مستقل" wide onClick={() => chain().insertMathBlock().run()}><Sigma size={18} /><span>كتلة</span></Btn>
          <Btn label="إدراج معادلة من LaTeX" onClick={onOpenLatex}><Code2 size={18} /></Btn>
        </div>

        <div className="tb-group">
          <Btn label="إدراج جدول" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={18} /></Btn>
          <Btn label="إدراج صورة" onClick={() => fileRef.current?.click()}><ImagePlus size={18} /></Btn>
          <Btn label="خط فاصل" onClick={() => chain().setHorizontalRule().run()}><Minus size={18} /></Btn>
          <Btn label="فاصل صفحة" onClick={() => chain().insertPageBreak().run()}><SeparatorHorizontal size={18} /></Btn>
          <input
            ref={fileRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            onChange={e => { void pickImage(e.target.files?.[0]); e.target.value = ""; }}
          />
        </div>
      </div>

      {inTable && (
        <div className="ribbon-row context">
          <span className="ctx-label">الجدول:</span>
          <Btn wide label="إضافة صف بعد" onClick={() => chain().addRowAfter().run()}>+ صف</Btn>
          <Btn wide label="إضافة عمود قبل" onClick={() => chain().addColumnBefore().run()}>+ عمود قبل</Btn>
          <Btn wide label="إضافة عمود بعد" onClick={() => chain().addColumnAfter().run()}>+ عمود بعد</Btn>
          <Btn wide label="حذف الصف" onClick={() => chain().deleteRow().run()}>حذف صف</Btn>
          <Btn wide label="حذف العمود" onClick={() => chain().deleteColumn().run()}>حذف عمود</Btn>
          <Btn wide label="دمج أو فصل الخلايا" onClick={() => chain().mergeOrSplit().run()}>دمج/فصل</Btn>
          <Btn wide label="صف العناوين" onClick={() => chain().toggleHeaderRow().run()}>صف العناوين</Btn>
          <Btn wide label="حذف الجدول" onClick={() => chain().deleteTable().run()}>حذف الجدول</Btn>
        </div>
      )}

      {inImage && (
        <div className="ribbon-row context">
          <span className="ctx-label">الصورة:</span>
          {["25%", "50%", "75%", "100%"].map(w => (
            <Btn key={w} wide label={`عرض ${w}`} onClick={() => chain().updateAttributes("image", { width: w }).run()}>{w}</Btn>
          ))}
          <Btn wide label="حذف الصورة" onClick={() => chain().deleteSelection().run()}>حذف</Btn>
        </div>
      )}
    </div>
  );
}
