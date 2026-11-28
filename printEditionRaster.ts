import html2canvas from "html2canvas";
import { PDFDocument } from "pdf-lib";
import { convertLatexToMarkup } from "mathlive";

type ExportOptions = {
  widthMm: number;
  heightMm: number;
  first: number;
  last: number;
  dpi: number;
  grayscale: boolean;
  signal: AbortSignal;
  onProgress: (done: number) => void;
};

export async function renderPrintEdition(paper: HTMLElement, options: ExportOptions) {
  const { widthMm, heightMm, first, last, dpi, grayscale, signal, onProgress } = options;
  const sheets = Array.from(paper.querySelectorAll<HTMLElement>(".print-sheet")).slice(first - 1, last);
  if (sheets.length !== last - first + 1) throw new Error("تغيّر عدد صفحات المعاينة.");
  for (const sheet of sheets) {
    if (sheet.matches(".print-sheet-overflow")) throw new Error("توجد صفحة تتجاوز المساحة الطباعية.");
    for (const image of sheet.querySelectorAll("img")) {
      if (!image.complete || !image.naturalWidth) throw new Error("تعذر تحميل صورة من المستند.");
      const { clipPath, rotate } = getComputedStyle(image);
      if (clipPath !== "none" || (rotate && rotate !== "none" && rotate !== "0deg"))
        throw new Error("التصدير النقطي التجريبي لا يدعم قص الصور أو تدويرها. استخدم طباعة المتصفح لهذا المستند.");
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
    signal.throwIfAborted();
    const wrapper = paper.cloneNode(false) as HTMLElement;
    wrapper.removeAttribute("id");
    wrapper.style.cssText += ";position:fixed;left:0;top:0;margin:0;min-height:0;zoom:1;z-index:-1;pointer-events:none";
    const pages = owner.createElement("div");
    pages.className = "mp-editor print-pages";
    const clone = sheet.cloneNode(true) as HTMLElement;
    for (const equation of clone.querySelectorAll<HTMLElement>(".math-node[data-latex]")) {
      const latex = equation.dataset.latex ?? "";
      const block = equation.classList.contains("math-block");
      const markup = convertLatexToMarkup(latex, { defaultMode: block ? "math" : "inline-math" });
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
    let canvas: HTMLCanvasElement;
    try {
      await owner.fonts.ready;
      canvas = await html2canvas(clone, {
        scale: dpi / 96,
        width: widthMm * 96 / 25.4,
        height: heightMm * 96 / 25.4,
        backgroundColor: "#ffffff",
        logging: false,
        ignoreElements: element => element.id === "root",
        onclone: async cloned => {
          cloned.head.append(cloned.importNode(stylesheet, true));
          await cloned.fonts.ready;
        },
      });
    } finally {
      wrapper.remove();
    }
    try {
      signal.throwIfAborted();
      if (grayscale) {
        const context = canvas.getContext("2d");
        if (!context) throw new Error("تعذر تجهيز التدرج الرمادي.");
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < image.data.length; i += 4) {
          const gray = Math.round(image.data[i] * .2126 + image.data[i + 1] * .7152 + image.data[i + 2] * .0722);
          image.data[i] = image.data[i + 1] = image.data[i + 2] = gray;
        }
        context.putImageData(image, 0, 0);
      }
      const payload = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("تعذر ترميز صفحة PDF.")), "image/jpeg", .95);
      });
      const image = await document.embedJpg(await payload.arrayBuffer());
      document.addPage([widthPt, heightPt]).drawImage(image, { x: 0, y: 0, width: widthPt, height: heightPt });
    } finally {
      canvas.width = canvas.height = 0;
    }
    onProgress(index + 1);
  }
  signal.throwIfAborted();
  return new Blob([new Uint8Array(await document.save())], { type: "application/pdf" });
}
