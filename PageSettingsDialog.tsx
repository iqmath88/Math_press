import {defaultFurniture,readPageFurniture} from "./pageFurniture";
import WatermarkSettings from "./WatermarkSettings";
import {readWatermark} from "./watermark";
import { useState } from "react";
import { fileToDataUrl } from "./imageUtil";
import type { MathPressDocument } from "./types";

type Props = {
  doc: MathPressDocument;
  onApply: (patch: Pick<MathPressDocument, "page" | "headerText" | "footerText" | "showPageNumbers" | "background" | "watermark" | "pageFurniture">) => void;
  onClose: () => void;
};

const MIN = 5;
const MAX = 40;

function parseMm(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= MIN && n <= MAX ? n : null;
}

export default function PageSettingsDialog({ doc, onApply, onClose }: Props) {
  const m = doc.page.marginsMm;
  const [orientation, setOrientation] = useState(doc.page.orientation);
  const [top, setTop] = useState(String(m.top));
  const [bottom, setBottom] = useState(String(m.bottom));
  const [size, setSize] = useState(doc.page.size);
  const [left, setLeft] = useState(String(m.left));
  const [right, setRight] = useState(String(m.right));
  const [header, setHeader] = useState(doc.headerText);
  const [footer, setFooter] = useState(doc.footerText);
  const [numbers, setNumbers] = useState(doc.showPageNumbers);
  const [background, setBackground] = useState<string | null>(doc.background);
  const [furniture,setFurniture]=useState(doc.pageFurniture);
  const [watermark,setWatermark] = useState(doc.watermark);
  const [bgError, setBgError] = useState("");

  const pickBackground = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setBgError("استخدم صورة PNG أو JPG."); return; }
    try { setBackground(await fileToDataUrl(file, 2000)); setBgError(""); } catch { setBgError("تعذر قراءة الصورة."); }
  };

  const t = parseMm(top), b = parseMm(bottom), l = parseMm(left), r = parseMm(right);
  const valid = t !== null && b !== null && l !== null && r !== null && (!watermark || !!readWatermark(watermark));

  const apply = () => {
    if (!valid) return;
    onApply({
      page: { size, orientation, marginsMm: { top: t, bottom: b, left: l, right: r } },
      headerText: header,
      footerText: footer,
      showPageNumbers: numbers,
      background,
      watermark:readWatermark(watermark),
      pageFurniture:readPageFurniture(furniture)
    });
  };

  const preset = (mm: number) => {
    const value = String(mm);
    setTop(value);
    setBottom(value);
    setLeft(value);
    setRight(value);
  };

  return (
    <div className="modal-backdrop no-print" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="إعدادات الصفحة" onClick={e => e.stopPropagation()}>
        <strong>إعدادات الصفحة</strong>
        <label>حجم الورق <select value={size} onChange={event=>setSize(event.target.value as typeof size)}>
          <option>A4</option><option>A5</option><option>A3</option>
        </select></label>

        <div className="setting-block">
          <span className="setting-title">الاتجاه</span>
          <div className="seg">
            <button type="button" className={orientation === "portrait" ? "on" : ""} onClick={() => setOrientation("portrait")}>عمودي</button>
            <button type="button" className={orientation === "landscape" ? "on" : ""} onClick={() => setOrientation("landscape")}>أفقي</button>
          </div>
        </div>

        <div className="setting-block">
          <span className="setting-title">الهوامش (مم)</span>
          <div className="grow-row">
            <label className="gfield"><span>أعلى</span><input dir="ltr" className="num" inputMode="decimal" value={top} onChange={e => setTop(e.target.value)} /></label>
            <label className="gfield"><span>أسفل</span><input dir="ltr" className="num" inputMode="decimal" value={bottom} onChange={e => setBottom(e.target.value)} /></label>
            <label className="gfield"><span>يمين</span><input dir="ltr" className="num" inputMode="decimal" value={right} onChange={e => setRight(e.target.value)} /></label>
            <label className="gfield"><span>يسار</span><input dir="ltr" className="num" inputMode="decimal" value={left} onChange={e => setLeft(e.target.value)} /></label>
          </div>
          <div className="grow-row">
            <button type="button" onClick={() => preset(12)}>ضيقة 12</button>
            <button type="button" onClick={() => preset(18)}>متوسطة 18</button>
            <button type="button" onClick={() => preset(25)}>واسعة 25</button>
          </div>
          {!valid && <div className="gerror" role="alert">الهوامش يجب أن تكون بين {MIN} و{MAX} مم.</div>}
        </div>

        <label className="gfield grow"><span>رأس الصفحة (اسم المدرسة، المادة، التاريخ…)</span>
          <input value={header} onChange={e => setHeader(e.target.value)} placeholder="يظهر أعلى كل صفحة" />
        </label>
        <label className="gfield grow"><span>تذييل الصفحة</span>
          <input value={footer} onChange={e => setFooter(e.target.value)} placeholder="يظهر أسفل كل صفحة" />
        </label>
        <label className="check"><input type="checkbox" checked={numbers} onChange={e => setNumbers(e.target.checked)} /> إظهار ترقيم الصفحات</label>

        <div className="setting-block">
          <span className="setting-title">خلفية الصفحة (ورق رسمي، إطار، علامة مائية)</span>
          <div className="grow-row">
            <label className="file-btn">
              {background ? "تغيير الصورة" : "اختيار صورة"}
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { void pickBackground(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {background && <button type="button" onClick={() => setBackground(null)}>إزالة الخلفية</button>}
          </div>
          {background && <img className="bg-thumb" src={background} alt="معاينة الخلفية" />}
          <p className="muted">تُمدَّد الصورة على كامل الصفحة وتتكرر في كل صفحة. يُفضَّل أن تكون بنسبة A4.</p>
          {bgError && <div className="gerror" role="alert">{bgError}</div>}
        </div>

        <details className="setting-block">
          <summary>خيارات الرأس والتذييل</summary>
          <label>النص المقابل في الرأس <input maxLength={140} value={furniture?.headerEnd ?? ""} onChange={e=>setFurniture({...defaultFurniture,...furniture,headerEnd:e.target.value})}/></label>
          <label>النص المقابل في التذييل <input maxLength={140} value={furniture?.footerEnd ?? ""} onChange={e=>setFurniture({...defaultFurniture,...furniture,footerEnd:e.target.value})}/></label>
          <label>بداية ترقيم الصفحات <input type="number" min="1" max="9999" value={furniture?.numberStart ?? 1}
            onChange={e=>{if(Number.isInteger(e.target.valueAsNumber)) setFurniture({...defaultFurniture,...furniture,numberStart:Math.max(1,Math.min(9999,e.target.valueAsNumber))});}} /></label>
          <label><input type="checkbox" checked={furniture?.arabicDigits ?? false} onChange={e=>setFurniture({...defaultFurniture,...furniture,arabicDigits:e.target.checked})}/> الأرقام ١٢٣</label>
          <label><input type="checkbox" checked={furniture?.rule ?? false} onChange={e=>setFurniture({...defaultFurniture,...furniture,rule:e.target.checked})}/> خط فاصل للرأس والتذييل</label>
          <button type="button" onClick={()=>setFurniture(undefined)}>استعادة الإعداد البسيط</button>
        </details>
        <WatermarkSettings value={watermark} onChange={setWatermark}/>

        {orientation === "landscape" && (
          <p className="muted">ملاحظة: بعض المتصفحات (خصوصًا Safari على الآيباد) قد تتجاهل الاتجاه الأفقي عند الطباعة؛ إن حدث ذلك اختر الاتجاه الأفقي من نافذة الطباعة نفسها.</p>
        )}

        <div className="modal-actions">
          <button type="button" className="primary-action" disabled={!valid} onClick={apply}>تطبيق</button>
          <button type="button" onClick={onClose}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}
