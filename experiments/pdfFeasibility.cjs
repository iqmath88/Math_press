// Isolated Node probe. Install the engines in a temporary directory and set NODE_PATH.
const fs = require("node:fs");
const path = require("node:path");
const { finished } = require("node:stream/promises");
const { execFileSync } = require("node:child_process");
const PDFKit = require("pdfkit");
const pdfmake = require("pdfmake");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const bidi = require("bidi-js")();
const addSVG = require("svg-to-pdfkit");

const output = process.argv[2];
const fontPath = process.argv[3];
if (!output || !fontPath) throw new Error("Usage: node pdfFeasibility.cjs OUTPUT_DIRECTORY FONT.ttf");
const font = fs.readFileSync(fontPath);
const mixed = "إِنَّ الدَّالَّةَ f(x) = 12، والقيمة ٣٫٥.";
const arabic = "هذه جملة عربية سهلة";
const fixture = [
  ["الدائرة", "x² + y² = 4", "M95 50 a45 45 0 1 0 -90 0 a45 45 0 1 0 90 0"],
  ["القطع المكافئ", "x² = 4y", "M5 5 Q50 175 95 5"],
  ["القطع الناقص", "x²/9 + y²/4 = 1", "M95 50 a45 30 0 1 0 -90 0 a45 30 0 1 0 90 0"],
  ["القطع الزائد", "y² − x² = 1", "M5 5 Q50 75 95 5 M5 95 Q50 25 95 95"],
];
const svg = data => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="${data}" stroke="#245989" stroke-width="2" fill="none"/></svg>`;

// This fixture contains BMP scalars only. Reorder runs, never Arabic characters.
function bidiRuns(line) {
  const levels = bidi.getEmbeddingLevels(line, "rtl");
  const runs = [];
  for (const index of bidi.getReorderedIndices(line, levels)) {
    const level = levels.levels[index];
    const last = runs.at(-1);
    if (last?.level === level && index === last.previous + (level % 2 ? -1 : 1)) {
      last.start = Math.min(last.start, index);
      last.end = Math.max(last.end, index);
      last.previous = index;
    } else runs.push({ level, start: index, end: index, previous: index });
  }
  return runs.map(run => line.slice(run.start, run.end + 1));
}

function pdfkit(file, mode = "direct") {
  const doc = new PDFKit({ size: "A4", margin: 48 });
  const stream = doc.pipe(fs.createWriteStream(file));
  doc.font(font).fontSize(15);
  fixture.forEach(([title, equation, plot], i) => {
    if (i) doc.addPage();
    for (const line of [title, arabic, mixed]) {
      if (mode === "actualtext") doc.markContent("Span", { actual: line });
      if (mode === "bidi-runs") {
        const y = doc.y;
        const runs = bidiRuns(line).map(text => ({ text, width: doc.widthOfString(text) }));
        let x = doc.page.width - 48 - runs.reduce((sum, run) => sum + run.width, 0);
        for (const run of runs) {
          doc.text(run.text, x, y, { lineBreak: false });
          x += run.width;
        }
        doc.y = y + doc.currentLineHeight(true);
      } else doc.text(line, { align: "right" });
      if (mode === "actualtext") doc.endMarkedContent();
    }
    doc.text(equation, 48, 160);
    doc.rect(48, 194, 90, 28).stroke().rect(138, 194, 90, 28).stroke();
    doc.text("س", 58, 201).text("12", 148, 201);
    addSVG(doc, svg(plot), 48, 235);
    doc.text(`${i + 1} / 4`, 48, 775, { lineBreak: false });
  });
  doc.end();
  return finished(stream);
}

async function pdflib(file) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const type = await doc.embedFont(font);
  fixture.forEach(([title, equation, plot], i) => {
    const page = doc.addPage([595.28, 841.89]);
    const right = (line, y) => page.drawText(line, { x: 547 - type.widthOfTextAtSize(line, 15), y, font: type, size: 15 });
    right(title, 775); right(arabic, 750); right(mixed, 725);
    page.drawText(equation, { x: 48, y: 680, font: type, size: 15 });
    for (const [column, cell] of ["س", "12"].entries()) {
      const x = 48 + 90 * column;
      page.drawRectangle({ x, y: 620, width: 90, height: 28, borderWidth: 1 });
      page.drawText(cell, { x: x + 10, y: 628, font: type, size: 15 });
    }
    page.drawSvgPath(plot, { x: 48, y: 600, borderColor: rgb(.14,.35,.54), borderWidth: 2 });
    page.drawText(`${i + 1} / 4`, { x: 48, y: 52, font: type, size: 15 });
  });
  fs.writeFileSync(file, await doc.save());
}

async function make(file) {
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy(file => path.resolve(file) === path.resolve(fontPath));
  pdfmake.setFonts({ Arabic: { normal: fontPath } });
  const content = fixture.flatMap(([title, equation, plot], i) => [
    { text: title, pageBreak: i ? "before" : undefined, alignment: "right" },
    { text: arabic, alignment: "right" },
    { text: mixed, alignment: "right" },
    equation,
    { table: { widths: [90, 90], body: [["س", "12"]] } },
    { svg: svg(plot) },
  ]);
  await pdfmake.createPdf({
    pageSize: "A4", pageMargins: [48, 48, 48, 48], content,
    defaultStyle: { font: "Arabic", fontSize: 15 },
    footer: (p, n) => ({ text: `${p} / ${n}`, margin: [48, 0] }),
  }).write(file);
}

async function browserPdfLib(file) {
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch({ executablePath: process.env.PDF_PROBE_CHROMIUM });
  try {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    await page.addScriptTag({ path: require.resolve("pdf-lib/dist/pdf-lib.min.js") });
    await page.addScriptTag({ path: require.resolve("@pdf-lib/fontkit/dist/fontkit.umd.min.js") });
    const bytes = await page.evaluate(async ({ font, mixed, arabic }) => {
      if (navigator.onLine) throw new Error("Offline proof requires a disconnected browser");
      const doc = await PDFLib.PDFDocument.create();
      doc.registerFontkit(fontkit);
      const embedded = await doc.embedFont(new Uint8Array(font));
      const sheet = doc.addPage([595.28, 841.89]);
      sheet.drawText(arabic, { x: 45, y: 765, font: embedded, size: 15 });
      sheet.drawText(mixed, { x: 45, y: 740, font: embedded, size: 15 });
      const blob = new Blob([await doc.save()], { type: "application/pdf" });
      return [...new Uint8Array(await blob.arrayBuffer())];
    }, { font: [...font], mixed, arabic });
    fs.writeFileSync(file, Buffer.from(bytes));
  } finally {
    await browser.close();
  }
}

async function run() {
  fs.mkdirSync(output, { recursive: true });
  const levels = bidi.getEmbeddingLevels(mixed, "rtl");
  const report = { fixture: mixed, bidiVisual: bidi.getReorderedString(mixed, levels), engines: {} };
  const engines = {
    pdfkit, "pdf-lib": pdflib, pdfmake: make,
    "pdfkit-actualtext": file => pdfkit(file, "actualtext"),
    "pdfkit-bidi-runs": file => pdfkit(file, "bidi-runs"),
  };
  if (process.env.PDF_PROBE_CHROMIUM) engines["pdf-lib-offline-browser"] = browserPdfLib;
  for (const [engine, generate] of Object.entries(engines)) {
    const file = path.join(output, `${engine}.pdf`);
    const start = performance.now();
    try {
      await generate(file);
      const elapsedMs = performance.now() - start;
      const extract = execFileSync("pdftotext", ["-raw", file, "-"], { encoding: "utf8" });
      const normalized = extract.replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "").normalize("NFC");
      report.engines[engine] = {
        elapsedMs, bytes: fs.statSync(file).size,
        pages: Number(execFileSync("pdfinfo", [file], { encoding: "utf8" }).match(/^Pages:\s+(\d+)/m)[1]),
        embeddedUnicode: /yes\s+yes\s+yes/.test(execFileSync("pdffonts", [file], { encoding: "utf8" })),
        arabicOrder: normalized.includes(arabic),
        mixedOrder: normalized.includes(mixed.normalize("NFC")),
        firstPageText: normalized.split("\f")[0],
      };
    } catch (error) {
      report.engines[engine] = { error: error.message };
    }
  }
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (Object.values(report.engines).some(result => result.error)) process.exitCode = 1;
}

run().catch(error => { console.error(error); process.exitCode = 1; });
