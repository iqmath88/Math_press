import { useState, type CSSProperties } from "react";
import {
  defaultEducationalStyles, educationalStyleDeclarations, readEducationalStyles, resolveEducationalStyles,
  styleAlignments, styleFonts, type EducationalStyle
} from "./educationalStyles";

type Props = {
  overrides: EducationalStyle[];
  onChange: (styles: EducationalStyle[]) => void;
  onApply: (id: string) => void;
  onClose: () => void;
};

const builtIn = (id: string) => defaultEducationalStyles.some(style => style.id === id);
const numberFields = [
  ["size", "حجم الخط (نقطة)", 8, 72, 1], ["mathScale", "حجم المعادلة (%)", 50, 200, 1],
  ["lineHeight", "تباعد الأسطر", 1, 3, .05], ["padding", "الحشو (بكسل)", 0, 32, 1],
  ["before", "المسافة قبل النص (بكسل)", 0, 80, 1], ["after", "المسافة بعد النص (بكسل)", 0, 80, 1]
] as const;
const alignLabels = { start: "البداية", center: "وسط", end: "النهاية", justify: "ضبط" };

export default function StyleManager({ overrides, onChange, onApply, onClose }: Props) {
  const styles = resolveEducationalStyles(overrides);
  const [draft, setDraft] = useState<EducationalStyle>({ ...styles[0] });
  const [notice, setNotice] = useState("");
  const patch = (values: Partial<EducationalStyle>) => setDraft(old => ({ ...old, ...values }));
  const validated = readEducationalStyles([draft])[0];
  const valid = !!validated && numberFields.every(([key, , min, max]) => draft[key] >= min && draft[key] <= max);
  const save = () => {
    if (!valid) return;
    onChange([...overrides.filter(style => style.id !== draft.id), validated]);
    setNotice("تم حفظ النمط في المستند.");
  };
  const cloneStyle = (blank: boolean) => {
    const base = blank ? defaultEducationalStyles[defaultEducationalStyles.length - 1] : draft;
    setDraft({ ...base, name: blank ? "نمط جديد" : `نسخة من ${draft.name}`, id: `custom-${crypto.randomUUID()}` });
    setNotice("");
  };

  const exportStyles = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: "mathpress-styles", styles }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "mathpress-styles.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importStyles = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 200_000) throw new Error();
      const data = JSON.parse(await file.text());
      const parsed = readEducationalStyles(data?.styles);
      if (data?.format !== "mathpress-styles" || !parsed.length || parsed.length !== data.styles.length) throw new Error();
      const combined = new Map(overrides.map(style => [style.id, style]));
      for (const style of parsed) combined.set(style.id, style);
      if (combined.size > 80) throw new Error();
      onChange([...combined.values()]);
      setDraft({ ...parsed[0] });
      setNotice("تم استيراد مجموعة الأنماط.");
    } catch {
      setNotice("تعذر استيراد مجموعة الأنماط. تحقق من الملف وحجمه.");
    }
  };

  const preview = Object.fromEntries(educationalStyleDeclarations(validated ?? styles[0]).split(";")
    .map(part => part.trim()).filter(Boolean).map(part => {
      const [key, value] = part.split(":");
      return [key.startsWith("--") ? key : key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), value.replace(/\s+/g, " ").trim()];
    })) as CSSProperties;

  return (
    <div className="modal-backdrop no-print" onClick={onClose}>
      <div className="modal style-manager" role="dialog" aria-modal="true" aria-label="إدارة الأنماط التعليمية"
        onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
        <strong>إدارة الأنماط التعليمية</strong>
        <div className="grow-row modal-actions">
          <select aria-label="النمط الحالي" value={draft.id}
            onChange={e => { setDraft({ ...styles.find(style => style.id === e.target.value)! }); setNotice(""); }}>
            {!styles.some(style => style.id === draft.id) && <option value={draft.id}>{draft.name}</option>}
            {styles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}
          </select>
          <button type="button" onClick={() => cloneStyle(true)}>جديد</button>
          <button type="button" onClick={() => cloneStyle(false)}>نسخ</button>
          <button type="button" disabled={builtIn(draft.id) || !overrides.some(style => style.id === draft.id)}
            onClick={() => { onChange(overrides.filter(style => style.id !== draft.id)); setDraft({ ...defaultEducationalStyles[0] }); }}>
            حذف النمط
          </button>
        </div>
        <div className="style-fields">
          <label className="gfield">الاسم<input value={draft.name} maxLength={80} onChange={e => patch({ name: e.target.value })} /></label>
          <label className="gfield">الخط<select value={draft.font}
            onChange={e => patch({ font: e.target.value as EducationalStyle["font"] })}>
            {styleFonts.map(font => <option key={font}>{font}</option>)}
          </select></label>
          {numberFields.map(([key, label, min, max, step]) => (
            <label key={key} className="gfield">{label}
              <input type="number" dir="ltr" min={min} max={max} step={step} value={Number.isNaN(draft[key]) ? "" : draft[key]}
                onChange={e => patch({ [key]: e.target.valueAsNumber })} />
            </label>
          ))}
          <label className="gfield">المحاذاة<select value={draft.align}
            onChange={e => patch({ align: e.target.value as EducationalStyle["align"] })}>
            {styleAlignments.map(value => <option key={value} value={value}>{alignLabels[value]}</option>)}
          </select></label>
          <label className="gfield">الاتجاه<select value={draft.direction} onChange={e => patch({ direction: e.target.value === "ltr" ? "ltr" : "rtl" })}>
            <option value="rtl">يمين إلى يسار</option><option value="ltr">يسار إلى يمين</option>
          </select></label>
          {([["color", "لون النص"], ["mathColor", "لون المعادلة"], ["background", "الخلفية"], ["border", "الحدود"]] as const).map(([key, label]) => (
            <label className="gfield" key={key}>{label}<input type="color" value={draft[key] ?? "#ffffff"}
              onChange={e => patch({ [key]: e.target.value })} /></label>
          ))}
        </div>
        <div className="grow-row">
          <button type="button" onClick={() => patch({ background: null })}>إزالة الخلفية</button>
          <button type="button" onClick={() => patch({ border: null })}>إزالة الحدود</button>
          {([["bold", "عريض"], ["keepWithNext", "إبقاء مع الفقرة التالية"], ["breakBefore", "بدء صفحة جديدة"]] as const).map(([key, label]) =>
            <label className="check" key={key}><input type="checkbox" checked={draft[key]}
              onChange={e => patch({ [key]: e.target.checked })} />{label}</label>)}
        </div>
        <p className="style-preview" style={preview}>معاينة النمط <span dir="ltr">x² + 1</span></p>
        <div className="modal-actions">
          <button type="button" className="primary-action" disabled={!valid || (!overrides.some(style => style.id === draft.id) && overrides.length >= 80)} onClick={save}>حفظ النمط</button>
          <button type="button" disabled={!styles.some(style => style.id === draft.id)} onClick={() => { onApply(draft.id); onClose(); }}>تطبيق النمط المحفوظ</button>
          <button type="button" onClick={exportStyles}>تصدير المجموعة</button>
          <label className="file-btn">استيراد مجموعة <input type="file" className="visually-hidden" accept=".json,application/json"
            onChange={e => { void importStyles(e.target.files?.[0]); e.currentTarget.value = ""; }} /></label>
          <button type="button" onClick={() => {
            if (!window.confirm("استعادة تعريفات الأنماط الافتراضية؟")) return;
            onChange(overrides.filter(style => !builtIn(style.id)));
            setDraft({ ...defaultEducationalStyles[0] });
          }}>استعادة الافتراضيات</button>
          <button type="button" onClick={onClose}>إغلاق</button>
        </div>
        <output aria-live="polite">{notice}</output>
      </div>
    </div>
  );
}
