import { useState } from "react";
import { fileToDataUrl } from "./imageUtil";
import type { MathPressDocument } from "./types";

type Props = {
  doc: MathPressDocument;
  onApply: (patch: Pick<MathPressDocument, "page" | "headerText" | "footerText" | "showPageNumbers" | "background">) => void;
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
  const [side, setSide] = useState(String(m.left));
  const [header, setHeader] = useState(doc.headerText);
  const [footer, setFooter] = useState(doc.footerText);
  const [numbers, setNumbers] = useState(doc.showPageNumbers);
  const [background, setBackground] = useState<string | null>(doc.background);
  const [bgError, setBgError] = useState("");

  const pickBackground = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setBgError("استخدم صورة PNG أو JPG."); return; }
    try { setBackground(await fileToDataUrl(file, 2000)); setBgError(""); } catch { setBgError("تعذر قراءة الصورة."); }
  };

  const t = parseMm(top), b = parseMm(bottom), s = parseMm(side);
  const valid = t !== null && b !== null && s !== null;

  const apply = () => {
    if (!valid) return;
    onApply({
      page: { size: "A4", orientation, marginsMm: { top: t, bottom: b, left: s, right: s } },
      headerText: header,
      footerText: footer,
      showPageNumbers: numbers,
      background
    });
  };

  const preset = (mm: number) => { setTop(String(mm)); setBottom(String(mm)); setSide(String(mm)); };

  return (
    <div className="modal-backdrop no-print" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="إعدادات الصفحة" onClick={e => e.stopPropagation()}>
        <strong>إعدادات الصفحة (A4)</strong>

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
            <label className="gfield"><span>الجانبان</span><input dir="ltr" className="num" inputMode="decimal" value={side} onChange={e => setSide(e.target.value)} /></label>
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
