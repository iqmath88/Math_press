const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { chromium, webkit, devices } = require("playwright-core");

const engine = process.argv[2] === "webkit" ? webkit : chromium;
const inline = latex => ({ type: "mathInline", attrs: { latex } });
const paragraph = (...content) => ({
  type: "paragraph", content: content.map(part => typeof part === "string" ? { type: "text", text: part } : part)
});
const table = { type: "table", content: ["tableHeader", "tableCell"].map((type, index) => ({
  type: "tableRow", content: (index ? ["0", "1"] : ["س", "د(س)"]).map(value => ({ type, content: [paragraph(value)] }))
})) };

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
      background: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4/PMfAAXNAusInJE7AAAAAElFTkSuQmCC",
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
    if (engine === chromium && process.env.MATHPRESS_QA_OUTPUT) {
      const output = process.env.MATHPRESS_QA_OUTPUT;
      const samples = [
        ["sixth-integrals", "السادس العلمي · تطبيقات التكامل", [
          { ...paragraph("التكامل المحدد والمساحة"), attrs: { educationalStyle: "chapter" } },
          paragraph("نحسب المساحة تحت المنحنى ", inline("y=x^2"), " بين ٠ و٢."),
          paragraph("نعوض بالحدين في الدالة الأصلية ", inline(String.raw`\int_0^2 x^2\,dx=\frac{8}{3}`)),
          { type: "graph" }, table,
          { ...paragraph("تمرين. احسب المساحة بين المنحنى ومحور السينات من ٠ إلى ٣."), attrs: { educationalStyle: "exercise" } }
        ], 1],
        ["long-layout-100", "ملزمة الدوال · 100 صفحة", Array.from({ length: 100 }, (_, index) => [
          ...(index ? [{ type: "pageBreak" }] : []),
          { ...paragraph(`تطبيق ${index + 1} · قراءة الدالة`), attrs: { educationalStyle: "lesson" } },
          paragraph("احسب قيمة ", inline(`f(x)=x^2+${index + 1}`), " عند الصفر، ثم قارن الناتج بالجدول."),
          table, ...(index % 20 === 0 ? [{ type: "graph" }] : [])
        ]).flat(), 100]
      ];
      for (const [name, title, content, pages] of samples) {
        await page.getByRole("button", { name: "العودة للتحرير", exact: true }).click();
        await page.getByRole("tab", { name: "ملف", exact: true }).click();
        const sample = { format: "mathpress", schemaVersion: 3, id: randomUUID(), title,
          headerText: title, showPageNumbers: true, content: { type: "doc", content } };
        await page.locator('input[accept^=".mathdoc"]').setInputFiles({
          name: name + ".mathdoc", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(sample))
        });
        await page.waitForFunction(value => document.querySelector(".document-title-input")?.value === value, title);
        await page.locator(".editor-source .graph-box svg").first().waitFor();
        await page.getByRole("button", { name: "طباعة / PDF", exact: true }).click();
        await page.getByRole("region", { name: "معاينة الطباعة" }).getByText(`${pages} صفحة A4`, { exact: true }).waitFor();
        writeFileSync(join(output, name + ".mathdoc"), JSON.stringify(sample, null, 2));
        await page.pdf({ path: join(output, name + ".pdf"), preferCSSPageSize: true, printBackground: true });
      }
    }
    console.log(`${engine.name()} verified 200 pages, lazy thumbnails and background after page 60`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
