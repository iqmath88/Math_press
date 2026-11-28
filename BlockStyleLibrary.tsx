import { useState } from "react";
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

export default function BlockStyleLibrary({ selected, insert, apply, notice }: {
  selected?: Record<string, unknown>;
  insert: (kind: string, attrs?: Record<string, unknown>) => void;
  apply: (attrs: Record<string, unknown>) => void;
  notice: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [styles, setStyles] = useState(readStyles);
  function write(next: Style[]) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setStyles(next);
    } catch { notice("تعذّر حفظ مكتبة الأنماط على هذا الجهاز."); }
  }
  return <>
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>مكتبة أنماط الصناديق</button>
    {open && <section className="block-style-library" aria-label="مكتبة أنماط الصناديق">
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
          <span>{style.name}</span>
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
