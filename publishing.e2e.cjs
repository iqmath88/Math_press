const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const output =
  process.env.MATHPRESS_QA_OUTPUT ||
  fs.mkdtempSync(path.join(os.tmpdir(), "mathpress-qa-"));
fs.mkdirSync(output, { recursive: true });
const baseURL = process.env.MATHPRESS_QA_URL || "http://localhost:4174/";
const launch = {
  ...(process.env.MATHPRESS_CHROMIUM
    ? { executablePath: process.env.MATHPRESS_CHROMIUM }
    : {}),
  ...(process.env.MATHPRESS_CHROMIUM_NO_SANDBOX === "1"
    ? { args: ["--no-sandbox"] }
    : {}),
};
const { chromium, devices } = require("playwright-core");
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const { randomUUID } = require("node:crypto");
(async () => {
  const browser = await chromium.launch(launch);
  try {
    const url = baseURL;
    const page = await browser.newPage({
      viewport: { width: 1400, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.locator(".pg-last").waitFor({ timeout: 90000 });
    await page.getByRole("tab", { name: "رياضيات", exact: true }).click();
    await page.getByRole("button", { name: "المفضلة: كسر" }).click();
    await page.getByLabel("مجموعة القوالب الرياضية").selectOption("favorite");
    await page.getByRole("button", { name: "كسر", exact: true }).waitFor();
    await page.getByRole("button", { name: "إدراج معادلة من مصدر LaTeX", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "مصدر LaTeX" }).fill(String.raw`\frac{a}{b}`);
    assert.equal(
      await dialog.getByRole("textbox", { name: "مصدر LaTeX" }).inputValue(),
      String.raw`\frac{a}{b}`,
    );
    await dialog.getByRole("button", { name: "إدراج كتلة" }).click();
    const newMath = page
      .locator(".math-block")
      .filter({ has: page.locator("math-field") })
      .first();
    await newMath.hover();
    await newMath.getByRole("button", { name: "تعديل المعادلة — مصدر LaTeX", exact: true }).click();
    await dialog
      .getByRole("textbox", { name: "مصدر LaTeX" })
      .fill(String.raw`\sqrt{a^2+b^2}`);
    await dialog.getByLabel("لون المعادلة").fill("#275434");
    await dialog.getByLabel("الحجم (نقطة)").fill("20");
    await page.screenshot({ path: path.join(output, "equation.png") });
    await dialog.getByRole("button", { name: "حفظ داخل السطر" }).click();
    const values = await page
      .locator(".math-inline math-field")
      .evaluateAll((nodes) => nodes.map((n) => n.value));
    assert.ok(values.some((value) => value.includes("sqrt")));
    await page.getByRole("tab", { name: "أنماط", exact: true }).click();
    await page.getByRole("button", { name: "خطوات الحل", exact: true }).click();
    const steps = page.locator(".mp-editor ol").last();
    await steps.locator("li").first().click();
    await page.keyboard.insertText("Solution step one");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("Solution step two");
    assert.deepEqual(await steps.locator("li").allTextContents(), [
      "Solution step one",
      "Solution step two",
    ]);
    assert.equal(await steps.locator('p[data-educational-style="solution"]').count(), 2);
    await page.getByRole("tab", { name: "رياضيات", exact: true }).click();
    await page.getByRole("button", { name: "إدراج معادلة من مصدر LaTeX" }).click();
    await dialog.getByRole("textbox", { name: "مصدر LaTeX" }).fill(String.raw`\frac{3}{7}`);
    await dialog.getByRole("button", { name: "إدراج داخل السطر" }).click();
    assert.equal(await steps.locator("li").last().locator("math-field").evaluate(field => field.value), String.raw`\frac{3}{7}`);
    await page.getByRole("tab", { name: "أنماط", exact: true }).click();
    await page.getByLabel("إدراج قالب تعليمي").selectOption("exercise");
    await page.getByLabel("رقم البداية").fill("7");
    await page.getByRole("button", { name: "إعادة الترقيم" }).click();
    assert.equal(
      await page
        .locator('.mp-editor [data-educational-sequence="exercise"]')
        .count(),
      1,
    );
    await page.getByRole("tab", { name: "عرض", exact: true }).click();
    await page.getByLabel("تكبير العرض").selectOption("1.25");
    await page.locator(".document-view-status").getByText("125%").waitFor();
    await page.getByRole("button", { name: "لوحة الصفحات" }).click();
    await page
      .getByRole("navigation", { name: "التنقل بين الصفحات" })
      .waitFor();
    await page.getByRole("button", { name: "وضع التركيز" }).click();
    await page.getByRole("button", { name: "إنهاء وضع التركيز" }).click();
    await page
      .getByRole("button", { name: "طباعة / PDF", exact: true })
      .click();
    const styledPreview = page.getByRole("region", { name: "معاينة الطباعة" });
    await styledPreview.getByRole("checkbox", { name: "حبر اقتصادي" }).check();
    await styledPreview.getByText(/صفحة A4/).waitFor();
    const styledFile = path.join(output, "mathpress-equations.pdf");
    await page.pdf({
      path: styledFile,
      printBackground: true,
      preferCSSPageSize: true,
    });
    const equationText = cp.execFileSync("pdftotext", [styledFile, "-"], { encoding: "utf8" });
    assert.match(equationText, /Solution step two/);
    assert.match(equationText, /√/);
    assert.match(equationText, /±/);
    assert.equal(await page.locator(".print-pages ol .math-inline math-field").count(), 1);
    await styledPreview.getByRole("button", { name: "العودة للتحرير" }).click();
    await page.getByRole("tab", { name: "ملف" }).click();
    for (const n of [1, 2, 10, 40, 100]) {
      const content = Array.from({ length: n }, (_, i) => [
        ...(i ? [{ type: "pageBreak" }] : []),
        {
          type: "paragraph",
          content: [{ type: "text", text: `PRINT FIXTURE PAGE ${i + 1}` }],
        },
      ]).flat();
      const payload = {
        format: "mathpress",
        schemaVersion: 3,
        id: randomUUID(),
        title: `TEST ${n}`,
        language: "ar",
        direction: "rtl",
        page: {
          size: "A4",
          orientation: n === 2 ? "landscape" : "portrait",
          marginsMm: { top: 20, bottom: 20, left: 12, right: 29 },
        },
        headerText: "TEST HEADER",
        footerText: "TEST FOOTER",
        showPageNumbers: true,
        background: null,
        content: { type: "doc", content },
        updatedAt: new Date().toISOString(),
      };
      const start = performance.now();
      await page.locator('input[accept^=".mathdoc"]').setInputFiles({
        name: "test.mathdoc",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(payload)),
      });
      await page.waitForFunction(
        (n) => document.querySelectorAll(".pg-footer").length === n,
        n,
      );
      await page.evaluate(() => document.fonts.ready);
      const elapsed = Math.round(performance.now() - start);
      const printStart = performance.now();
      await page
        .getByRole("button", { name: "طباعة / PDF", exact: true })
        .click();
      const print = page.getByRole("region", { name: "معاينة الطباعة" });
      await print.getByText(`${n} صفحة A4`, { exact: true }).waitFor();
      const previewElapsed = Math.round(performance.now() - printStart);
      await print.getByRole("checkbox", { name: "ترقيم الصفحات" }).uncheck();
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".print-pages .pg-footer-num")].every(
          (el) => !el.textContent,
        ),
      );
      await print.getByRole("checkbox", { name: "ترقيم الصفحات" }).check();
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".print-pages .pg-footer-num")].every(
          (el) => el.textContent,
        ),
      );
      await print.getByText(`${n} صفحة A4`, { exact: true }).waitFor();
      await page.evaluate(() => {
        window.print = () => {
          window.printCalled = true;
        };
        window.printCalled = false;
      });
      await print.getByRole("button", { name: "طباعة / PDF" }).click();
      assert.ok(await page.evaluate(() => window.printCalled));
      if (n === 2)
        await page.screenshot({ path: path.join(output, "preview.png") });
      const file = path.join(output, `mathpress-${n}.pdf`);
      await page.pdf({
        path: file,
        printBackground: true,
        preferCSSPageSize: true,
      });
      const info = cp.execFileSync("pdfinfo", [file], { encoding: "utf8" });
      assert.match(info, new RegExp(`^Pages:\\s+${n}$`, "m"));
      const [w, h] = info
        .match(/Page size:\s+([\d.]+) x ([\d.]+)/)
        .slice(1)
        .map(Number);
      assert.equal(w > h, n === 2);
      const pages = cp
        .execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" })
        .split("\f");
      for (let i = 0; i < n; i++) {
        assert.match(pages[i], /TEST HEADER/);
        assert.match(pages[i], /TEST FOOTER/);
        assert.match(pages[i], new RegExp(`PRINT FIXTURE PAGE ${i + 1}\\b`));
        assert.doesNotMatch(pages[i], /MathPress/);
      }
      console.log(
        `PDF: ${n} A4 pages passed, import: ${elapsed} ms, preview: ${previewElapsed} ms`,
      );
      await print.getByRole("button", { name: "العودة للتحرير" }).click();
      if (n !== 100) await page.getByRole("tab", { name: "ملف" }).click();
    }
    await page.getByRole("tab", { name: "ملف" }).click();
    const paragraph = (text, marks) => ({
      type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
    });
    const cell = (text, type = "tableCell", attrs) => ({
      type, attrs, content: [paragraph(text)],
    });
    const row = (...cells) => ({ type: "tableRow", content: cells });
    const words = Array.from({ length: 720 }, (_, i) => `Word${String(i).padStart(4, "0")}`);
    const rowNames = Array.from({ length: 110 }, (_, i) => `Row${String(i).padStart(4, "0")}`);
    const longDocument = {
      format: "mathpress", schemaVersion: 3, id: randomUUID(), title: "Long blocks",
      language: "ar", direction: "ltr",
      page: { size: "A4", orientation: "portrait", marginsMm: { top: 20, bottom: 20, left: 20, right: 20 } },
      headerText: "LONG HEADER", footerText: "LONG FOOTER", showPageNumbers: true, background: null,
      content: { type: "doc", content: [
        { type: "pageBreak" },
        paragraph(words.join(" "), [{ type: "bold" }]),
        { type: "pageBreak" }, { type: "pageBreak" },
        { type: "table", content: [
          row(cell("Repeated heading", "tableHeader"), cell("Second heading", "tableHeader")),
          ...rowNames.map((name, i) => i === 21
            ? row(cell(name, "tableCell", { rowspan: 2 }), cell("Merge start"))
            : i === 22 ? row(cell(name)) : row(cell(name), cell("Data"))),
        ] },
        { type: "pageBreak" },
      ] },
      updatedAt: new Date().toISOString(),
    };
    await page.locator('input[accept^=".mathdoc"]').setInputFiles({
      name: "long.mathdoc", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(longDocument)),
    });
    await page.locator(".editor-source table").waitFor();
    await page.getByRole("button", { name: "طباعة / PDF", exact: true }).click();
    await page.getByRole("region", { name: "معاينة الطباعة" }).getByText(/صفحة A4/).waitFor();
    const sheets = page.locator(".print-sheet");
    const previewPages = await sheets.count();
    const paragraphs = page.locator(".print-sheet-content > p");
    assert.ok(await paragraphs.count() > 1);
    assert.equal(await paragraphs.locator("strong").count(), await paragraphs.count());
    assert.equal((await paragraphs.allTextContents()).join("").trim(), words.join(" "));
    const tables = page.locator(".print-sheet-content > table");
    assert.ok(await tables.count() > 1);
    assert.equal(await tables.locator("thead").count(), await tables.count());
    assert.deepEqual((await tables.locator("tbody td").allTextContents()).filter(text => /^Row/.test(text)), rowNames);
    assert.equal(await tables.locator('td[rowspan="2"]').count(), 1);
    const longFile = path.join(output, "long-blocks.pdf");
    await page.pdf({ path: longFile, printBackground: true, preferCSSPageSize: true });
    const longPages = cp.execFileSync("pdftotext", ["-layout", longFile, "-"], { encoding: "utf8" }).trim().split("\f");
    assert.equal(longPages.length, previewPages);
    for (const text of longPages) {
      assert.match(text, /LONG HEADER/);
      assert.match(text, /LONG FOOTER/);
      assert.match(text, /Word\d{4}|Row\d{4}/);
      if (/Row\d{4}/.test(text)) assert.match(text, /Repeated heading/);
    }
    for (const token of [...words, ...rowNames]) {
      assert.equal(longPages.join(" ").split(token).length, 2, token);
    }
    console.log(`PDF: ${previewPages} naturally fragmented pages passed (paragraph and merged table)`);
    for (const [name, device, viewport] of [
      ["phone", "Galaxy S9+", null],
      ["ipad-portrait", "iPad (gen 7)", null],
      ["ipad-landscape", "iPad (gen 7) landscape", null],
    ]) {
      const mobile = await browser.newPage({
        ...devices[device],
        ...(viewport ? { viewport } : {}),
      });
      await mobile.goto(url);
      await mobile.locator(".pg-last").waitFor();
      const dimensions = await mobile.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      assert.equal(dimensions.width, dimensions.viewport);
      await mobile.screenshot({ path: path.join(output, `${name}.png`) });
      await mobile.close();
    }
    assert.deepEqual(errors, []);
    console.log(`Artifacts: ${output}`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
