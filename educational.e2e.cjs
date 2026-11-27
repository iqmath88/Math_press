const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { chromium, webkit, devices } = require("playwright-core");

const engine = process.argv[2] === "webkit" ? webkit : chromium;
const url = process.env.MATHPRESS_QA_URL || "http://127.0.0.1:4174/";
const output = process.env.MATHPRESS_QA_OUTPUT || mkdtempSync(join(tmpdir(), "mathpress-education-"));
const paragraph = text => ({ type: "paragraph", content: [{ type: "text", text }] });
const math = latex => ({ type: "mathInline", attrs: { latex } });
const item = (...content) => ({ type: "listItem", content });
const list = (kind, content) => ({ type: "orderedList", attrs: { dir: "rtl", educationalList: kind }, content });
const fixture = (title, content) => ({
  format: "mathpress", schemaVersion: 3, id: randomUUID(), title,
  page: { size: "A4", orientation: "portrait" },
  showPageNumbers: true, content: { type: "doc", content }, updatedAt: new Date().toISOString()
});
const solution = fixture("حل معادلة", [
  list("solution", Array.from({ length: 6 }, (_, index) => item(
    paragraph(`STEP${index + 1} نرتب الحدود ثم نبسّط التعبير الرياضي في هذه الخطوة.`),
    { type: "paragraph", attrs: { solutionRelation: "=" }, content: [math(`x+${index + 1}`), math(`${index + 2}`)] },
    ...Array.from({ length: 5 }, () => paragraph("نوضح طريقة الحل ونراجع النتيجة قبل الانتقال إلى الخطوة التالية."))
  )))
]);
const exam = fixture("أسئلة امتحانية", [
  list("exam", Array.from({ length: 4 }, (_, index) => ({
    ...item(paragraph(`QUESTION${index + 1} أجب عن الفروع الآتية`),
      list("branches", Array.from({ length: 3 }, (_, branch) =>
        item({ type: "paragraph", content: [{ type: "text", text: `BRANCH${index + 1}${branch + 1} حل المعادلة ` }, math("x^2=9")] })))),
    attrs: { points: "10" }
  })))
]);

async function verify(page, doc, key, touch) {
  const perform = locator => locator[touch ? "tap" : "click"]();
  await page.emulateMedia({ media: "screen" });
  await page.goto(url);
  await page.locator(".editor-source .mp-editor").waitFor();
  await perform(page.getByRole("tab", { name: "ملف", exact: true }));
  const contents = JSON.stringify(doc, null, 2);
  await page.locator('input[accept^=".mathdoc"]').setInputFiles({
    name: `${key}.mathdoc`, mimeType: "application/json", buffer: Buffer.from(contents),
  });
  const source = page.locator(".editor-source");
  const kind = key === "solution" ? "solution" : "exam";
  await source.locator(`ol[data-educational-list="${kind}"]`).waitFor();
  if (!touch) {
    await page.getByText("محفوظ محليًا", { exact: true }).waitFor();
    const title = await page.getByLabel("عنوان المستند").inputValue();
    await page.reload();
    await page.getByRole("tab", { name: "ملف", exact: true }).click();
    await page.getByRole("button", { name: "المستندات المحفوظة على هذا الجهاز", exact: true }).click();
    await page.locator(".library-open").filter({ hasText: title }).first().click();
    await source.locator(`ol[data-educational-list="${kind}"]`).waitFor();
  }
  await perform(page.getByRole("tab", { name: "أنماط", exact: true }));
  await page.screenshot({ path: join(output, `educational-${key}-${engine.name()}-${page.viewportSize().width}.png`) });
  await perform(page.getByRole("button", { name: "طباعة / PDF", exact: true }));
  const sheets = page.locator(".print-sheet");
  await sheets.first().waitFor();
  const layout = () => sheets.evaluateAll(nodes => nodes.map(sheet => [...sheet.querySelectorAll("p[data-solution-relation]")]
    .map(row => {
      const [left, right] = row.querySelectorAll(":scope > .math-inline");
      if (getComputedStyle(row).display !== "grid" || !left || !right) throw new Error("Missing relation grid");
      return row.getBoundingClientRect().left + row.getBoundingClientRect().width / 2 - sheet.getBoundingClientRect().left;
    })));
  if (key === "solution") {
    const positions = await layout();
    assert.ok(positions.length > 1);
    assert.equal(positions.flat().length, 6);
    assert.ok(positions.every(page => page.length && Math.max(...page) - Math.min(...page) <= 96 / 25.4));
    await page.emulateMedia({ media: "print" });
    const printed = await layout();
    assert.deepEqual(printed.map(rows => rows.length), positions.map(rows => rows.length));
    assert.ok(printed.every(rows => Math.max(...rows) - Math.min(...rows) <= 96 / 25.4));
  } else {
    assert.equal(await sheets.locator('ol[data-educational-list="branches"] > li').count(), 12);
    assert.equal(await sheets.locator("li[data-points='10']").count(), 4);
  }
  if (engine === chromium && !touch) {
    writeFileSync(join(output, `${key}.mathdoc`), contents);
    const pdf = join(output, `${key}.pdf`);
    await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
    const text = execFileSync("pdftotext", ["-bbox", pdf, "-"], { encoding: "utf8" });
    for (const marker of key === "solution" ? ["STEP1", "STEP6"] : ["QUESTION1", "BRANCH43"]) {
      assert.ok(text.includes(marker), marker);
    }
    if (key === "solution") {
      const columns = text.split("</page>").map(sheet => [...sheet.matchAll(/xMin="([\d.]+)"[^>]*>=<\/word>/g)]
        .map(([, x]) => Number(x)));
      assert.equal(columns.flat().length, 6);
      assert.ok(columns.every(x => x.length < 2 || Math.max(...x) - Math.min(...x) <= 72 / 25.4));
    }
  }

}

async function verifyCommands(page) {
  await page.goto(url);
  const button = name => page.getByRole("button", { name, exact: true });
  await button("مستند فارغ").click();
  await page.getByRole("tab", { name: "أنماط", exact: true }).click();
  const source = page.locator(".editor-source .mp-editor");
  await source.locator("p").first().click();
  await button("خطوات الحل").click();
  const solution = source.locator('ol[data-educational-list="solution"]');
  await solution.locator("p").first().click();
  await page.keyboard.insertText("نبدأ بالمعادلة");
  await page.keyboard.press("Enter");
  assert.equal(await solution.locator(":scope > li").count(), 2);
  await page.getByLabel("محاذاة علاقة رياضية").selectOption("=");
  const fields = solution.locator("math-field");
  assert.equal(await fields.count(), 2);
  await fields.first().click();
  await source.locator("math-field:focus").waitFor({ timeout: 5000 });
  await page.keyboard.type("x");
  await page.keyboard.press("Tab");
  await source.locator("math-field:focus").and(fields.nth(1)).waitFor({ timeout: 5000 });
  await page.keyboard.type("2");
  await fields.nth(1).evaluate(field => { field.position = 0; });
  await page.keyboard.press("Shift+Tab");
  await source.locator("math-field:focus").and(fields.first()).waitFor({ timeout: 5000 });
  await page.keyboard.press("Escape");
  await page.keyboard.insertText("ثم نراجع النتيجة");
  assert.equal(await fields.first().evaluate(field => field.value), "x");
  assert.equal(await fields.nth(1).evaluate(field => field.value), "2");
  await solution.locator("p:not([data-solution-relation])").filter({ hasText: "ثم نراجع النتيجة" }).waitFor();

  await button("مستند فارغ").click();
  await page.getByRole("tab", { name: "أنماط", exact: true }).click();
  await source.locator("p").first().click();
  await button("سؤال امتحاني").click();
  const exam = source.locator('ol[data-educational-list="exam"]');
  await exam.locator("p").first().click();
  await button("إضافة فروع").click();
  assert.equal(await exam.locator('ol[data-educational-list="branches"] > li').count(), 3);
  await button("إدارة الأنماط").click();
  const dialog = page.getByRole("dialog", { name: "إدارة الأنماط التعليمية" });
  await dialog.getByLabel("النمط الحالي").selectOption("note");
  await dialog.getByLabel("عنوان القالب (اختياري)").fill("عنوان مخصص");
  await dialog.getByLabel("لون العنوان").fill("#224466");
  await dialog.getByLabel("ترقيم عنوان القالب").check();
  await dialog.getByRole("button", { name: "حفظ النمط", exact: true }).click();
  await dialog.getByRole("button", { name: "إغلاق", exact: true }).click();
  await page.getByLabel("إدراج قالب تعليمي").selectOption("note");
  const heading = source.locator("[data-template-heading]").filter({ hasText: "عنوان مخصص" });
  await heading.waitFor();
  assert.equal(await heading.evaluate(node => getComputedStyle(node).color), "rgb(34, 68, 102)");
  assert.equal(await heading.getAttribute("data-educational-sequence"), "template");

}

(async () => {
  const browser = await engine.launch(engine === chromium && process.env.MATHPRESS_CHROMIUM
    ? { executablePath: process.env.MATHPRESS_CHROMIUM } : {});
  try {
    for (const options of [{ viewport: { width: 1440, height: 1000 } }, devices["iPad (gen 7)"], devices["iPad (gen 7) landscape"]]) {
      const page = await browser.newPage(options);
      if (!options.hasTouch) await verifyCommands(page);
      await verify(page, solution, "solution", !!options.hasTouch);
      await verify(page, exam, "exam", !!options.hasTouch);
      await page.close();
    }
    console.log(`Educational authoring verified in ${engine.name()}: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
