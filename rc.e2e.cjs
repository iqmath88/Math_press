const assert = require("node:assert/strict");
const { join } = require("node:path");
const { writeFileSync } = require("node:fs");
const { chromium } = require("playwright-core");

(async () => {
  const browser = await chromium.launch(process.env.MATHPRESS_CHROMIUM
    ? { executablePath: process.env.MATHPRESS_CHROMIUM } : {});
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  try {
    let page = await context.newPage();
    const url = process.env.MATHPRESS_QA_URL || "http://127.0.0.1:4174/";
    const source = () => page.locator(".editor-source .mp-editor");
    const button = name => page.getByRole("button", { name, exact: true });
    const tab = name => page.getByRole("tab", { name, exact: true });
    await page.goto(url);
    await source().waitFor();

    // A disposable document saved by the user must survive closure and reopen.
    await button("مستند فارغ").click();
    await page.getByLabel("عنوان المستند").fill("نسخة اعتماد الاسترداد");
    await source().locator("p").click();
    await page.keyboard.insertText("نص محفوظ قبل إغلاق النافذة");
    await page.getByText("محفوظ محليًا", { exact: true }).waitFor();
    await page.close({ runBeforeUnload: false });
    page = await context.newPage();
    await page.goto(url);
    await tab("ملف").click();
    await button("المستندات المحفوظة على هذا الجهاز").click();
    await page.locator(".library-open").filter({ hasText: "نسخة اعتماد الاسترداد" }).click();
    await source().getByText("نص محفوظ قبل إغلاق النافذة").waitFor();

    const original = await page.getByLabel("عنوان المستند").inputValue();
    await tab("ملف").click();
    await page.locator('input[accept^=".mathdoc"]').setInputFiles({
      name: "unsupported.mathdoc", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({
        format: "mathpress", schemaVersion: 4, id: "audit", title: "ملف غير مدعوم",
        content: { type: "doc", content: [{ type: "paragraph", attrs: { futureLayout: "hidden" } }] }
      }))
    });
    await page.getByText(/محتوى أو خصائص غير مدعومة/).waitFor();
    assert.equal(await page.getByLabel("عنوان المستند").inputValue(), original);
    await source().getByText("نص محفوظ قبل إغلاق النافذة").waitFor();

    await button("خصائص المستند").click();
    const properties = page.getByRole("complementary", { name: "خصائص المستند" });
    await properties.getByLabel("حدود مساحة الكتابة").focus();
    await page.keyboard.press("Escape");
    assert.equal(await properties.count(), 0);

    const cdp = await context.newCDPSession(page);
    async function sample() {
      await cdp.send("HeapProfiler.collectGarbage");
      return {
        ...await cdp.send("Memory.getDOMCounters"),
        usedBytes: (await cdp.send("Runtime.getHeapUsage")).usedSize
      };
    }
    async function stress(rounds) {
      for (let round = 0; round < rounds; round++) {
        await button("مستند فارغ").click();
        await source().evaluate((node, index) => {
          node.editor.commands.setContent({
            type: "doc", content: Array.from({ length: 12 }, (_, i) => ({
              type: "paragraph", content: [{ type: "mathInline", attrs: { latex: `x^${i + 1}+${index}` } }]
            }))
          });
        }, round);
        assert.equal(await source().locator("math-field").count(), 12);
        await button("مستند فارغ").click();
        assert.equal(await source().locator("math-field").count(), 0);
      }
      await page.getByText("محفوظ محليًا", { exact: true }).waitFor();
    }
    await stress(5);
    const before = await sample();
    await stress(25);
    const after = await sample();
    // Retained listeners should not grow in proportion to the 300 detached math views.
    assert.ok(after.jsEventListeners - before.jsEventListeners < 100, JSON.stringify({ before, after }));
    if (process.env.MATHPRESS_QA_OUTPUT) writeFileSync(join(process.env.MATHPRESS_QA_OUTPUT, "rc-lifecycle.json"),
      JSON.stringify({ warmup: 5, rounds: 25, equationViewsPerRound: 12, before, after }, null, 2));
    console.log("RC import, reload recovery, focus and MathLive lifecycle passed", { before, after });
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
