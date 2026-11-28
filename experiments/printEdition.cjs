// Vector print experiment. No browser or window.print is involved.
const fs = require("node:fs");
const path = require("node:path");
const { finished } = require("node:stream/promises");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const PDFKit = require("pdfkit");
const bidi = require("bidi-js")();

const mixed = "إِنَّ الدَّالَّةَ f(x) = 12، والقيمة ٣٫٥.";
const clauses = [
  ["الدائرة", "x² + y² = 4", "M95 50 a45 45 0 1 0 -90 0 a45 45 0 1 0 90 0"],
  ["القطع المكافئ", "x² = 4y", "M5 5 Q50 175 95 5"],
  ["القطع الناقص", "x²/9 + y²/4 = 1", "M95 50 a45 30 0 1 0 -90 0 a45 30 0 1 0 90 0"],
  ["القطع الزائد", "y² − x² = 1", "M5 5 Q50 75 95 5 M5 95 Q50 25 95 95"],
];

function visualRuns(text, direction) {
  const levels = bidi.getEmbeddingLevels(text, direction);
  const runs = [];
  for (const index of bidi.getReorderedIndices(text, levels)) {
    const rtl = levels.levels[index] % 2 !== 0;
    const previous = runs.at(-1);
    if (previous && previous.rtl === rtl && index === previous.last + (rtl ? -1 : 1)) {
      previous.last = index;
    } else runs.push({ rtl, first: index, last: index });
  }
  return runs.map(({ first, last, rtl }) => {
    const start = Math.min(first, last);
    return { start, rtl, text: text.slice(start, Math.max(first, last) + 1) };
  });
}

async function run() {
  const [output, fontFile] = process.argv.slice(2);
  if (!output || !fontFile) throw new Error("Usage: node printEdition.cjs OUTPUT FONT.ttf");
  const hb = await import(pathToFileURL(require.resolve("harfbuzzjs")));
  const fontData = fs.readFileSync(fontFile);
  const bytes = fontData.buffer.slice(fontData.byteOffset, fontData.byteOffset + fontData.byteLength);
  const face = new hb.Face(new hb.Blob(bytes));
  const font = new hb.Font(face);
  font.setScale(1000, 1000);
  const paths = new Map();
  const cache = new Map();
  const report = [];
  fs.mkdirSync(output, { recursive: true });

  function shape(text, direction) {
    const key = direction + text;
    if (cache.has(key)) return cache.get(key);
    let pen = 0;
    const glyphs = [];
    for (const run of visualRuns(text, direction)) {
      const buffer = new hb.Buffer();
      buffer.addText(run.text);
      buffer.guessSegmentProperties();
      buffer.setDirection(run.rtl ? hb.Direction.RTL : hb.Direction.LTR);
      hb.shape(font, buffer);
      const positions = buffer.getGlyphPositions();
      for (const [i, glyph] of buffer.getGlyphInfos().entries()) {
        if (!glyph.codepoint) throw new Error("Missing glyph in " + run.text);
        const { xAdvance, xOffset, yOffset } = positions[i];
        glyphs.push({ id: glyph.codepoint, cluster: run.start + glyph.cluster, x: pen + xOffset, y: yOffset });
        pen += xAdvance;
      }
    }
    const result = { glyphs, advance: pen };
    cache.set(key, result);
    return result;
  }

  function line(doc, text, right, baseline, size, direction = "rtl") {
    const { glyphs, advance } = shape(text, direction);
    const scale = size / 1000;
    const left = right - advance * scale;
    if (left < 48) throw new Error("An unwrapped fixture line exceeds the physical page");
    for (const glyph of glyphs) {
      if (!paths.has(glyph.id)) paths.set(glyph.id, font.glyphToPath(glyph.id));
      const outline = paths.get(glyph.id);
      if (!outline) continue;
      doc.save().translate(left + glyph.x * scale, baseline - glyph.y * scale)
        .scale(scale, -scale).path(outline).fill().restore();
    }
  }

  for (const sheets of [1, 4, 10, 50, 100, 200]) {
    const start = performance.now();
    const file = path.join(output, `vector-${sheets}.pdf`);
    const doc = new PDFKit({ size: "A4", margin: 0, autoFirstPage: false });
    const stream = doc.pipe(fs.createWriteStream(file));
    for (let i = 0; i < sheets; i++) {
      const [title, math, plot] = clauses[i % clauses.length];
      doc.addPage();
      const right = doc.page.width - 48;
      doc.fillColor("#193c6b"); line(doc, title, right, 90, 24);
      doc.fillColor("#222222"); line(doc, mixed, right, 140, 17);
      line(doc, math, right, 185, 20, "ltr");
      doc.save().translate(right - 200, 225).scale(2).path(plot).stroke("#193c6b").restore();
      doc.moveTo(48, 765).lineTo(right, 765).stroke("#9aa4af");
      doc.fillColor("#222222"); line(doc, `${i + 1} / ${sheets}`, right, 790, 12, "ltr");
    }
    doc.end();
    await finished(stream);
    const info = execFileSync("pdfinfo", [file], { encoding: "utf8" });
    const actual = Number(info.match(/^Pages:\s+(\d+)/m)[1]);
    if (actual !== sheets) throw new Error(`Expected ${sheets} pages, got ${actual}`);
    report.push({ sheets, bytes: fs.statSync(file).size, elapsedMs: Math.round(performance.now() - start),
      rssBytes: process.memoryUsage.rss() });
  }
  fs.writeFileSync(path.join(output, "vector-report.json"), JSON.stringify({ report, mixedClusters: shape(mixed, "rtl").glyphs }, null, 2));
  console.table(report);
}

run().catch(error => { console.error(error); process.exitCode = 1; });
