const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { chromium, webkit, devices } = require("playwright-core");

const engine = process.argv[2] === "webkit" ? webkit : chromium;
(async () => {
  const browser = await engine.launch(engine === chromium && process.env.MATHPRESS_CHROMIUM
    ? { executablePath: process.env.MATHPRESS_CHROMIUM } : {});
  try {
    const page = await browser.newPage(devices["iPad (gen 7)"]);
    await page.goto(process.env.MATHPRESS_QA_URL || "http://127.0.0.1:4174/");
    await page.getByRole("tab", { name: "ملف", exact: true }).click();
    const count = 200;
    const fixture = {
      format: "mathpress", schemaVersion: 3, id: randomUUID(), title: "اختبار 200 صفحة",
      background: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9Z0AAAAASUVORK5CYII=",
      content: { type: "doc", content: Array.from({ length: count }, (_, index) => [
        ...(index ? [{ type: "pageBreak" }] : []),
        { type: "paragraph", content: [{ type: "text", text: `PAGE-${index + 1} تطبيقات التكامل` }] }
      ]).flat() }
    };
    await page.locator('input[accept^=".mathdoc"]').setInputFiles({
      name: "layout200.mathdoc", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture))
    });
    await page.waitForFunction(expected =>
      document.querySelectorAll("[data-editor-page-start]").length === expected, count - 1);
    const far = page.locator('[data-editor-page-start="200"] .pg-header');
    assert.match(await far.evaluate(el => getComputedStyle(el, "::before").backgroundImage), /data:image\/png/);
    await page.getByRole("tab", { name: "عرض", exact: true }).click();
    await page.getByRole("button", { name: "لوحة الصفحات", exact: true }).click();
    await page.locator(".page-thumbnail[data-rendered]").first().waitFor();
    assert.ok(await page.locator(".page-thumbnail[data-rendered]").count() < count);
    await page.getByRole("button", { name: "صفحة 200", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "صفحة 200", exact: true }).getAttribute("aria-current"), "page");
    await page.getByRole("button", { name: "طباعة / PDF", exact: true }).click();
    await page.getByRole("region", { name: "معاينة الطباعة" }).getByText("200 صفحة A4", { exact: true }).waitFor();
    const last = page.locator('[data-print-page="200"]');
    assert.match(await last.textContent(), /PAGE-200/);
    assert.equal(await last.locator(".print-sheet-content > [data-page-source]").count(), 1);
    if (process.env.MATHPRESS_QA_OUTPUT) {
      const output = process.env.MATHPRESS_QA_OUTPUT;
      await page.screenshot({ path: join(output, `layout-${engine.name()}-ipad.png`) });
      if (engine === chromium) {
        writeFileSync(join(output, "layout-200.mathdoc"), JSON.stringify(fixture, null, 2));
        await page.pdf({ path: join(output, "layout-200.pdf"), preferCSSPageSize: true, printBackground: true });
      }
    }
    console.log(`${engine.name()} verified 200 pages, lazy thumbnails and background after page 60`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
