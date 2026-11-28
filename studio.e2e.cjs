const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { chromium, webkit, devices } = require("playwright-core");

const engine = process.argv[2] === "webkit" ? webkit : chromium;
const url = process.env.MATHPRESS_QA_URL || "http://127.0.0.1:4174/";
const output = process.env.MATHPRESS_QA_OUTPUT || mkdtempSync(join(tmpdir(), "mathpress-studio-"));
const text = value => ({ type: "text", text: value });
const p = (...content) => ({ type: "paragraph", content: content.map(part => typeof part === "string" ? text(part) : part) });
const math = (latex, type = "mathInline") => ({ type, attrs: { latex } });
const title = (value, educationalStyle = "chapter") => ({ ...p(value), attrs: { educationalStyle } });
const list = (educationalList, content) => ({ type: "orderedList", attrs: { educationalList, dir: "rtl" }, content });
const li = (...content) => ({ type: "listItem", content });
const graph = { type: "graph", attrs: { spec: {
  xmin: -4, xmax: 4, ymin: -2, ymax: 8, axes: true, grid: true, widthPct: 45,
  caption: "منحنى الدالة التربيعية",
  items: [{ id: "quadratic", type: "function", expr: "x^2", color: "#245d89", dashed: false, from: "-3", to: "3" }]
}} };
const steps = list("solution", [
  li(p("نوجد المشتقة ثم نساويها بالصفر."),
    { ...p(math("f'(x)"), math("2x")), attrs: { solutionRelation: "=" } }),
  li(p("نحدد النقطة الحرجة."),
    { ...p(math("2x"), math("0")), attrs: { solutionRelation: "=" } }),
  li(p("نتحقق من إشارة المشتقة حول الصفر."),
    { ...p(math("x"), math("0")), attrs: { solutionRelation: "=" } })
]);
const exam = list("exam", [
  ["حل المعادلتين", "x^2-5x+6=0", "x^2=16"],
  ["أوجد المشتقة لكل دالة", "f(x)=x^3-2x", "g(x)=3x^2+7"],
  ["احسب قيمتي التكامل", String.raw`\int_0^2 x\,dx`, String.raw`\int_1^3 2\,dx`],
  ["أوجد المدى وبيّن رأس المنحنى", "y=x^2", "y=(x-2)^2+1"]
].map(([prompt, first, second]) => ({
  ...li(p(prompt), list("branches", [li(p(math(first))), li(p(math(second)))])), attrs: { points: "25" }
})));
const table = { type: "table", content: [
  { type: "tableRow", content: ["قيمة س", "قيمة ص"].map(label => ({ type: "tableHeader", content: [p(label)] })) },
  ...Array.from({ length: 8 }, (_, value) => ({ type: "tableRow",
    content: [value, value ** 2].map(n => ({ type: "tableCell", content: [p(String(n))] })) }))
]};
const samples = [
  ["sixth-science", "السادس العلمي · تطبيقات المشتقة", "ملزمة الرياضيات | السادس العلمي", [
    title("تطبيقات المشتقة"), title("مثال محلول", "example"),
    p("حدد القيمة الصغرى للدالة ", math("f(x)=x^2"), " على الأعداد الحقيقية."),
    steps, graph, title("تمرين", "exercise"), p("كرر الخطوات للدالة ", math("g(x)=(x-1)^2+3"), ".")
  ]],
  ["fifth-exam", "الخامس العلمي · امتحان الرياضيات", "جمهورية العراق | وزارة التربية | نموذج امتحاني", [
    title("امتحان الرياضيات · الخامس العلمي"), p("الزمن 90 دقيقة. الدرجة الكلية 100."),
    p("الاسم ____________________   الشعبة __________"), exam
  ]],
  ["long-math", "دفتر الدوال · مسائل تطبيقية", "دفتر الدوال | مسائل تطبيقية", Array.from({ length: 10 }, (_, index) => [
    ...(index ? [{ type: "pageBreak" }] : []), title(`المسألة ${index + 1} · تمثيل الدوال`),
    p("اربط القيم من الجدول بمواقع النقاط على الرسم."), table, graph, steps
  ]).flat()]
];

(async () => {
  const browser = await engine.launch(engine === chromium && process.env.MATHPRESS_CHROMIUM
    ? { executablePath: process.env.MATHPRESS_CHROMIUM } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(url);
    const button = name => page.getByRole("button", { name, exact: true });
    const tab = name => page.getByRole("tab", { name, exact: true });
    await button("مستند فارغ").click();
    await tab("أنماط").click();
    const source = page.locator(".editor-source .mp-editor");
    await source.locator("p").first().click();
    await button("هيكل امتحان").click();
    await button("إدراج الهيكل").click();
    assert.equal(await source.locator('[data-educational-list="exam"] > li').count(), 4);
    assert.equal(await source.locator('[data-educational-list="branches"] > li').count(), 12);
    await button("تراجع").click();
    assert.equal(await source.locator('[data-educational-list="exam"]').count(), 0);
    await button("إعادة").click();
    assert.equal(await source.locator('[data-educational-list="branches"] > li').count(), 12);
    await source.locator('[data-educational-list="exam"] > li > p').first().click();
    await page.keyboard.insertText("عنوان السؤال");
    await page.keyboard.press("Alt+ArrowDown");
    await page.keyboard.insertText("نص الفرع");
    await source.locator('[data-educational-list="branches"] p').first().filter({ hasText: "نص الفرع" }).waitFor();
    await button("خصائص المستند").click();
    await page.getByLabel("حدود مساحة الكتابة").check();
    assert.equal(await page.locator(".studio-margins").count(), 1);
    const paperColor = await page.locator(".paper").evaluate(node => getComputedStyle(node).backgroundColor);
    await button("الوضع الداكن").click();
    assert.equal(await page.locator(".app-shell").getAttribute("data-theme"), "dark");
    assert.equal(await page.locator(".paper").evaluate(node => getComputedStyle(node).backgroundColor), paperColor);
    await page.screenshot({ path: join(output, `studio-${engine.name()}-dark.png`) });
    await tab("ملف").click();
    const downloadReady = page.waitForEvent("download");
    await button("تصدير المستند كملف قابل للتحرير").click();
    const download = await downloadReady;
    const exported = JSON.parse(readFileSync(await download.path(), "utf8"));
    assert.equal(exported.schemaVersion, 4);
    assert.equal(exported.content.content[0].attrs.educationalList, "exam");
    const currentTitle = await page.getByLabel("عنوان المستند").inputValue();
    await page.locator('input[accept^=".mathdoc"]').setInputFiles({
      name: "future.mathdoc", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ ...exported, schemaVersion: 7, title: "عنوان مستقبلي" }))
    });
    await page.getByText(/يتطلب هذا المستند إصدارًا أحدث/).waitFor();
    assert.equal(await page.getByLabel("عنوان المستند").inputValue(), currentTitle);
    assert.equal(await source.locator('[data-educational-list="branches"] > li').count(), 12);

    for (const [name, title, headerText, content] of samples) {
      await page.goto(url);
      await tab("ملف").click();
      const json = JSON.stringify({
        id: randomUUID(), format: "mathpress", schemaVersion: 4, title, headerText, footerText: "MathPress Studio",
        page: { size: "A4", orientation: "portrait", marginsMm: { top: 18, right: 18, bottom: 18, left: 18 } },
        showPageNumbers: true, content: { type: "doc", content }, updatedAt: new Date().toISOString()
      }, null, 2);
      await page.locator('input[accept^=".mathdoc"]').setInputFiles({
        name: `${name}.mathdoc`, mimeType: "application/json", buffer: Buffer.from(json)
      });
      await page.waitForFunction(expected => document.querySelector(".document-title-input")?.value === expected, title);
      await source.locator("math-field").first().waitFor();
      assert.equal(await page.getByLabel("عنوان المستند").inputValue(), title);
      if (name !== "fifth-exam") await source.locator(".graph-box svg").first().waitFor();
      const selected = name === "long-math" ? source.getByText("المسألة 10 · تمثيل الدوال", { exact: true }) : null;
      if (selected) await selected.click();
      await button("طباعة / PDF").click();
      await page.getByRole("region", { name: "معاينة الطباعة" }).getByText(/صفحة A4/).waitFor();
      const sheets = await page.locator(".print-sheet").count();
      assert.ok(sheets >= (name === "long-math" ? 10 : 1));
      if (selected) assert.equal(await page.locator('[data-studio-print-anchor]').textContent(), "المسألة 10 · تمثيل الدوال");
      if (engine === chromium) {
        writeFileSync(join(output, `${name}.mathdoc`), json);
        const path = join(output, `${name}.pdf`);
        await page.pdf({ path, preferCSSPageSize: true, printBackground: true });
        const info = execFileSync("pdfinfo", [path], { encoding: "utf8" });
        assert.equal(Number(info.match(/^Pages:\s+(\d+)/m)?.[1]), sheets);
      }
    }

    for (const [name, options] of [
      ["desktop", { viewport: { width: 1366, height: 768 } }],
      ["ipad-portrait", devices["iPad (gen 7)"]],
      ["ipad-landscape", devices["iPad (gen 7) landscape"]]
    ]) {
      const surface = await browser.newPage(options);
      await surface.goto(url);
      await surface.locator(".pg-last").waitFor();
      assert.equal(await surface.locator(".version").textContent(), "v" + require("./package.json").version);
      assert.equal(await surface.evaluate(() => document.documentElement.scrollWidth), surface.viewportSize().width);
      await surface.screenshot({ path: join(output, `studio-${engine.name()}-${name}.png`) });
      await surface.close();
    }
    console.log(`Studio samples and responsive checks passed in ${engine.name()}: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
