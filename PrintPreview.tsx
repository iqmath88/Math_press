import PrintEditionDialog from "./PrintEditionDialog";
import {pageNumber} from "./pageFurniture";
import type { Watermark } from "./watermark";
import { pendingStudioImages, studioPrintSources } from "./StudioImage";
import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/core";
import { paginateForPrint } from "./PrintPagination";
import { loadJXG } from "./graph";

export type PrintOptions = { backgrounds: boolean; numbers: boolean; economical: boolean; grayscale?: boolean; watermark?: boolean; furniture?: boolean };

function nextFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

export function findPrintIssues(paper: HTMLElement, usableHeightMm: number): string[] {
  const issues: string[] = [];
  const editor = paper.querySelector<HTMLElement>(".print-pages");
  if (!editor) return issues;
  const box = editor.getBoundingClientRect();
  const css = getComputedStyle(editor.querySelector(".print-sheet-content") ?? editor);
  const left = box.left + parseFloat(css.paddingLeft);
  const right = box.right - parseFloat(css.paddingRight);
  const maxHeight = usableHeightMm * 96 / 25.4;
  const tooWide = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return rect.left < left - 2 || rect.right > right + 2 || element.scrollWidth > element.clientWidth + 2;
  };
  if ([...editor.querySelectorAll("table")].some(tooWide)) issues.push("قد يتجاوز جدول عرض مساحة الطباعة.");
  if ([...editor.querySelectorAll("math-field")].some(tooWide)) issues.push("قد تتجاوز معادلة طويلة هامش الطباعة.");
  if ([...editor.querySelectorAll("img")].some(img => tooWide(img) || img.getBoundingClientRect().height > maxHeight))
    issues.push("تتجاوز صورة مساحة الطباعة المتاحة.");
  if ([...editor.querySelectorAll<HTMLElement>(".paper-header,.pg-footer")].some(zone =>
    zone.scrollHeight > zone.clientHeight+1 || zone.scrollWidth > zone.clientWidth+1))
    issues.push("يتجاوز محتوى الرأس أو التذييل المساحة المخصصة. زد الهامش أو اختصر النص.");
  return issues;
}

type Props = {
  paper: RefObject<HTMLElement>;
  editor: Editor;
  options: PrintOptions;
  onChange: (options: PrintOptions) => void;
  watermark?: Watermark;
  paperSize?: string;
  documentName: string;
  paperGeometry: { width: number; height: number; top: number; right: number; bottom: number; left: number };
  onClose: () => void;
  onPrint: () => void;
  selectedBlock?: Element | null;
  selectedOffset?: number;
};

export default function PrintPreview({ paper, editor, options, onChange, watermark, paperSize = "A4", documentName, paperGeometry, onClose, onPrint, selectedBlock, selectedOffset }: Props) {
  const { width, height, top, right, bottom, left } = paperGeometry;
  const usableHeightMm = height - top - bottom;
  const [exportOpen, setExportOpen] = useState(false);
  const [pages, setPages] = useState(1);
  const [issues, setIssues] = useState<string[]>([]);
  const [layoutPending, setLayoutPending] = useState(true);
  const printWatermark = options.watermark === false || options.economical ? undefined : watermark;
  useEffect(() => {
    let active = true;
    const prepare = async () => {
      setLayoutPending(true);
      const element = paper.current;
      if (!element) return;
      const source = editor.view.dom;
      const images = [...source.querySelectorAll("img")].filter(image =>
        !image.closest(".no-print, .graph-box, .ProseMirror-separator, math-field"));
      const graph = source.querySelector(".graph-node");
      const [, ...resourceResults] = await Promise.allSettled([
        document.fonts.ready,
        ...(printWatermark?.kind==="image" ? [(() => {
          const image=new Image();
          image.src=printWatermark.value;
          return image.decode();
        })()] : []),
        ...(graph ? [loadJXG()] : []),
        ...images.map(async image => {
          await pendingStudioImages.get(image);
          const original = studioPrintSources.get(image);
          if (original) {
            const full = new Image();
            full.src = original;
            await full.decode();
          } else await image.decode();
        })
      ]);
      if (!active || editor.isDestroyed) return;
      await nextFrame();
      await nextFrame();
      if (!active) return;
      const target = element.querySelector<HTMLElement>(".print-pages");
      if (!target) return;
      const { headerText } = editor.storage.pagination.layout;
      const result = paginateForPrint(source, target, {
        headerText, footerText: editor.storage.pagination.footerText, selectedBlock, selectedOffset, watermark:printWatermark, hideFurniture:options.furniture===false, furniture:editor.storage.pagination.layout.furniture
      });
      // Safari can defer decoding the actual print nodes even when the source
      // thumbnail and the separate original-image probe are already decoded.
      const printedImages = await Promise.allSettled([...target.querySelectorAll("img")].map(image => image.decode()));
      if (!active) return;
      setPages(result.pages);
      const warnings = findPrintIssues(element, usableHeightMm);
      if (result.overflow) warnings.push("توجد كتلة يتعذر تقسيمها ضمن مساحة صفحة واحدة.");
      if (resourceResults.some(result => result.status === "rejected")) warnings.push("تعذر تحميل بعض موارد الطباعة.");
      if ([...document.fonts].some(font => font.status === "error")) warnings.push("تعذر تحميل بعض خطوط الطباعة.");
      else if (document.fonts.status !== "loaded") warnings.push("تحميل الخطوط مستمر.");
      if (graph && [...element.querySelectorAll(".graph-node .graph-box")].some(box => !box.querySelector("svg")))
        warnings.push("لم يكتمل عرض بعض الرسوم.");
      if (printedImages.some(result => result.status === "rejected"))
        warnings.push("تعذر تجهيز صورة داخل صفحات الطباعة.");
      setIssues(warnings);
      setLayoutPending(false);
      if (selectedBlock) target.querySelector("[data-studio-print-anchor]")?.closest(".print-sheet")?.scrollIntoView({ block: "nearest" });
    };
    void prepare();
    return () => { active = false; };
  }, [editor, paper, usableHeightMm, selectedBlock, selectedOffset, printWatermark, options.furniture]);

  useLayoutEffect(() => {
    if (layoutPending) return;
    paper.current?.querySelectorAll(".print-pages .pg-footer-num").forEach((num, index) => {
      num.textContent = options.numbers ? pageNumber(index+1,pages,editor.storage.pagination.layout.furniture) : "";
    });
  }, [layoutPending, options.numbers, pages, paper, editor]);

  return (
    <section className="print-preview-tools no-print" aria-label="معاينة الطباعة">
      <div className="grow-row">
        <strong>معاينة الطباعة</strong>
        <span aria-live="polite">{layoutPending ? "جارٍ تجهيز الصفحات…" : `${pages} صفحة ${paperSize}`}</span>
        <button type="button" disabled={layoutPending} onClick={() => setExportOpen(true)}>تصدير PDF تجريبي</button>
        <button type="button" className="primary-action" disabled={layoutPending} onClick={onPrint}>طباعة / PDF</button>
        <button type="button" onClick={onClose}>العودة للتحرير</button>
      </div>
      <div className="grow-row">
        <label className="check"><input type="checkbox" checked={options.backgrounds}
          onChange={e => onChange({ ...options, backgrounds: e.target.checked })} /> خلفية الورق</label>
        <label className="check"><input type="checkbox" checked={options.numbers}
          onChange={e => onChange({ ...options, numbers: e.target.checked })} /> ترقيم الصفحات</label>
        <label className="check"><input type="checkbox" checked={options.economical}
          onChange={e => onChange({ ...options, economical: e.target.checked })} /> حبر اقتصادي</label>
        <label className="check"><input type="checkbox" checked={options.grayscale ?? false}
          onChange={e=>onChange({...options,grayscale:e.target.checked})}/> تدرج رمادي</label>
        <label className="check"><input type="checkbox" checked={options.furniture !== false}
          onChange={e=>onChange({...options,furniture:e.target.checked})}/> الرأس والتذييل</label>
        {watermark && !options.economical && <label className="check"><input type="checkbox" checked={options.watermark !== false}
          onChange={e=>onChange({...options,watermark:e.target.checked})}/> العلامة المائية</label>}
        <span className="muted">عطّل رؤوس المتصفح وتذييلاته من نافذة الطباعة إذا ظهرت خياراتها.</span>
        <span className="muted">اختر نطاق الصفحات من نافذة الطباعة.</span>
      </div>
      <details className="print-diagnostics">
        <summary>تشخيص الطباعة</summary>
        <dl>
          <dt>الإصدار والبناء</dt><dd><bdi>{import.meta.env.VITE_APP_VERSION} · {import.meta.env.VITE_APP_BUILD}</bdi></dd>
          <dt>أبعاد الورقة</dt><dd><bdi>{width} × {height}</bdi> مم</dd>
          <dt>الهوامش</dt><dd>أعلى {top}، يمين {right}، أسفل {bottom}، يسار {left} مم</dd>
          <dt>ارتفاع المتن المتاح</dt><dd>{usableHeightMm} مم</dd>
          <dt>مساحة الرأس والتذييل</dt><dd>{top} مم للرأس · {bottom} مم للتذييل</dd>
          <dt>الصفحات المحسوبة</dt><dd>{layoutPending ? "جارٍ الحساب…" : pages}</dd>
          <dt>تحذيرات المعاينة</dt><dd>{layoutPending ? "جارٍ الفحص…" : issues.length}</dd>
        </dl>
      </details>
      {exportOpen && paper.current && <PrintEditionDialog paper={paper.current} pages={pages}
        widthMm={width} heightMm={height} paperSize={paperSize} documentName={documentName}
        options={options} onOptions={onChange} hasWatermark={!!watermark}
        currentPage={Math.max(1, [...paper.current.querySelectorAll(".print-sheet")].findIndex(sheet =>
          sheet.querySelector("[data-studio-print-anchor]")) + 1)}
        blocked={layoutPending || issues.length > 0} onClose={() => setExportOpen(false)} />}
      {issues.length > 0 && <ul className="print-issues" aria-live="polite">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
    </section>
  );
}
