import html2canvas from "html2canvas";
import type { PDFImage } from "pdf-lib";
import { PDFDocument, clip, endPath, popGraphicsState, pushGraphicsState, rectangle } from "pdf-lib";
import { convertLatexToMarkup } from "mathlive";
import { canvasPixelLimit, pagePixels, PRINT_RESOLUTIONS, printTileEdge, printTiles } from "./printEditionQuality";

function encodeCanvas(canvas: HTMLCanvasElement, mime: "image/png" | "image/jpeg", quality?: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error("تعذر ترميز صورة في PDF.")), mime, quality,
  ));
}

async function prepareImage(source: HTMLImageElement, clone: HTMLImageElement, scale: number, limit: number) {
  const css = getComputedStyle(source);
  const { clipPath, rotate } = css;
  if (rotate && rotate !== "none" && rotate !== "0deg") {
    if (!/^[-+]?\d+(?:\.\d+)?deg$/.test(rotate)) throw new Error("تعذر تمثيل دوران الصورة.");
    clone.style.rotate = "none";
    clone.style.transform = `rotate(${rotate})${css.transform === "none" ? "" : " " + css.transform}`;
  }
  if (clipPath === "none") return;
  // StudioImage writes a four-sided percentage inset on the image border box.
  const edges = clipPath.match(/^inset\(([^)]+)\)$/)?.[1].trim().split(/\s+/);
  if (!edges || edges.length > 4 || edges.some(edge => !/^(?:\d+(?:\.\d+)?%|0(?:px)?)$/.test(edge)))
    throw new Error("تعذر تمثيل نمط قص الصورة.");
  const [top, right = top, bottom = top, left = right] = edges.map(edge => parseFloat(edge) / 100);
  const width = source.offsetWidth;
  const height = source.offsetHeight;
  if (Math.round(width * scale) * Math.round(height * scale) > limit)
    throw new Error("الصورة المقصوصة تتجاوز ميزانية تجهيز الصور على هذا الجهاز. اختر دقة أقل.");
  const canvas = source.ownerDocument.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  try {
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) throw new Error("تعذر تجهيز الصورة المقصوصة.");
    context.scale(canvas.width / width, canvas.height / height);
    context.beginPath();
    context.rect(left * width, top * height, (1 - left - right) * width, (1 - top - bottom) * height);
    context.clip();
    const borders = [css.borderTopWidth, css.borderRightWidth, css.borderBottomWidth, css.borderLeftWidth].map(parseFloat);
    const [bt, br, bb, bl] = borders;
    context.fillStyle = css.borderTopColor;
    context.fillRect(0, 0, width, bt);
    context.fillStyle = css.borderRightColor;
    context.fillRect(width - br, 0, br, height);
    context.fillStyle = css.borderBottomColor;
    context.fillRect(0, height - bb, width, bb);
    context.fillStyle = css.borderLeftColor;
    context.fillRect(0, 0, bl, height);
    context.drawImage(source, bl, bt, width - bl - br, height - bt - bb);
    clone.removeAttribute("srcset");
    const url = URL.createObjectURL(await encodeCanvas(canvas, "image/png"));
    clone.src = url;
    clone.style.clipPath = "none";
    clone.style.border = "0";
    clone.style.width = width + "px";
    clone.style.height = height + "px";
    clone.style.maxWidth = "none";
    return url;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

type ExportOptions = {
  widthMm: number;
  heightMm: number;
  first: number;
  last: number;
  dpi: number;
  grayscale: boolean;
  signal: AbortSignal;
  onProgress: (done: number) => void;
  onTimings?: (timings: { prepareMs: number; paintMs: number; encodeMs: number; serializeMs: number }) => void;
};

export async function renderPrintEdition(paper: HTMLElement, options: ExportOptions) {
  const { widthMm, heightMm, first, last, dpi, grayscale, signal, onProgress } = options;
  const pixels = pagePixels(widthMm, heightMm, dpi);
  if (!PRINT_RESOLUTIONS.includes(dpi)) throw new Error("دقة التصدير غير صالحة.");
  const pixelLimit = canvasPixelLimit(navigator);
  const edge = printTileEdge(pixels.width, pixels.height, dpi, pixelLimit);
  const tiles = [...printTiles(pixels.width, pixels.height, edge)];
  const scale = dpi / 96;
  const pxToX = widthMm * 72 / (25.4 * pixels.width);
  const pxToY = heightMm * 72 / (25.4 * pixels.height);
  let compressedBytes = 0;
  const embeddedImages = new Map<string, PDFImage>();
  const equations = new Map<string, string>();
  const timings = { prepareMs: 0, paintMs: 0, encodeMs: 0, serializeMs: 0 };
  const sheets = Array.from(paper.querySelectorAll<HTMLElement>(".print-sheet")).slice(first - 1, last);
  if (sheets.length !== last - first + 1) throw new Error("تغيّر عدد صفحات المعاينة.");
  for (const sheet of sheets) {
    if (sheet.matches(".print-sheet-overflow")) throw new Error("توجد صفحة تتجاوز المساحة الطباعية.");
    for (const image of sheet.querySelectorAll("img")) {
      if (!image.complete || !image.naturalWidth) throw new Error("تعذر تحميل صورة من المستند.");

    }
  }
  const document = await PDFDocument.create();
  document.setProducer("MathPress Print Edition (raster preview)");
  const widthPt = widthMm * 72 / 25.4;
  const heightPt = heightMm * 72 / 25.4;
  const owner = paper.ownerDocument;
  const stylesheet = owner.createElement("style");
  stylesheet.textContent = [...owner.styleSheets].flatMap(sheet => {
    try {
      return [...sheet.cssRules].map(rule => rule.cssText.replace(
        /url\(("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)]*)\)/g, (match, raw: string) => {
          const value = raw.trim().replace(/^["']|["']$/g, "");
          if (!value || value.startsWith("#") || value.startsWith("data:")) return match;
          return `url(${JSON.stringify(new URL(value, sheet.href ?? owner.baseURI).href)})`;
        }));
    } catch {
      throw new Error("تعذر قراءة أنماط المستند اللازمة لتصدير PDF.");
    }
  }).join("\n");
  for (const [index, sheet] of sheets.entries()) {
    const prepareStart = performance.now();
    signal.throwIfAborted();
    const wrapper = paper.cloneNode(false) as HTMLElement;
    wrapper.removeAttribute("id");
    wrapper.style.cssText += ";position:fixed;left:0;top:0;margin:0;min-height:0;zoom:1;z-index:-1;pointer-events:none";
    const pages = owner.createElement("div");
    pages.className = "mp-editor print-pages";
    const clone = sheet.cloneNode(true) as HTMLElement;
    const sourceImages = [...sheet.querySelectorAll("img")];
    const objectUrls: string[] = [];
    const canvas = owner.createElement("canvas");
    const page = document.addPage([widthPt, heightPt]);
    try {
      for (const [i, image] of [...clone.querySelectorAll("img")].entries()) {
        signal.throwIfAborted();
        const url = await prepareImage(sourceImages[i], image, scale, Math.min(pixelLimit, 9_000_000));
        if (url) objectUrls.push(url);
      }
      for (const equation of clone.querySelectorAll<HTMLElement>(".math-node[data-latex]")) {
        const latex = equation.dataset.latex ?? "";
        const block = equation.classList.contains("math-block");
        const key = (block ? "display:" : "inline:") + latex;
        let markup = equations.get(key);
        if (markup === undefined) {
          markup = convertLatexToMarkup(latex, { defaultMode: block ? "math" : "inline-math" });
          // Bound both the number of strings and the cost of unusually large equations.
          if (equations.size < 128 && markup.length < 16_384) equations.set(key, markup);
        }
        if (markup.includes("ML__error")) throw new Error("تعذر رسم معادلة في صفحة " + (first + index));
        const replacement = owner.createElement("span");
        replacement.className = "math-visual";
        replacement.dir = "ltr";
        replacement.innerHTML = markup;
        equation.replaceChildren(replacement);
      }
      pages.append(clone);
      wrapper.append(pages);
      owner.body.append(wrapper);
      await owner.fonts.ready;
      await Promise.all([...clone.querySelectorAll("img")].map(image => image.decode()));
      timings.prepareMs += performance.now() - prepareStart;
      for (const [tileIndex, tile] of tiles.entries()) {
        signal.throwIfAborted();
        canvas.width = tile.width;
        canvas.height = tile.height;
        const paintStart = performance.now();
        await html2canvas(clone, {
          canvas, scale,
          x: tile.x / scale, y: tile.y / scale,
          width: tile.width / scale, height: tile.height / scale,
          backgroundColor: "#ffffff",
          logging: false,
          ignoreElements: element => element.id === "root" ||
            (element.tagName === "LINK" && element.getAttribute("rel") === "stylesheet"),
          onclone: async cloned => {
            cloned.head.append(cloned.importNode(stylesheet, true));
            await cloned.fonts.ready;
          },
        });
        signal.throwIfAborted();
        timings.paintMs += performance.now() - paintStart;
        const encodeStart = performance.now();
        if (grayscale) {
          const context = canvas.getContext("2d");
          if (!context) throw new Error("تعذر تجهيز التدرج الرمادي.");
          // Read a bounded row band to avoid allocating a second page-size buffer.
          for (let top = 0; top < canvas.height; top += 128) {
            signal.throwIfAborted();
            const band = context.getImageData(0, top, canvas.width, Math.min(128, canvas.height - top));
            for (let i = 0; i < band.data.length; i += 4) {
              const gray = Math.round(band.data[i] * .2126 + band.data[i + 1] * .7152 + band.data[i + 2] * .0722);
              band.data[i] = band.data[i + 1] = band.data[i + 2] = gray;
            }
            context.putImageData(band, 0, top);
          }
        }
        const payload = await encodeCanvas(canvas, "image/jpeg", .95);
        const bytes = await payload.arrayBuffer();
        signal.throwIfAborted();
        const digest = globalThis.crypto?.subtle
          ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("")
          : undefined;
        let image = digest ? embeddedImages.get(digest) : undefined;
        if (!image) {
          compressedBytes += bytes.byteLength;
          if (compressedBytes > 96 * 1024 * 1024)
            throw new Error("تجاوزت الصفحات ميزانية PDF. صدّر نطاقاً أقصر أو اختر دقة أقل.");
          image = await document.embedJpg(bytes);
          if (digest) embeddedImages.set(digest, image);
        }
        if (tiles.length > 1) {
          // Overdraw shared opaque pixels inside the bleed to avoid PDF-viewer
          // antialiasing seams along adjacent clipping rectangles.
          const left = Math.max(tile.x, tile.left - 3);
          const right = Math.min(tile.x + tile.width, tile.right + 3);
          const top = Math.max(tile.y, tile.top - 3);
          const bottom = Math.min(tile.y + tile.height, tile.bottom + 3);
          page.pushOperators(pushGraphicsState(), rectangle(
            left * pxToX, heightPt - bottom * pxToY,
            (right - left) * pxToX, (bottom - top) * pxToY,
          ), clip(), endPath());
        }
        page.drawImage(image, {
          x: tile.x * pxToX, y: heightPt - (tile.y + tile.height) * pxToY,
          width: tile.width * pxToX, height: tile.height * pxToY,
        });
        if (tiles.length > 1) page.pushOperators(popGraphicsState());
        canvas.width = canvas.height = 0;
        timings.encodeMs += performance.now() - encodeStart;
        onProgress(index + (tileIndex + 1) / tiles.length);
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    } finally {
      canvas.width = canvas.height = 0;
      wrapper.remove();
      for (const url of objectUrls) URL.revokeObjectURL(url);
    }
  }
  signal.throwIfAborted();
  const serializeStart = performance.now();
  const data = await document.save();
  signal.throwIfAborted();
  timings.serializeMs = performance.now() - serializeStart;
  options.onTimings?.(timings);
  return new Blob([new Uint8Array(data)], { type: "application/pdf" });
}
