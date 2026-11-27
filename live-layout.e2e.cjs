const assert = require("node:assert/strict");
const { writeFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");
const { join } = require("node:path");
const { chromium, webkit, devices } = require("playwright-core");

const engine = process.argv[2] === "webkit" ? webkit : chromium;
const base = process.env.MATHPRESS_QA_URL || "http://127.0.0.1:4174/";
const artifacts = process.env.MATHPRESS_QA_OUTPUT;
const p = text => ({ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) });
const formula = { type: "mathInline", attrs: { latex: "x^2+1" } };

async function exercise(page, name) {
  await page.goto(base + "#live-layout-lab");
  const source = page.locator(".live-lab-source .tiptap");
  const pages = page.locator(".live-lab-result .print-sheet");
  const metrics = page.locator("[data-ranges]");
  await source.waitFor();
  await pages.first().waitFor();
  const state = () => source.evaluate(node => ({
    doc: node.editor.getJSON(),
    from: node.editor.state.selection.from,
    to: node.editor.state.selection.to,
    focused: node.editor.view.hasFocus()
  }));
  const settle = () => page.waitForTimeout(380);
  const setDoc = content => source.evaluate((node, blocks) => node.editor.chain().setMeta("addToHistory", false).setContent({
    type: "doc", content: blocks
  }, true).run(), content);
  const snapshot = label => artifacts && page.screenshot({ path: join(artifacts, `live-${engine.name()}-${name}-${label}.png`) });

  await setDoc([p("بداية البرهان x=2")]);
  await source.locator("p").first().click();
  await page.keyboard.press("End");
  await page.waitForFunction(() => document.querySelector("[data-pages]")?.dataset.pages === "1");
  await snapshot("01-before");
  const inserted = " فقرة عربية تمتد إلى الصفحة التالية عند إضافة أسطر جديدة وتمثيل الحل كتابةً. ".repeat(125);
  await page.keyboard.insertText(inserted);
  await page.waitForFunction(() => Number(document.querySelector("[data-pages]")?.dataset.pages) > 1);
  const after = await state();
  assert.ok(after.focused);
  assert.equal(after.from, after.to);
  assert.match(JSON.stringify(after.doc), /الصفحة التالية/);
  const ranges = JSON.parse(await metrics.getAttribute("data-ranges"));
  assert.ok(ranges[0].end.offset > 0 && ranges[1].start.offset === ranges[0].end.offset);
  await snapshot("02-flow");
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => document.querySelector("[data-pages]")?.dataset.pages === "1");
  assert.doesNotMatch(JSON.stringify((await state()).doc), /الصفحة التالية/);
  await snapshot("03-undo");
  await page.keyboard.press("Control+Shift+z");
  await page.waitForFunction(() => Number(document.querySelector("[data-pages]")?.dataset.pages) > 1);
  assert.deepEqual((await state()).doc, after.doc);

  const boundary = ranges[1].start.offset;
  // The fixture is BMP text, so the fragment offset and UTF-16 selection units agree.
  await source.evaluate((node, pos) => node.editor.commands.setTextSelection({ from: pos - 10, to: pos + 10 }), boundary);
  const selected = await state();
  assert.ok(selected.from < boundary && selected.to > boundary);
  await settle();
  const current = await state();
  assert.deepEqual([current.from, current.to, current.focused], [selected.from, selected.to, true]);
  const clipboard = await source.evaluate(node => {
    const transfer = new DataTransfer();
    for (const type of ["copy", "cut", "paste"]) node.dispatchEvent(new ClipboardEvent(type, {
      clipboardData: transfer, bubbles: true, cancelable: true
    }));
    return transfer.getData("text/plain");
  });
  assert.ok(clipboard.length > 0);
  assert.deepEqual((await state()).doc, after.doc);
  await page.keyboard.press("ArrowLeft");
  assert.equal((await state()).from, (await state()).to);

  const toggle = page.getByLabel("عرض الصفحات الحية");
  const beforeToggle = await state();
  await toggle.uncheck();
  await pages.first().waitFor({ state: "detached" });
  await toggle.check();
  await pages.first().waitFor();
  assert.deepEqual((await state()).doc, beforeToggle.doc);
  assert.deepEqual([(await state()).from, (await state()).to], [beforeToggle.from, beforeToggle.to]);

  const cell = (type, text, attrs) => ({ type, attrs, content: [p(text)] });
  const row = text => ({ type: "tableRow", content: [cell("tableCell", text), cell("tableCell", "قيمة")] });
  const mixed = [
    { type: "paragraph", content: [{ type: "text", text: "حول حدود الصفحة " }, formula] },
    { type: "mathBlock", attrs: { latex: String.raw`\frac{3}{7}` } },
    { type: "pageBreak" }, { type: "graph" },
    { type: "orderedList", attrs: { educationalList: "exam" }, content: [
      { type: "listItem", attrs: { points: "25" }, content: [p("سؤال"), { type: "orderedList",
        attrs: { educationalList: "branches" }, content: [{ type: "listItem", content: [p("فرع")] }] }] }
    ] },
    { type: "orderedList", attrs: { educationalList: "solution" }, content: [
      { type: "listItem", content: [{ type: "paragraph", attrs: { solutionRelation: "=" }, content: [formula, formula] }] }
    ] },
    { type: "table", content: [{ type: "tableRow", content: [cell("tableHeader", "عنوان مدمج", { colspan: 2 })] },
      ...Array.from({ length: 65 }, (_, i) => row(`صف ${i + 1}`))] }
  ];
  await setDoc(mixed);
  await pages.locator("th").first().waitFor();
  assert.ok(await pages.locator('th[colspan="2"]').count() > 1);
  assert.equal(await pages.locator("[data-points='25']").count(), 1);
  assert.equal(await pages.locator("[data-solution-relation='=']").count(), 1);
  await pages.locator(".graph-box svg").first().waitFor();
  const original = await state();
  await page.getByLabel("التكبير").selectOption("0.8");
  await page.getByLabel("الهامش الرأسي").selectOption("28");
  await settle();
  assert.deepEqual((await state()).doc, original.doc);
  const math = source.locator("math-field").first();
  await math.click();
  await math.press("End");
  await page.keyboard.type("+2");
  await page.keyboard.press("Escape");
  await page.keyboard.insertText(" بعد المعادلة");
  await settle();
  assert.notEqual(await math.evaluate(field => field.value), "x^2+1");
  assert.match(await source.innerText(), /بعد المعادلة/);
  await snapshot("04-mixed");
  if (name === "desktop") {
    await page.getByLabel("التكبير").selectOption("1");
    const frame = await page.context().newPage();
    try {
      const sample = { format: "mathpress", schemaVersion: 4, id: randomUUID(), title: "مختبر المعادلات التفاضلية",
        headerText: "السادس العلمي · مختبر الصفحات", footerText: "MathPress Studio", showPageNumbers: true,
        page: { size: "A4", orientation: "portrait", marginsMm: { top: 28, bottom: 28, left: 18, right: 18 } },
        content: (await state()).doc };
      await frame.goto(base);
      await frame.getByRole("tab", { name: "ملف", exact: true }).click();
      await frame.locator('input[accept^=".mathdoc"]').setInputFiles({
        name: "live.mathdoc", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(sample))
      });
      await frame.waitForFunction(title => document.querySelector(".document-title-input")?.value === title, sample.title);
      await frame.locator(".editor-source .graph-box svg").first().waitFor();
      await frame.getByRole("button", { name: "طباعة / PDF", exact: true }).click();
      await frame.getByRole("region", { name: "معاينة الطباعة" }).getByText(/صفحة A4/).waitFor();
      const geometry = locator => locator.evaluateAll(sheets => sheets.map(sheet => {
        const origin = sheet.getBoundingClientRect();
        return {
          sources: [...sheet.querySelectorAll("[data-page-source]")].map(block => block.dataset.pageSource),
          elements: [...sheet.querySelectorAll(".math-node, table, .graph-node, [data-points], [data-solution-relation]")]
            .map(el => { const rect = el.getBoundingClientRect(); return [el.tagName, rect.top - origin.top, rect.left - origin.left]; }),
          header: sheet.querySelector("header").textContent, footer: sheet.querySelector("footer").textContent
        };
      }));
      await settle();
      const laidOut = await geometry(pages);
      const printed = await geometry(frame.locator(".print-sheet"));
      assert.equal(laidOut.length, printed.length);
      laidOut.forEach((sheet, index) => {
        const reference = printed[index];
        assert.deepEqual(sheet.sources, reference.sources);
        assert.equal(sheet.header, reference.header);
        assert.equal(sheet.footer, reference.footer);
        assert.equal(sheet.elements.length, reference.elements.length);
        sheet.elements.forEach(([tag, y, x], i) => {
          const [refTag, refY, refX] = reference.elements[i];
          assert.equal(tag, refTag);
          assert.ok(Math.abs(y - refY) <= 3.78 && Math.abs(x - refX) <= 3.78, JSON.stringify({ tag, x, y, refX, refY }));
        });
      });
      if (artifacts && engine === chromium) {
        writeFileSync(join(artifacts, "live-layout-mixed.mathdoc"), JSON.stringify(sample, null, 2));
        await frame.pdf({ path: join(artifacts, "live-layout-mixed.pdf"), preferCSSPageSize: true, printBackground: true });
      }
    } finally { await frame.close(); }
  }
}

(async () => {
  const browser = await engine.launch(engine === chromium && process.env.MATHPRESS_CHROMIUM
    ? { executablePath: process.env.MATHPRESS_CHROMIUM } : {});
  try {
    for (const [name, config] of [["desktop", { viewport: { width: 1440, height: 960 } }],
      ["ipad", devices["iPad (gen 7)"]]]) {
      const context = await browser.newContext(config);
      const page = await context.newPage();
      await exercise(page, name);
      await context.close();
    }
    console.log(engine.name() + " live layout, source selection, history, MathLive and merged headers passed");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
