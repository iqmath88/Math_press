import { useState } from "react";

const templates = [
  ["fraction", "كسر", "\\frac{a}{b}"], ["root", "جذر", "\\sqrt{x}"],
  ["power", "أس", "x^{2}"], ["log", "لوغاريتم", "\\log_{a}(x)"],
  ["trig", "مثلثات", "\\sin(x)"], ["limit", "نهاية", "\\lim_{x\\to 0} f(x)"],
  ["derivative", "مشتقة", "\\frac{dy}{dx}"], ["integral", "تكامل", "\\int_{a}^{b} f(x)\\,dx"],
  ["sum", "مجموع", "\\sum_{k=1}^{n} a_k"], ["matrix", "مصفوفة", "\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}"],
  ["determinant", "محدد", "\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}"], ["vector", "متجه", "\\vec{v}"],
  ["brackets", "أقواس", "\\left(\\frac{a}{b}\\right)"],
  ["system", "نظام معادلات", "\\begin{cases}x+y=3\\\\x-y=1\\end{cases}"],
  ["piecewise", "دالة متعددة التعريف", "f(x)=\\begin{cases}x&x\\ge0\\\\-x&x<0\\end{cases}"],
  ["greek", "رموز يونانية", "\\alpha+\\beta=\\gamma"], ["sets", "مجموعات ومتباينات", "x\\in A\\cap B,\\ x\\le y"],
  ["steps", "خطوات حل", "\\begin{aligned}2x+4&=8\\\\2x&=4\\\\x&=2\\end{aligned}"]
] as const;
type TemplateId = typeof templates[number][0];
type Preferences = { favorite: TemplateId[]; recent: TemplateId[] };
const storeKey = "mathpress-math-templates";

function readPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(storeKey) ?? "{}");
    const ids = (value: unknown): TemplateId[] => Array.isArray(value)
      ? value.filter((id): id is TemplateId => templates.some(template => template[0] === id))
      : [];
    return { favorite: ids(stored?.favorite), recent: ids(stored?.recent).slice(0, 6) };
  } catch { return { favorite: [], recent: [] }; }
}

export default function MathTools({ onInsert, onInline, onBlock, onSource }: {
  onInsert: (latex: string) => void;
  onInline: () => void;
  onBlock: () => void;
  onSource: () => void;
}) {
  const [prefs, setPrefs] = useState(readPreferences);
  const [panel, setPanel] = useState(false);
  const [mode, setMode] = useState<"all" | "recent" | "favorite">("all");
  const update = (next: Preferences) => {
    setPrefs(next);
    try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* التخزين غير متاح */ }
  };
  const visible = mode === "all" ? templates : prefs[mode].flatMap(id => templates.filter(t => t[0] === id));

  return (
    <section className="rb-group" aria-label="تحرير المعادلات">
      <div className="rb-line">
        <button type="button" onClick={onInline}>معادلة سطرية</button>
        <button type="button" onClick={onBlock}>معادلة مستقلة</button>
        <button type="button" onClick={onSource}>إدراج معادلة من مصدر LaTeX</button>
        <button type="button" onClick={() => setPanel(v => !v)} aria-expanded={panel}>قوالب الرياضيات</button>
      </div>
      {panel && <div className="rb-line math-templates">
        <select aria-label="مجموعة القوالب الرياضية" value={mode}
          onChange={e => setMode(e.target.value as typeof mode)}>
          <option value="all">كل القوالب</option><option value="recent">الأخيرة</option><option value="favorite">المفضلة</option>
        </select>
        {!visible.length && <span className="muted">لا توجد قوالب في هذه المجموعة.</span>}
        {visible.map(([id, label, latex]) => (
          <span className="math-template" key={id}>
            <button type="button" onClick={() => {
              update({ ...prefs, recent: [id, ...prefs.recent.filter(item => item !== id)].slice(0, 6) });
              onInsert(latex);
            }}>{label}</button>
            <button type="button" aria-label={`المفضلة: ${label}`} aria-pressed={prefs.favorite.includes(id)}
              onClick={() => update({
                ...prefs, favorite: prefs.favorite.includes(id) ? prefs.favorite.filter(item => item !== id) : [...prefs.favorite, id]
              })}>☆</button>
          </span>
        ))}
      </div>}
    </section>
  );
}
