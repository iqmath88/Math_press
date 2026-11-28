import { useState, type CSSProperties } from "react";
import { blockLabel, blockTypes } from "./creativeDesign";

const storageKey = "mathpress:block-styles:1";
type Style = { id: string; name: string; attrs: Record<string, unknown> };

function styleAttributes(attrs: Record<string, unknown>) {
  const color = (value: unknown) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : null;
  const length = (value: unknown, max: number) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : null;
  return {
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

export default function BlockStyleLibrary({ selected, insert, insertSolvedExample, apply, notice }: {
  selected?: Record<string, unknown>;
  insert: (kind: string, attrs?: Record<string, unknown>) => void;
  insertSolvedExample: () => void;
  apply: (attrs: Record<string, unknown>) => void;
  notice: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
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
    {open && <section className="block-style-library" aria-label="مكتبة أنماط الصناديق">
      <div className="block-style-actions">
        <button type="button" onClick={insertSolvedExample}>إدراج مثال محلول</button>
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
            style={{
              "--block-accent": style.attrs.accent ?? undefined,
              "--block-background": style.attrs.background ?? undefined,
              "--block-padding": style.attrs.padding != null ? `${style.attrs.padding}px` : undefined,
              "--block-radius": style.attrs.radius != null ? `${style.attrs.radius}px` : undefined
            } as CSSProperties}>
            <span className="creative-block-label">{style.name}</span>
          </span>
          <button type="button" onClick={() => insert(String(style.attrs.kind), style.attrs)}>إدراج</button>
          {selected && <button type="button" onClick={() => apply(style.attrs)}>تطبيق</button>}
          <button type="button" onClick={() => write(styles.filter(item => item.id !== style.id))}>إزالة النمط</button>
        </li>)}
      </ul>}
      <div className="block-style-grid">
        {blockTypes.map(([kind]) => <button type="button" key={kind} aria-label={`إدراج ${blockLabel(kind)}`} onClick={() => insert(kind)}>
          <span className="creative-block" data-education-block={kind}>
            <span className="creative-block-label">{blockLabel(kind)}</span>
            <span className="creative-block-content" aria-hidden="true"><i /><i /></span>
          </span>
        </button>)}
      </div>
    </section>}
  </>;
}
