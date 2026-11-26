import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/core";
import { paginateForPrint } from "./PrintPagination";
import { loadJXG } from "./graph";

export type PrintOptions = { backgrounds: boolean; numbers: boolean; economical: boolean };

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
  return issues;
}

type Props = {
  paper: RefObject<HTMLElement>;
  editor: Editor;
  options: PrintOptions;
  onChange: (options: PrintOptions) => void;
  usableHeightMm: number;
  onClose: () => void;
  onPrint: () => void;
};

export default function PrintPreview({ paper, editor, options, onChange, usableHeightMm, onClose, onPrint }: Props) {
  const [pages, setPages] = useState(1);
  const [issues, setIssues] = useState<string[]>([]);
  const [layoutPending, setLayoutPending] = useState(true);
  useEffect(() => {
    let active = true;
    const prepare = async () => {
      setLayoutPending(true);
      const element = paper.current;
      if (!element) return;
      const images = [...element.querySelectorAll("img")];
      const graph = element.querySelector(".graph-node");
      const results = await Promise.allSettled([
        document.fonts.ready,
        ...(graph ? [loadJXG()] : []),
        ...images.map(image => image.decode())
      ]);
      if (!active || editor.isDestroyed) return;
      await nextFrame();
      await nextFrame();
      if (!active) return;
      const source = editor.view.dom;
      const target = element.querySelector<HTMLElement>(".print-pages");
      if (!target) return;
      const { headerText } = editor.storage.pagination.layout;
      const result = paginateForPrint(source, target, {
        headerText, footerText: editor.storage.pagination.footerText
      });
      setPages(result.pages);
      const warnings = findPrintIssues(element, usableHeightMm);
      if (result.overflow) warnings.push("توجد كتلة يتعذر تقسيمها ضمن مساحة صفحة واحدة.");
      if (results.some(result => result.status === "rejected")) warnings.push("تعذر تحميل بعض موارد الطباعة.");
      if (document.fonts.status !== "loaded") warnings.push("تحميل الخطوط مستمر.");
      if (graph && [...element.querySelectorAll(".graph-node .graph-box")].some(box => !box.querySelector("svg")))
        warnings.push("لم يكتمل عرض بعض الرسوم.");
      setIssues(warnings);
      setLayoutPending(false);
    };
    void prepare();
    return () => { active = false; };
  }, [editor, paper, usableHeightMm]);

  useLayoutEffect(() => {
    if (layoutPending) return;
    paper.current?.querySelectorAll(".print-pages .pg-footer-num").forEach((num, index) => {
      num.textContent = options.numbers ? `صفحة ${index + 1} من ${pages}` : "";
    });
  }, [layoutPending, options.numbers, pages, paper]);

  return (
    <section className="print-preview-tools no-print" aria-label="معاينة الطباعة">
      <div className="grow-row">
        <strong>معاينة الطباعة</strong>
        <span aria-live="polite">{layoutPending ? "جارٍ تجهيز الصفحات…" : `${pages} صفحة A4`}</span>
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
        <span className="muted">اختر نطاق الصفحات من نافذة الطباعة.</span>
      </div>
      {issues.length > 0 && <ul className="print-issues" aria-live="polite">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
    </section>
  );
}
