import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { MathfieldElement } from "mathlive";
import { returnFromMath } from "./MathNodes";

const catalog = [
  ["fraction", "كسر", "a⁄b", String.raw`\frac{#?}{#?}`, "structure"],
  ["root", "جذر تربيعي", "√", String.raw`\sqrt{#?}`, "structure"],
  ["nth-root", "جذر نوني", "ⁿ√", String.raw`\sqrt[#?]{#?}`, "structure"],
  ["power", "أس", "xⁿ", "^{#?}", "structure"],
  ["subscript", "مؤشر سفلي", "xₙ", "_{#?}", "structure"],
  ["matrix", "مصفوفة", "▦", String.raw`\begin{bmatrix}#?&#?\\#?&#?\end{bmatrix}`, "structure"],
  ["determinant", "محدد", "|▦|", String.raw`\begin{vmatrix}#?&#?\\#?&#?\end{vmatrix}`, "structure"],
  ["absolute", "قيمة مطلقة", "|x|", String.raw`\left|#?\right|`, "structure"],
  ["brackets", "أقواس", "(x)", String.raw`\left(#?\right)`, "structure"],
  ["system", "نظام معادلات", "{", String.raw`\begin{cases}#?\\#?\end{cases}`, "structure"],
  ["piecewise", "دالة متعددة التعريف", "f(x)", String.raw`\begin{cases}#?&#?\\#?&#?\end{cases}`, "structure"],
  ["trig", "جيب", "sin", String.raw`\sin\left(#?\right)`, "structure"],
  ["cos", "جيب تمام", "cos", String.raw`\cos\left(#?\right)`, "structure"],
  ["tan", "ظل", "tan", String.raw`\tan\left(#?\right)`, "structure"],
  ["log", "لوغاريتم", "log", String.raw`\log_{#?}\left(#?\right)`, "structure"],
  ["ln", "لوغاريتم طبيعي", "ln", String.raw`\ln\left(#?\right)`, "structure"],
  ["integral", "تكامل محدد", "∫ₐᵇ", String.raw`\int_{#?}^{#?} #?\,dx`, "calculus"],
  ["indefinite", "تكامل غير محدد", "∫", String.raw`\int #?\,dx`, "calculus"],
  ["limit", "نهاية", "lim", String.raw`\lim_{#?\to #?} #?`, "calculus"],
  ["sum", "مجموع", "∑", String.raw`\sum_{#?}^{#?} #?`, "calculus"],
  ["derivative", "مشتقة", "dy⁄dx", String.raw`\frac{d #?}{d #?}`, "calculus"],
  ["partial", "تفاضل جزئي", "∂", String.raw`\partial`, "calculus"],
  ["infinity", "ما لا نهاية", "∞", String.raw`\infty`, "calculus"],
  ["plus-minus", "زائد أو ناقص", "±", String.raw`\pm`, "relation"],
  ["times", "ضرب", "×", String.raw`\times`, "relation"],
  ["divide", "قسمة", "÷", String.raw`\div`, "relation"],
  ["equal", "يساوي", "=", "=", "relation"],
  ["not-equal", "لا يساوي", "≠", String.raw`\ne`, "relation"],
  ["le", "أقل من أو يساوي", "≤", String.raw`\le`, "relation"],
  ["ge", "أكبر من أو يساوي", "≥", String.raw`\ge`, "relation"],
  ["approx", "يساوي تقريبًا", "≈", String.raw`\approx`, "relation"],
  ["greek", "ألفا", "α", String.raw`\alpha`, "greek"],
  ["beta", "بيتا", "β", String.raw`\beta`, "greek"],
  ["gamma", "غاما", "γ", String.raw`\gamma`, "greek"],
  ["delta", "دلتا", "δ", String.raw`\delta`, "greek"],
  ["theta", "ثيتا", "θ", String.raw`\theta`, "greek"],
  ["lambda", "لامدا", "λ", String.raw`\lambda`, "greek"],
  ["mu", "ميو", "μ", String.raw`\mu`, "greek"],
  ["pi", "باي", "π", String.raw`\pi`, "greek"],
  ["omega", "أوميغا", "ω", String.raw`\omega`, "greek"],
  ["vector", "متجه", "v⃗", String.raw`\vec{#?}`, "geometry"],
  ["angle", "زاوية", "∠", String.raw`\angle`, "geometry"],
  ["parallel", "توازٍ", "∥", String.raw`\parallel`, "geometry"],
  ["perpendicular", "تعامد", "⊥", String.raw`\perp`, "geometry"],
  ["sets", "ينتمي", "∈", String.raw`\in`, "geometry"],
  ["union", "اتحاد", "∪", String.raw`\cup`, "geometry"],
  ["intersection", "تقاطع", "∩", String.raw`\cap`, "geometry"],
  ["subset", "مجموعة جزئية", "⊆", String.raw`\subseteq`, "geometry"],
  ["empty-set", "المجموعة الخالية", "∅", String.raw`\varnothing`, "geometry"],
  ["steps", "خطوات حل LaTeX", "≡", String.raw`\begin{aligned}2x+4&=8\\2x&=4\\x&=2\end{aligned}`, "source"],
] as const;

const groups = [
  ["structure", "البنى"], ["relation", "العمليات والعلاقات"], ["greek", "يونانية"],
  ["calculus", "التفاضل والتكامل"], ["geometry", "الهندسة والمجموعات"],
  ["recent", "الأخيرة"], ["favorite", "المفضلة"], ["source", "أمثلة LaTeX"],
] as const;
type Group = typeof groups[number][0];
type Id = typeof catalog[number][0];
type Preferences = { favorite: Id[]; recent: Id[] };
const storeKey = "mathpress-math-templates";
const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[أإآ]/g, "ا").trim();

function readPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(storeKey) ?? "{}");
    const ids = (value: unknown): Id[] => Array.isArray(value)
      ? [...new Set(value.filter((id): id is Id => catalog.some(entry => entry[0] === id)))]
      : [];
    return { favorite: ids(stored?.favorite), recent: ids(stored?.recent).slice(0, 12) };
  } catch { return { favorite: [], recent: [] }; }
}

export default function MathTools({ editor, onSource }: {
  editor: Editor;
  onSource: (latex?: string) => void;
}) {
  const [prefs, setPrefs] = useState(readPreferences);
  const [group, setGroup] = useState<Group>("structure");
  const [query, setQuery] = useState("");
  const panel = useRef<HTMLElement>(null);
  const current = useRef<MathfieldElement | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const sync = () => {
      const active = document.activeElement;
      if (active?.matches("math-field") && editor.view.dom.contains(active)) {
        current.current = active as MathfieldElement;
      } else if (active && !panel.current?.contains(active)) {
        current.current = null;
      }
      setEditing(!!current.current);
    };
    document.addEventListener("focusin", sync);
    sync();
    return () => document.removeEventListener("focusin", sync);
  }, [editor]);

  const activeField = () => {
    const field = current.current;
    return field && editor.view.dom.contains(field) ? field : null;
  };
  const update = (next: Preferences) => {
    setPrefs(next);
    try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* التخزين غير متاح */ }
  };
  const search = normalize(query);
  const visible = search
    ? catalog.filter(([id, label, symbol, latex]) => normalize(`${label} ${symbol} ${id} ${latex}`).includes(search))
    : group === "recent" || group === "favorite"
      ? prefs[group].flatMap(id => catalog.filter(entry => entry[0] === id))
      : catalog.filter(entry => entry[4] === group);
  const select = ([id, , , latex, kind]: typeof catalog[number]) => {
    const field = activeField();
    if (kind === "source") {
      onSource(latex);
    } else if (field) {
      if (!field.insert(latex, { selectionMode: "placeholder", focus: true })) return;
    } else {
      if (!editor.chain().focus().insertMathInline(latex.replaceAll("#?", String.raw`\placeholder{}`)).run()) return;
    }
    update({ ...prefs, recent: [id, ...prefs.recent.filter(item => item !== id)].slice(0, 12) });
  };

  return (
    <section ref={panel} className="rb-group math-tools" aria-label="لوحة التأليف الرياضي">
      <div className="rb-line">
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => {
          const field = activeField();
          if (field) returnFromMath(field);
          editor.chain().focus().insertMathBlock().run();
        }}>معادلة مستقلة</button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => onSource()}>إدراج معادلة من مصدر LaTeX</button>
        {editing && <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => {
          const field = activeField();
          if (field) returnFromMath(field);
        }}>العودة إلى النص</button>}
        <input type="search" aria-label="البحث عن رمز أو قالب" placeholder="ابحث عن رمز أو قالب"
          value={query} onChange={e => setQuery(e.target.value)} />
        <select aria-label="مجموعة القوالب الرياضية" value={group}
          onChange={e => { setQuery(""); setGroup(e.target.value as Group); }}>
          {groups.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>
      <div className="rb-line math-templates">
        {!visible.length && <span role="status" className="muted">لا توجد نتائج.</span>}
        {visible.map(entry => {
          const [id, label, symbol] = entry;
          return <span className="math-template" key={id}>
            <button type="button" aria-label={label} title={label} onMouseDown={e => e.preventDefault()}
              onClick={() => select(entry)}><span dir="ltr">{symbol}</span><span>{label}</span></button>
            <button type="button" aria-label={`المفضلة: ${label}`} aria-pressed={prefs.favorite.includes(id)}
              onMouseDown={e => e.preventDefault()} onClick={() => update({
                ...prefs, favorite: prefs.favorite.includes(id) ? prefs.favorite.filter(item => item !== id) : [...prefs.favorite, id],
              })}>☆</button>
          </span>;
        })}
      </div>
    </section>
  );
}
