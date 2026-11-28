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
const { chromium } = require("playwright-core");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch(launch);
  try {
    const page = await browser.newPage({
      viewport: { width: 1400, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(baseURL);
    await page.locator(".pg-last").waitFor({ timeout: 90000 });
    const body = page.locator(".mp-editor");
    const paragraph = body.locator("p").first();
    await paragraph.click({
      position: { x: (await paragraph.boundingBox()).width - 10, y: 12 },
    });
    await page.getByRole("tab", { name: "أنماط" }).click();
    await page.getByText("أنماط الفقرات البسيطة",{exact:true}).click();
    await page.getByLabel("تطبيق نمط تعليمي").selectOption("question");
    assert.equal(
      await body.locator('p[data-educational-style="question"]').count(),
      1,
    );
    const math = body.locator('[data-educational-style="question"] math-field');
    assert.equal(await math.evaluate((n) => n.value), "f(x)=x^2-4");
    await page.getByRole("button", { name: "إدارة الأنماط" }).click();
    await page.getByLabel("النمط الحالي").selectOption("question");
    await page.getByLabel("الاسم", { exact: true }).fill("سؤال الجبر");
    await page.getByLabel("لون النص", { exact: true }).fill("#102030");
    await page.getByRole("button", { name: "حفظ النمط" }).click();
    await page.getByText("تم حفظ النمط في المستند.").waitFor();
    await page.screenshot({ path: path.join(output, "styles.png") });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "إغلاق", exact: true })
      .click();
    assert.equal(
      await body
        .locator('[data-educational-style="question"]')
        .evaluate((n) => getComputedStyle(n).color),
      "rgb(16, 32, 48)",
    );
    await body.press("Control+f");
    const search = page.getByRole("region", { name: "بحث واستبدال" });
    await search
      .getByRole("textbox", { name: "بحث", exact: true })
      .fill("الشرح");
    await search.getByText("1 نتيجة").waitFor();
    await search.getByRole("textbox", { name: "استبدال بـ" }).fill("البرهان");
    await search.getByRole("button", { name: "استبدال الكل" }).click();
    assert.match(await body.innerText(), /البرهان/);
    await search
      .getByRole("textbox", { name: "بحث", exact: true })
      .fill("x^2-4");
    await search
      .getByRole("checkbox", { name: "مصادر LaTeX (بحث فقط)" })
      .check();
    await search.getByText("1 نتيجة").waitFor();
    assert.ok(
      await search.getByRole("button", { name: "استبدال الكل" }).isDisabled(),
    );
    await search.getByRole("button", { name: "إغلاق" }).click();
    await page.getByText("محفوظ محليًا", { exact: true }).waitFor();
    await page.reload();
    await page.getByRole("tab", { name: "ملف" }).click();
    await page
      .getByRole("button", { name: /المستندات المحفوظة|المكتبة/ })
      .click();
    const saved = page
      .locator(".library-open")
      .filter({ hasText: "ملزمة رياضيات" });
    assert.ok((await saved.count()) >= 1);
    // The recently opened fresh starter may sort first after reload.
    await saved.last().click();
    await body.locator('[data-educational-style="question"]').waitFor();
    assert.match(await body.innerText(), /البرهان/);
    assert.equal(await math.evaluate((n) => n.value), "f(x)=x^2-4");
    await page.screenshot({ path: path.join(output, "after.png") });
    await page.getByRole("tab", { name: "إدراج", exact: true }).click();
    await page.getByRole("button", { name: "رسم بياني أو هندسي" }).click();
    await page
      .getByRole("dialog", { name: "الرسم البياني" })
      .getByRole("button", { name: "إدراج الرسم" })
      .click();
    await body.locator(".graph-node svg").first().waitFor();
    await page.getByRole("button", { name: "إدراج جدول 3×3" }).click();
    await body.locator("table").waitFor();
    const insertTab = page.getByRole("tab", { name: "إدراج", exact: true });
    if ((await insertTab.getAttribute("aria-selected")) !== "true")
      await insertTab.click();
    await body.locator(":scope > p").last().click();
    await page.locator('input[accept="image/*"]').setInputFiles(path.join(__dirname, "icon-192.png"));
    const image = body.locator('img[alt="icon-192.png"]');
    await image.waitFor();
    assert.equal(await image.evaluate(async (element) => {
      await element.decode();
      return element.naturalWidth;
    }), 192);
    await page.getByRole("tab", { name: "الصفحة" }).click();
    await page
      .getByRole("button", { name: "هوامش مخصصة، الرأس والتذييل، الترقيم" })
      .click();
    await page.getByLabel("يمين", { exact: true }).fill("31");
    await page.getByLabel("يسار", { exact: true }).fill("13");
    await page.getByRole("button", { name: "تطبيق", exact: true }).click();
    assert.equal(
      await page
        .locator(".paper")
        .evaluate((el) => el.style.getPropertyValue("--pr")),
      "31mm",
    );
    await page.getByRole("tab", { name: "ملف" }).click();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "تصدير المستند كملف قابل للتحرير" })
      .click();
    const backup = await download;
    const backupPath = path.join(output, "backup.mathdoc");
    await backup.saveAs(backupPath);
    const backupData = JSON.parse(fs.readFileSync(backupPath, "utf8"));
    assert.equal(
      backupData.educationalStyles.find((style) => style.id === "question")
        .color,
      "#102030",
    );

    const JSZip = require("jszip");
    const word = new JSZip();
    word.file(
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>
    `,
    );
    word.file(
      "word/document.xml",
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>
      <w:p><w:r><w:t>ملف Word تجريبي</w:t></w:r><m:oMath><m:r><m:t>x+2</m:t></m:r></m:oMath></w:p>
      </w:body></w:document>`,
    );
    await page.locator('input[accept^=".docx"]').setInputFiles({
      name: "example.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: await word.generateAsync({ type: "nodebuffer" }),
    });
    await page
      .getByRole("dialog", { name: "تقرير الاستيراد" })
      .getByRole("button", { name: "متابعة" })
      .click();
    await body.getByText("ملف Word تجريبي", { exact: false }).waitFor();
    assert.equal(
      await body.locator("math-field").evaluate((el) => el.value),
      "x+2",
    );
    await page.getByRole("tab", { name: "ملف" }).click();
    await page.locator('input[accept^=".mathdoc"]').setInputFiles(backupPath);
    await body.locator('[data-educational-style="question"]').waitFor();
    assert.match(await body.innerText(), /البرهان/);
    await body.locator("table").waitFor();
    await body.locator("img").waitFor();
    const legacy = {
      format: "mathpress",
      schemaVersion: 1,
      id: "legacy-fixture",
      title: "مستند قديم للاختبار",
      content: [{ type: "paragraph", text: "محتوى النسخة القديمة" }],
      updatedAt: "2024-01-01T00:00:00Z",
    };
    await page.evaluate(
      (doc) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("mathpress-local", 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction("documents", "readwrite");
            tx.objectStore("documents").put(doc);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
          };
        }),
      legacy,
    );
    await page.reload();
    await page.getByRole("tab", { name: "ملف" }).click();
    await page
      .getByRole("button", { name: "المستندات المحفوظة على هذا الجهاز" })
      .click();
    await page
      .locator(".library-open")
      .filter({ hasText: legacy.title })
      .click();
    await body.getByText(legacy.content[0].text).waitFor();
    await page.getByText("محفوظ محليًا", { exact: true }).waitFor();
    await page.getByRole("tab", { name: "ملف" }).click();
    await page
      .getByRole("button", { name: "المستندات المحفوظة على هذا الجهاز" })
      .click();
    const migrationDownload = page.waitForEvent("download");
    await page
      .locator(".library-item")
      .filter({ hasText: legacy.title })
      .getByRole("button", { name: "نسخة قبل الترقية" })
      .click();
    const migratedBackupPath = path.join(output, "before-migration.mathdoc");
    await (await migrationDownload).saveAs(migratedBackupPath);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(migratedBackupPath, "utf8")),
      legacy,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Style application, live override, search, LaTeX protection, and reopen passed",
    );
    console.log(`Artifacts: ${output}`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
