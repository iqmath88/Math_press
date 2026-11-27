const assert = require("node:assert/strict");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { chromium, webkit, devices } = require("playwright-core");
const engine = process.argv[2] === "webkit" ? webkit : chromium;
const fixtures = (size) => Array.from({ length: size }, (_, i) => [
  ...(i ? [{ type: "pageBreak" }] : []),
  { type: "paragraph", content: [{ type: "text", text: `صفحة ${i + 1} · تطبيق رياضي ` },
    { type: "mathInline", attrs: { latex: `f(x)=x^2+${i}` } }] }
]).flat();

(async () => {
  const browser = await engine.launch(engine === chromium && process.env.MATHPRESS_CHROMIUM
    ? { executablePath: process.env.MATHPRESS_CHROMIUM } : {});
  try {
    for (const [name, options] of [["desktop", { viewport: { width: 1440, height: 960 } }], ["ipad", devices["iPad (gen 7)"]]]) {
      const page = await browser.newPage(options);
      await page.goto((process.env.MATHPRESS_QA_URL || "http://127.0.0.1:4174/") + "#live-layout-lab");
      const source = page.locator(".live-lab-source .tiptap");
      const projection = page.locator(".live-lab-result .print-pages");
      const setDoc = content => source.evaluate((root, content) =>
        root.editor.chain().setMeta("addToHistory", false).setContent({ type: "doc", content }, true).run(), content);
      await source.waitFor();
      await setDoc(fixtures(200));
      await page.waitForFunction(() => document.querySelector("[data-pages]")?.dataset.pages === "200");
      await projection.evaluate(root => {
        window.originalSheets = [...root.children];
      });
      await source.evaluate(root => {
        const editor = root.editor;
        const position = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize + 1;
        editor.commands.insertContentAt(position, "تعديل فريد ");
      });
      await projection.locator('[data-print-page="2"]').filter({ hasText: "تعديل فريد" }).waitFor();
      assert.equal(await page.locator("[data-rebuilt]").getAttribute("data-rebuilt"), "1");
      assert.equal(await projection.evaluate(root => [...root.children].filter((sheet, index) =>
        sheet === window.originalSheets[index]).length), 199);
      const ranges = JSON.parse(await page.locator("[data-ranges]").getAttribute("data-ranges"));
      assert.deepEqual(ranges[1].start, { block: 2, offset: 0 });
      await page.getByLabel("الهامش الرأسي").selectOption("28");
      await page.waitForFunction(() => document.querySelector("[data-rebuilt]")?.dataset.rebuilt === "200");

      const direct = page.getByLabel("تحرير مباشر تجريبي بالأعمدة");
      await setDoc([{ type: "paragraph", content: [{ type: "text", text: "تمرين عربي x=2. ".repeat(190) }] }]);
      const snapshot = () => source.evaluate(root => root.editor.getJSON());
      const before = await snapshot();
      await direct.check();
      assert.equal(await projection.count(), 0);
      assert.equal(await page.locator(".live-lab-source .tiptap[contenteditable=true]").count(), 1);
      const columns = () => source.evaluate(root => {
        const range = document.createRange();
        range.selectNodeContents(root.querySelector("p"));
        return new Set([...range.getClientRects()].filter(rect => rect.height > 0).map(rect => Math.round(rect.right))).size;
      });
      assert.ok(await columns() > 1);
      await source.evaluate(root => root.editor.commands.focus("end"));
      await page.waitForFunction(() => {
        const root = document.querySelector(".live-lab-source .tiptap");
        const caret = document.getSelection();
        return document.activeElement === root && root.contains(caret?.anchorNode) &&
          root.editor.state.selection.from === root.editor.state.doc.content.size - 1;
      });
      await page.keyboard.insertText(" نهاية النص العربي");
      await source.getByText(/نهاية النص العربي/).waitFor();
      await page.keyboard.press("Control+z");
      await page.waitForFunction(() => !document.querySelector(".live-lab-source .tiptap").textContent.includes("نهاية النص العربي"));
      assert.deepEqual(await snapshot(), before);
      await page.keyboard.press("Control+Shift+z");
      await source.getByText(/نهاية النص العربي/).waitFor();
      const edited = await snapshot();
      await direct.uncheck();
      await projection.locator(".print-sheet").first().waitFor();
      assert.deepEqual(await snapshot(), edited);
      if (process.env.MATHPRESS_QA_OUTPUT) {
        writeFileSync(join(process.env.MATHPRESS_QA_OUTPUT, `incremental-${engine.name()}-${name}.json`),
          JSON.stringify({ pages: 200, rebuilt: 1, reused: 199, ranges }, null, 2));
        await page.screenshot({ path: join(process.env.MATHPRESS_QA_OUTPUT, `incremental-${engine.name()}-${name}.png`) });
      }
      await page.close();
    }
    console.log(engine.name() + " verified incremental page reuse and isolated direct columns");
  } finally { await browser.close(); }
})().catch(error => {
  console.error(error);
  if (process.env.GITHUB_ACTIONS)
    console.log("::error title=Incremental layout " + engine.name() + "::" + String(error.stack).replaceAll("%", "%25").replaceAll("\n", "%0A"));
  process.exitCode = 1;
});
