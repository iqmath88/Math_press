import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { mountGraph, type GraphHandle } from "./graph";
import {
  GRAPH_COLORS, ITEM_LABELS, defaultGraphSpec, graphAspect, newItem, validateItem, validateSpec,
  type GraphItem, type GraphItemType, type GraphSpec
} from "./graphSpec";

type Props = {
  initial: GraphSpec | null;
  onSave: (spec: GraphSpec) => void;
  onClose: () => void;
};

const WIDTHS = [30, 40, 50, 60, 80, 100];
const TYPES = Object.keys(ITEM_LABELS) as GraphItemType[];

function Preview({ spec, valid }: { spec: GraphSpec; valid: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<GraphHandle | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    handle.current = mountGraph(ref.current, spec);
    return () => { handle.current?.destroy(); handle.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (valid) handle.current?.update(spec); }, [spec, valid]);
  const aspect = valid ? graphAspect(spec) : 1;
  return (
    <div className="graph-preview">
      <div ref={ref} className="graph-box" style={{ aspectRatio: String(aspect), width: "100%" }} />
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="اللون">
      {GRAPH_COLORS.map(c => (
        <button
          key={c} type="button" role="radio" aria-checked={value === c} aria-label={c}
          className={`swatch${value === c ? " on" : ""}`} style={{ background: c }} onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode; grow?: boolean }) {
  return <label className={`gfield${props.grow ? " grow" : ""}`}><span>{props.label}</span>{props.children}</label>;
}

function ItemEditor({ item, error, onChange, onDelete }: {
  item: GraphItem; error: string | null; onChange: (i: GraphItem) => void; onDelete: () => void;
}) {
  const set = (patch: Partial<GraphItem>) => onChange({ ...item, ...patch } as GraphItem);
  const ltr = { dir: "ltr" as const, spellCheck: false, autoCapitalize: "off", autoCorrect: "off" };
  return (
    <div className={`gitem${error ? " bad" : ""}`}>
      <div className="gitem-head">
        <strong>{ITEM_LABELS[item.type]}</strong>
        <ColorPicker value={item.color} onChange={color => set({ color })} />
        <button type="button" className="icon-button danger" aria-label="حذف العنصر" onClick={onDelete}><Trash2 size={16} /></button>
      </div>
      <div className="gitem-body">
        {item.type === "function" && (<>
          <Field label="الدالة (مثال: x^2-2 أو sin(x) أو sqrt(x))" grow>
            <input {...ltr} value={item.expr} onChange={e => set({ expr: e.target.value })} />
          </Field>
          <Field label="من x (اختياري)"><input {...ltr} className="num" value={item.from} onChange={e => set({ from: e.target.value })} /></Field>
          <Field label="إلى x (اختياري)"><input {...ltr} className="num" value={item.to} onChange={e => set({ to: e.target.value })} /></Field>
          <label className="check"><input type="checkbox" checked={item.dashed} onChange={e => set({ dashed: e.target.checked })} /> متقطع</label>
        </>)}
        {(item.type === "points" || item.type === "segment" || item.type === "line" || item.type === "polygon" || item.type === "angle") && (
          <Field label={
            item.type === "angle" ? "ثلاث نقاط: الطرف الأول، الرأس، الطرف الثاني"
            : item.type === "points" ? "النقاط، مثل A(1,2) B(-2,1)"
            : item.type === "polygon" ? "رءوس المضلع بالترتيب" : "نقطتان"
          } grow>
            <input {...ltr} value={item.pts} onChange={e => set({ pts: e.target.value })} />
          </Field>
        )}
        {item.type === "angle" && <Field label="نص الزاوية (مثل 45° أو θ)"><input value={item.label} onChange={e => set({ label: e.target.value })} /></Field>}
        {(item.type === "segment" || item.type === "line") && (
          <label className="check"><input type="checkbox" checked={item.dashed} onChange={e => set({ dashed: e.target.checked })} /> متقطع</label>
        )}
        {(item.type === "polygon" || item.type === "circle") && (
          <label className="check"><input type="checkbox" checked={item.fill} onChange={e => set({ fill: e.target.checked })} /> تظليل الداخل</label>
        )}
        {item.type === "circle" && (<>
          <Field label="المركز، مثل O(0,0)" grow><input {...ltr} value={item.pts} onChange={e => set({ pts: e.target.value })} /></Field>
          <Field label="نصف القطر"><input {...ltr} className="num" value={item.radius} onChange={e => set({ radius: e.target.value })} /></Field>
        </>)}
        {item.type === "text" && (<>
          <Field label="الموضع (x,y)"><input {...ltr} className="num" value={item.pts} onChange={e => set({ pts: e.target.value })} /></Field>
          <Field label="النص" grow><input value={item.text} onChange={e => set({ text: e.target.value })} /></Field>
        </>)}
      </div>
      {error && <div className="gerror" role="alert">{error}</div>}
    </div>
  );
}

export default function GraphDialog({ initial, onSave, onClose }: Props) {
  const base = useMemo(() => initial ?? defaultGraphSpec(), [initial]);
  const [items, setItems] = useState<GraphItem[]>(base.items);
  const [range, setRange] = useState({ xmin: String(base.xmin), xmax: String(base.xmax), ymin: String(base.ymin), ymax: String(base.ymax) });
  const [axes, setAxes] = useState(base.axes);
  const [grid, setGrid] = useState(base.grid);
  const [equal, setEqual] = useState(base.equal);
  const [widthPct, setWidthPct] = useState(base.widthPct);
  const [caption, setCaption] = useState(base.caption);

  const spec: GraphSpec = useMemo(() => ({
    xmin: Number(range.xmin), xmax: Number(range.xmax), ymin: Number(range.ymin), ymax: Number(range.ymax),
    axes, grid, equal, widthPct, caption, items
  }), [range, axes, grid, equal, widthPct, caption, items]);

  const specError = validateSpec(spec);
  const itemErrors = items.map(validateItem);
  const hasError = !!specError || itemErrors.some(Boolean);

  const addItem = (type: GraphItemType) => setItems(list => [...list, newItem(type, list.length)]);

  return (
    <div className="modal-backdrop no-print" onClick={onClose}>
      <div className="modal graph-modal" role="dialog" aria-modal="true" aria-label="الرسم البياني" onClick={e => e.stopPropagation()}>
        <div className="graph-modal-head">
          <strong>{initial ? "تعديل الرسم" : "رسم بياني / هندسي جديد"}</strong>
        </div>

        <div className="graph-modal-body">
          <div className="graph-side">
            <Preview spec={spec} valid={!hasError} />
            {specError && <div className="gerror" role="alert">{specError}</div>}
            <div className="grow-row">
              {(["xmin", "xmax", "ymin", "ymax"] as const).map(k => (
                <Field key={k} label={{ xmin: "x الأصغر", xmax: "x الأكبر", ymin: "y الأصغر", ymax: "y الأكبر" }[k]}>
                  <input dir="ltr" className="num" inputMode="decimal" value={range[k]} onChange={e => setRange(r => ({ ...r, [k]: e.target.value }))} />
                </Field>
              ))}
            </div>
            <div className="grow-row">
              <label className="check"><input type="checkbox" checked={axes} onChange={e => setAxes(e.target.checked)} /> المحاور</label>
              <label className="check"><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} /> الشبكة</label>
              <label className="check"><input type="checkbox" checked={equal} onChange={e => setEqual(e.target.checked)} /> قياس متساوٍ للمحورين</label>
              <Field label="عرض الرسم">
                <select value={widthPct} onChange={e => setWidthPct(Number(e.target.value))}>
                  {WIDTHS.map(w => <option key={w} value={w}>{w}%</option>)}
                </select>
              </Field>
            </div>
            <Field label="عنوان تحت الرسم (اختياري)" grow><input value={caption} onChange={e => setCaption(e.target.value)} /></Field>
          </div>

          <div className="graph-items">
            {items.length === 0 && <p className="muted">لا توجد عناصر. أضف دالة أو شكلًا من الأزرار أدناه.</p>}
            {items.map((item, i) => (
              <ItemEditor
                key={item.id} item={item} error={itemErrors[i]}
                onChange={next => setItems(list => list.map((x, j) => (j === i ? next : x)))}
                onDelete={() => setItems(list => list.filter((_, j) => j !== i))}
              />
            ))}
            <div className="add-grid">
              {TYPES.map(type => (
                <button key={type} type="button" onClick={() => addItem(type)}><Plus size={14} /> {ITEM_LABELS[type]}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="primary-action" disabled={hasError} onClick={() => onSave(spec)}>
            {initial ? "حفظ التعديل" : "إدراج الرسم"}
          </button>
          <button type="button" onClick={onClose}>إلغاء</button>
          {hasError && <span className="muted">صحّح الأخطاء الظاهرة لتفعيل الحفظ.</span>}
        </div>
      </div>
    </div>
  );
}
