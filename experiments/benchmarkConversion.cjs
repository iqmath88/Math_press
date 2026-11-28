// Run this on an otherwise idle host against already-built local versions.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const { chromium } = require("playwright-core");

const [output, ...inputs] = process.argv.slice(2);
const versions = inputs.map(entry => {
  const [version, url] = entry.split("=", 2);
  assert.ok(version && url, "Each build argument must be VERSION=URL");
  return { version, url };
});

async function run() {
  assert.ok(output && versions.length >= 2,
    "Usage: node experiments/benchmarkConversion.cjs OUTPUT.json vREF=http://localhost:PORT vNEW=http://localhost:PORT");
  const browser = await chromium.launch(process.env.MATHPRESS_CHROMIUM
    ? { executablePath: process.env.MATHPRESS_CHROMIUM } : {});
  const report = { browser: browser.version(), warmups: 2, rounds: 20, results: [] };
  try {
    for (const pages of [10, 50, 100]) {
      const content = Array.from({ length: pages }, (_, i) => [
        ...(i ? [{ type: "pageBreak" }] : []),
        ...Array.from({ length: 4 }, () => ({
          type: "paragraph", content: [{ type: "text", text: "لغة عربية مع كتابة تعليمية. ".repeat(5) }],
        })),
      ]).flat();
      const runs = [];
      for (const { version, url } of versions) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        await page.goto(url);
        assert.equal((await page.locator(".version").textContent()).trim(), version);
        await page.getByRole("tab", { name: "ملف", exact: true }).click();
        const title = "Performance " + pages;
        const fixture = { format: "mathpress", schemaVersion: 3, id: randomUUID(), title, content: { type: "doc", content } };
        await page.locator('input[accept^=".mathdoc"]').setInputFiles({
          name: "conversion.mathdoc", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)),
        });
        const root = page.locator(".editor-source .tiptap");
        await page.waitForFunction(({ pages, title }) => document.querySelector(".document-title-input")?.value === title &&
          document.querySelector(".editor-source .tiptap")?.editor?.storage.pagination.pages === pages, { pages, title });
        await page.evaluate(() => document.fonts.ready);
        await root.evaluate(el => { window.benchmarkParagraph = el.editor.state.doc.firstChild; });
        runs.push({ page, root, version, samples: [] });
      }
      for (let i = -2; i < 20; i++) {
        for (let offset = 0; offset < runs.length; offset++) {
          const { page, root, samples } = runs[((i + offset) % runs.length + runs.length) % runs.length];
          await page.bringToFront();
          await root.evaluate(el => {
            const editor = el.editor;
            const first = editor.state.doc.firstChild;
            if (!first.eq(window.benchmarkParagraph)) {
              editor.view.dispatch(editor.state.tr.replaceWith(1, first.nodeSize - 1, window.benchmarkParagraph.content)
                .setMeta("addToHistory", false));
            }
            editor.commands.focus(1);
            editor.commands.insertContentAt(1, "$x^2+1");
          });
          await page.waitForFunction(() => document.querySelector(".editor-source .tiptap") === document.activeElement);
          const start = performance.now();
          await page.keyboard.press("$");
          await page.waitForFunction(() => {
            const nodes = document.querySelector(".editor-source .tiptap").editor.state.doc.firstChild.content.content;
            return nodes.some(node => node.type.name === "mathInline" && node.attrs.latex === "x^2+1");
          });
          if (i >= 0) samples.push(performance.now() - start);
        }
      }
      for (const { page, version, samples } of runs) {
        await page.close();
        const ordered = [...samples].sort((a, b) => a - b);
        report.results.push({ version, pages, samples, min: ordered[0], median: (ordered[9] + ordered[10]) / 2,
          p95: ordered[18], max: ordered[19] });
      }
      writeFileSync(output, JSON.stringify(report, null, 2));
    }
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
