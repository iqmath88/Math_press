import { createPortal } from "react-dom";
import { useState, type CSSProperties } from "react";
import { blockMark, blockLabel, blockTypes, blockFonts, blockFrames } from "./creativeDesign";

const storageKey = "mathpress:block-styles:1";
type Style = { id: string; name: string; attrs: Record<string, unknown> };

function styleAttributes(attrs: Record<string, unknown>) {
  const color = (value: unknown) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : null;
  const length = (value: unknown, max: number) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : null;
  return {
    surface: typeof attrs.surface==="number" && attrs.surface>=20 ? length(attrs.surface,100) : null,
    shadow: attrs.shadow==="soft" || attrs.shadow==="none" ? attrs.shadow : null,
    frame: blockFrames.find(frame=>frame===attrs.frame) ?? null,
    font: blockFonts.find(font=>font===attrs.font) ?? null,
    size: typeof attrs.size==="number" && attrs.size>=10 ? length(attrs.size,30) : null,
    kind: blockTypes.some(([kind]) => kind === attrs.kind) ? attrs.kind : "custom",
    accent: color(attrs.accent), background: color(attrs.background),
    padding: length(attrs.padding, 48), radius: length(attrs.radius, 30), hideTitle: attrs.hideTitle === true
  };
}

function readStyles(): Style[] {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(data)) return [];
    return data.filter(item => item && typeof item.id === "string" && typeof item.name === "string" && item.attrs)
      .map(item => ({ id: item.id, name: item.name.slice(0, 80), attrs: styleAttributes(item.attrs) }));
  } catch { return []; }
}

const categories = [
  ["العناوين","chapter lesson subtitle"],
  ["المفاهيم والقواعد","definition concept law theorem property rule"],
  ["الأمثلة والحلول","example solution proof illustration"],
  ["التقويم","ministerial-question exercise check homework"],
  ["الملاحظات والمراجعة","note warning idea ministerial-idea summary custom"]
] as const;
const samples: Record<string,string> = {
  chapter:"التفاضل وتطبيقاته", lesson:"القيم القصوى المحلية", subtitle:"اختبار المشتقة الأولى",
  definition:"النقطة الحرجة تنتمي إلى مجال الدالة.", law:"مشتقة س² تساوي ٢س.",
  theorem:"تغيّر الإشارة يحدد نوع النقطة الحرجة.", example:"صنّف القيمة القصوى للدالة.",
  proof:"نقارن إشارة المشتقة على جانبي النقطة.", note:"افحص طرفي الفترة المغلقة.",
  warning:"الصفر وحده لا يكفي للحكم.", "ministerial-question":"أوجد القيمة الصغرى.", exercise:"اشتق الدالة وصنّف نقاطها."
};
const frameLabels = ["حسب النوع","رأس ملوّن","شريط جانبي","عنوان عائم","إطار مزدوج","خطوات","مقارنة","نتيجة","تنبيه"];
const favoritesKey = "mathpress:favorite-box-kinds";

export default function BlockStyleLibrary({ open, setOpen, dock, selected, insert, wrap, insertSolvedExample, apply, notice }: {
  open: boolean;
  dock: HTMLElement | null;
  setOpen: (open:boolean) => void;
  wrap: (kind:string, attrs?:Record<string,unknown>) => void;
  selected?: Record<string, unknown>;
  insert: (kind: string, attrs?: Record<string, unknown>) => void;
  insertSolvedExample: () => void;
  apply: (attrs: Record<string, unknown>) => void;
  notice: (message: string) => void;
}) {
  const [query,setQuery] = useState("");
  const [category,setCategory] = useState("");
  const [frame,setFrame] = useState("");
  const [mode,setMode] = useState("insert");
  const [pinned,setPinned] = useState(false);
  const finish = () => { if (!pinned) { setFrame(""); setOpen(false); } };
  const [favorites,setFavorites] = useState<string[]>(()=>{
    try {
      const values:unknown=JSON.parse(localStorage.getItem(favoritesKey) ?? "[]");
      return Array.isArray(values) ? values.filter(value=>blockTypes.some(([kind])=>kind===value)) : [];
    } catch { return []; }
  });
  const toggleFavorite = (kind:string) => {
    const next=favorites.includes(kind) ? favorites.filter(value=>value!==kind) : [...favorites,kind];
    try { localStorage.setItem(favoritesKey,JSON.stringify(next)); } catch { /* Session-only preference. */ }
    setFavorites(next);
  };
  const visible = blockTypes.filter(([kind,label])=>
    (!category || (category==="favorites" ? favorites.includes(kind) :
      categories.find(([name])=>name===category)?.[1].split(" ").includes(kind))) &&
    `${label} ${kind}`.includes(query.trim().toLowerCase()));

  const [name, setName] = useState("");
  const [styles, setStyles] = useState(readStyles);
  function write(next: Style[]) {
    if (next.length > 100) { notice("تتسع مكتبة الصناديق لـ100 نمط. احذف نمطًا قبل إضافة آخر."); return; }
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setStyles(next);
    } catch { notice("تعذّر حفظ مكتبة الأنماط على هذا الجهاز."); }
  }
  function exportStyles() {
    const file = new Blob([JSON.stringify({ format: "mathpress-block-styles", version: 1, styles }, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mathpress-block-styles.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importStyles(file?: File) {
    if (!file) return;
    try {
      if (file.size > 256 * 1024) throw new Error();
      const data = JSON.parse(await file.text());
      if (data?.format !== "mathpress-block-styles" || data.version !== 1 ||
          !Array.isArray(data.styles) || !data.styles.length || data.styles.length > 100 ||
          data.styles.some((item: Partial<Style> | null) => !item || typeof item.name !== "string" ||
            !item.name.trim() || !item.attrs || typeof item.attrs !== "object" ||
            !blockTypes.some(([kind]) => kind === item.attrs?.kind))) {
        throw new Error();
      }
      const imported: Style[] = data.styles.map((item: Style) => ({
        id: crypto.randomUUID(), name: item.name.trim().slice(0, 80), attrs: styleAttributes(item.attrs)
      }));
      write([...readStyles(), ...imported]);
    } catch { notice("تعذّر قراءة ملف أنماط الصناديق. احتُفظ بالمكتبة الحالية."); }
  }
  return <>
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>مكتبة أنماط الصناديق</button>
    {open && dock && createPortal(<section className="block-style-library no-print" aria-label="مكتبة أنماط الصناديق">
      <div className="block-style-actions block-style-heading">
        <strong style={{flex:"1 1 auto"}}>معرض الصناديق التعليمية</strong>
        <button type="button" aria-pressed={pinned} onClick={()=>setPinned(value=>!value)}>{pinned?"إلغاء التثبيت":"تثبيت"}</button>
        <button type="button" onClick={()=>{setFrame("");setOpen(false);}} aria-label="إغلاق معرض الصناديق">إغلاق ×</button>
      </div>
      <div className="block-style-actions block-style-filters">
        <label>بحث الصناديق <input type="search" value={query} onChange={event=>setQuery(event.target.value)}/></label>
        <label>التصنيف <select aria-label="التصنيف" value={category} onChange={event=>setCategory(event.target.value)}>
          <option value="">جميع الصناديق</option><option value="favorites">المفضلة</option>
          {categories.map(([name])=><option key={name}>{name}</option>)}
        </select></label>
        <label>الإطار <select aria-label="الإطار" value={frame} onChange={event=>setFrame(event.target.value)}>
          {["",...blockFrames].map((value,index)=><option key={value} value={value}>{frameLabels[index]}</option>)}
        </select></label>
        <label>الإجراء <select aria-label="الإجراء" value={mode} onChange={event=>setMode(event.target.value)}>
          <option value="insert">إدراج صندوق</option><option value="wrap">إحاطة التحديد</option>
          <option value="apply" disabled={!selected}>تغيير تصميم الصندوق الحالي</option>
        </select></label>
      </div>
      <div className="block-style-scroll">
      <div className="block-style-actions">
        <button type="button" onClick={()=>{insertSolvedExample();finish();}}>إدراج مثال محلول</button>
        <button type="button" disabled={!styles.length} onClick={exportStyles}>تصدير أنماط الصناديق</button>
        <label>استيراد أنماط الصناديق <input type="file" accept=".json,application/json" onChange={event => {
          void importStyles(event.target.files?.[0]);
          event.target.value = "";
        }} /></label>
      </div>
      {selected && <form onSubmit={event => {
        event.preventDefault();
        if (!name.trim()) return;
        write([...styles, { id: crypto.randomUUID(), name: name.trim(), attrs: styleAttributes(selected) }]);
        setName("");
      }}>
        <label>اسم النمط <input maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
        <button disabled={!name.trim()}>حفظ تنسيق الصندوق</button>
      </form>}
      {styles.length > 0 && <ul className="block-style-saved">
        {styles.map(style => <li key={style.id}>
          <span className="creative-block" data-education-block={String(style.attrs.kind)}
            data-block-background={style.attrs.background ?? undefined}
            data-block-padding={style.attrs.padding ?? undefined}
            data-block-frame={style.attrs.frame ? String(style.attrs.frame) : undefined}
            data-block-surface={style.attrs.surface ?? undefined}
            data-block-shadow={style.attrs.shadow ?? undefined}
            style={{
              "--block-surface": style.attrs.surface != null ? `${style.attrs.surface}%` : undefined,
              "--block-accent": style.attrs.accent ?? undefined,
              "--block-background": style.attrs.background ?? undefined,
              "--block-padding": style.attrs.padding != null ? `${style.attrs.padding}px` : undefined,
              "--block-radius": style.attrs.radius != null ? `${style.attrs.radius}px` : undefined
            } as CSSProperties}>
            <span className="creative-block-label">{style.name}</span>
          </span>
          <button type="button" onClick={() => {insert(String(style.attrs.kind), style.attrs);finish();}}>إدراج</button>
          {selected && <button type="button" onClick={() => apply(style.attrs)}>تطبيق</button>}
          <button type="button" onClick={() => write(styles.filter(item => item.id !== style.id))}>إزالة النمط</button>
        </li>)}
      </ul>}
      {!visible.length && <p>لا توجد صناديق تطابق البحث.</p>}
      <div className="block-style-grid">
        {visible.map(([kind,label]) => <div className="block-style-card" key={kind}>
          <button type="button" aria-label={`${mode==="wrap"?"إحاطة التحديد بـ":mode==="apply"?"تطبيق":"إدراج"} ${blockLabel(kind)}`} onMouseDown={event=>event.preventDefault()} onClick={()=>{
            const attrs={frame:frame || null};
            if(mode==="wrap") wrap(kind,attrs);
            else if(mode==="apply") {
              if(selected) apply({kind,...attrs});
              else notice("حدد صندوقًا لتغيير تصميمه.");
            } else { insert(kind,attrs); finish(); }
          }}>
            <span className="creative-block" data-education-block={kind} data-block-frame={frame || undefined}>
              <span className="creative-block-label"><span className="academic-block-mark" aria-hidden="true">{blockMark(kind)}</span>{label}</span>
              <span dir="rtl" className="creative-block-content">{samples[kind] ?? "مثال على تنسيق المحتوى."}</span>
            </span>
          </button>
          <button type="button" className="block-style-favorite" aria-label={`المفضلة: ${label}`}
            aria-pressed={favorites.includes(kind)} onClick={()=>toggleFavorite(kind)}>{favorites.includes(kind)?"★":"☆"}</button>
        </div>)}
      </div>
      </div>
    </section>, dock)}
  </>;
}
