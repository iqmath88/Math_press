import { DEFAULT_PRINT_DPI, PRINT_RESOLUTIONS, canvasPixelLimit, pagePixels, printTileEdge } from "./printEditionQuality";
import type { PrintOptions } from "./PrintPreview";
import { useEffect, useRef, useState } from "react";

type Props = {
  paper: HTMLElement;
  pages: number;
  widthMm: number;
  heightMm: number;
  paperSize: string;
  options: PrintOptions;
  onOptions: (options: PrintOptions) => void;
  documentName: string;
  currentPage: number;
  hasWatermark: boolean;
  blocked: boolean;
  onClose: () => void;
};

export default function PrintEditionDialog({ paper, pages, widthMm, heightMm, paperSize, options, onOptions, documentName, currentPage, hasWatermark, blocked, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const job = useRef<AbortController>();
  const [first, setFirst] = useState(1);
  const [last, setLast] = useState(pages);
  const [dpi, setDpi] = useState(DEFAULT_PRINT_DPI);
  const [filename, setFilename] = useState(documentName || "MathPress");
  const [progress, setProgress] = useState<number>();
  const [result, setResult] = useState<{ file: File; url: string; count: number }>();
  const [error, setError] = useState("");
  const busy = progress !== undefined;
  const valid = Number.isInteger(first) && Number.isInteger(last) && first >= 1 && last >= first && last <= pages;

  const pixels = pagePixels(widthMm, heightMm, dpi);
  const edge = printTileEdge(pixels.width, pixels.height, dpi, canvasPixelLimit(navigator));
  const tiled = edge < Math.max(pixels.width, pixels.height);
  const mode = options.economical ? "economy" : options.grayscale ? "gray" : "color";

  useEffect(() => {
    dialog.current?.showModal();
    return () => job.current?.abort();
  }, []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  async function generate() {
    if (!valid || blocked || job.current) return;
    const controller = new AbortController();
    job.current = controller;
    setProgress(0);
    setError("");
    setResult(undefined);
    try {
      const { renderPrintEdition } = await import("./printEditionRaster");
      const blob = await renderPrintEdition(paper, {
        widthMm, heightMm, first, last, dpi, grayscale: !!options.grayscale, signal: controller.signal, onProgress: setProgress,
        onTimings: timings => window.dispatchEvent(new CustomEvent("mathpress-pdf-timings", { detail: timings })),
      });
      controller.signal.throwIfAborted();
      const name = filename.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\.pdf$/i, "") || "MathPress";
      const file = new File([blob], name + ".pdf", { type: blob.type });
      setResult({ file, url: URL.createObjectURL(file), count: last - first + 1 });
    } catch (cause) {
      setError(controller.signal.aborted ? "أُلغي التصدير." : cause instanceof Error ? cause.message : "تعذر إنشاء PDF.");
    } finally {
      job.current = undefined;
      setProgress(undefined);
    }
  }

  return <dialog ref={dialog} className="build-information print-edition-dialog no-print"
    aria-labelledby="print-edition-title" onClose={onClose}>
    <h2 id="print-edition-title">تصدير PDF نقطي تجريبي</h2>
    <p>{pages} صفحة {paperSize} · {widthMm > heightMm ? "أفقي" : "عمودي"} · {widthMm} × {heightMm} مم</p>
    <p>تتحول الصفحات إلى صور داخل PDF. البحث ونسخ النص غير متاحين. قد تختلف بعض التأثيرات البصرية.</p>
    {blocked && <p role="alert">عالج تحذيرات المعاينة قبل التصدير.</p>}
    <div className="grow-row">
      <label>اسم الملف <input value={filename} onChange={e => setFilename(e.target.value)} disabled={busy} /></label>
      <label>من <input type="number" min={1} max={pages} value={first} onChange={e => setFirst(+e.target.value)} disabled={busy} /></label>
      <label>إلى <input type="number" min={first} max={pages} value={last} onChange={e => setLast(+e.target.value)} disabled={busy} /></label>
      <label>الدقة <select value={dpi} onChange={e => setDpi(+e.target.value)} disabled={busy}>
        {PRINT_RESOLUTIONS.map(value => <option key={value} value={value}>{value} DPI</option>)}
      </select></label>
    </div>
    <div className="grow-row">
      <button type="button" disabled={busy} onClick={() => { setFirst(1); setLast(pages); }}>كل الصفحات</button>
      <button type="button" disabled={busy} onClick={() => { setFirst(currentPage); setLast(currentPage); }}>الصفحة الحالية</button>
      <label>مظهر <select value={mode} disabled={busy} onChange={e => {
        onOptions({ ...options, economical: e.target.value === "economy", grayscale: e.target.value === "gray" });
      }}><option value="color">ملون</option><option value="gray">رمادي</option><option value="economy">حبر اقتصادي</option></select></label>
      <label><input type="checkbox" checked={options.furniture !== false} disabled={busy}
        onChange={e => onOptions({ ...options, furniture: e.target.checked })} /> الرأس والتذييل</label>
      <label><input type="checkbox" checked={options.numbers} disabled={busy}
        onChange={e => onOptions({ ...options, numbers: e.target.checked })} /> ترقيم الصفحات</label>
      {hasWatermark && <label><input type="checkbox" checked={options.watermark !== false && !options.economical}
        disabled={busy || options.economical} onChange={e => onOptions({ ...options, watermark: e.target.checked })} /> العلامة المائية</label>}
    </div>
    <p><bdi>{pixels.width} × {pixels.height}</bdi> بكسل لكل صفحة
      {" · "}{(Math.min(pixels.width, edge + 16) * Math.min(pixels.height, edge + 16) * 4 / 1048576).toFixed(1)} ميبيبايت لمخزن الرسم {tiled ? "المجزّأ" : "للصفحة"}</p>
    {result && <p>حجم الملف الناتج: {(result.file.size / 1024).toFixed(0)} كيلوبايت</p>}
    {busy && <div aria-live="polite">
      <progress max={last - first + 1} value={progress} aria-label="تقدم التصدير" />
      <p>{progress === 0 ? "جارٍ تجهيز التصدير…" : progress === last - first + 1
        ? "جارٍ إنهاء ملف PDF…" : `جارٍ تصدير الصفحة ${first + Math.floor(progress ?? 0)} من ${last}…`}</p>
    </div>}
    {error && <p role="alert">{error}</p>}
    <div className="grow-row">
      <button type="button" onClick={() => void generate()} disabled={busy || !valid || blocked}>إنشاء PDF</button>
      {busy && <button type="button" onClick={() => job.current?.abort()}>إلغاء التصدير</button>}
      {result && <>
        <a href={result.url} download={result.file.name}>تنزيل PDF</a>
        <a href={result.url} target="_blank" rel="noopener">فتح PDF للطباعة</a>
        {navigator.canShare?.({ files: [result.file] }) && <button type="button" onClick={() => {
          void navigator.share({ files: [result.file] }).catch(cause => {
            if (!(cause instanceof DOMException && cause.name === "AbortError")) setError("تعذرت المشاركة. يمكنك تنزيل الملف.");
          });
        }}>مشاركة الملف</button>}
      </>}
      <form method="dialog"><button type="submit">إغلاق</button></form>
    </div>
    {result && <iframe title={`معاينة PDF الناتج · ${result.count} صفحة`} src={result.url} />}
  </dialog>;
}
