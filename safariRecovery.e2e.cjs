const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const { join } = require("node:path");
const { chromium, webkit } = require("playwright-core");

const url = process.env.MATHPRESS_QA_URL || "http://localhost:4174/";
const output = process.env.MATHPRESS_QA_OUTPUT || "/tmp/mathpress-safari-recovery";
const engine = process.argv[2] === "webkit" ? webkit : chromium;

async function run() {
  await mkdir(output, { recursive: true });
  const browser = await engine.launch(engine === chromium && process.env.MATHPRESS_CHROMIUM
    ? { executablePath: process.env.MATHPRESS_CHROMIUM } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true });
    await page.goto(url);
    await page.getByRole("button", { name: "معلومات الإصدار" }).click();
    const build = page.getByRole("dialog", { name: "معلومات الإصدار" });
    await build.getByText(`v${require("./package.json").version}`, { exact: true }).waitFor();
    await build.getByText(/^(local|[a-f0-9]{40})$/).waitFor();
    await build.getByText(/^\d{4}-\d{2}-\d{2}T/).waitFor();
    await build.getByRole("button", { name: "إغلاق" }).click();
    await page.getByRole("button", { name: "القوالب", exact: true }).click();
    await page.getByRole("button", { name: /القطوع المخروطية/ }).click();
    await page.locator(".editor-source .graph-box svg").nth(3).waitFor();
    await page.getByRole("tab", { name: "ملف", exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير المستند كملف قابل للتحرير" }).click();
    const backup = await download;
    const reference = JSON.parse(await readFile(await backup.path(), "utf8"));
    for (const n of [4, 1, 10, 50, 100]) {
      const workbook = n === 10 ? JSON.parse(await readFile(join(__dirname, "experiments", "fixtures", "workbook-10.mathdoc"), "utf8")) : null;
      const content = workbook ? workbook.content.content : n === 4 ? reference.content.content : Array.from({ length: n }, (_, i) => [
        ...(i ? [{ type: "pageBreak" }] : []),
        { type: "paragraph", content: [{ type: "text", text: `PAGE-${i + 1} محتوى تعليمي` }] },
      ]).flat();
      if (n === 1) content.push({ type: "image", attrs: {
        src: "data:image/png;base64," + (await readFile(join(__dirname, "icon-512.png"))).toString("base64"),
        widthMm: 48, rotation: 25, cropTop: 18, cropLeft: 25, opacity: .85, align: "center",
      } });
      const data = { ...reference, schemaVersion: 6, id: randomUUID(), title: workbook?.title ?? `مرجع القطوع ${n}`, footerText: "FOOTERTEST",
        showPageNumbers: true, watermark: { kind: "text", value: "معاينة", opacity: .12, rotation: -35, size: 52, position: "center", pages: "all", repeat: false, color: "#193c6b" }, content: { type: "doc", content } };
      if (n === 4 && engine === chromium)
        await writeFile(join(output, "conics-reference.mathdoc"), JSON.stringify(data, null, 2));
      const importer = page.locator('input[accept^=".mathdoc"]');
      if (!await importer.count()) await page.getByRole("tab", { name: "ملف", exact: true }).click();
      await importer.setInputFiles({
        name: "safari-reference.mathdoc", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data))
      });
      await page.waitForFunction(title => document.querySelector(".document-title-input")?.value === title, data.title);
      if (n === 4) await page.locator(".editor-source .graph-box svg").nth(3).waitFor();
      await page.getByRole("button", { name: "طباعة / PDF", exact: true }).click();
      const preview = page.getByRole("region", { name: "معاينة الطباعة" });
      await preview.getByText(`${n} صفحة A4`, { exact: true }).waitFor();
      const sheets = page.locator(".print-sheet");
      assert.equal(await sheets.count(), n);
      if (n === 4) assert.equal(await sheets.locator(".graph-box svg").count(), 4);
      assert.equal(await sheets.locator(".page-watermark").count(), n);
      if (n === 4) {
        await page.evaluate(() => { window.print = () => { throw new Error("Independent PDF must not call window.print"); }; });
        await preview.getByRole("button", { name: "تصدير PDF تجريبي" }).click();
        const exportDialog = page.getByRole("dialog", { name: "تصدير PDF نقطي تجريبي" });
        if (engine === chromium) {
          await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
          await page.context().setOffline(true);
        }
        await exportDialog.getByRole("button", { name: "إنشاء PDF" }).click();
        const downloadLink = exportDialog.getByRole("link", { name: "تنزيل PDF" });
        await downloadLink.or(exportDialog.getByRole("alert")).first().waitFor({ timeout: 60_000 });
        assert.deepEqual(await exportDialog.getByRole("alert").allTextContents(), []);
        if (engine === chromium) await page.screenshot({ path: join(output, "raster-export-dialog.png") });
        const result = page.waitForEvent("download");
        await downloadLink.click();
        const file = join(output, `conics-raster-${engine.name()}.pdf`);
        await (await result).saveAs(file);
        const info = execFileSync("pdfinfo", [file], { encoding: "utf8" });
        assert.match(info, /^Pages:\s+4$/m);
        assert.match(info, /Page size:\s+595\.\d+ x 841\.\d+/);
        const embedded = execFileSync("pdfimages", ["-list", file], { encoding: "utf8" });
        assert.equal((embedded.match(/\bimage\s+2480\s+3508\b/g) ?? []).length, 4);
        await exportDialog.getByRole("button", { name: "إغلاق" }).click();
        if (engine === chromium) await page.context().setOffline(false);
      }
      if (n === 1 && engine === chromium) {
        await writeFile(join(output, "cropped-rotated-reference.mathdoc"), JSON.stringify(data, null, 2));
        await preview.getByRole("button", { name: "تصدير PDF تجريبي" }).click();
        const dialog = page.getByRole("dialog", { name: "تصدير PDF نقطي تجريبي" });
        for (const [dpi, w, h] of [[150, 1240, 1754], [216, 1786, 2526], [300, 2480, 3508], [450, 3720, 5262], [600, 4961, 7016]]) {
          await dialog.getByLabel("الدقة").selectOption(String(dpi));
          const start = Date.now();
          await dialog.getByRole("button", { name: "إنشاء PDF" }).click();
          const download = dialog.getByRole("link", { name: "تنزيل PDF" });
          await download.or(dialog.getByRole("alert")).first().waitFor({ timeout: 60_000 });
          assert.deepEqual(await dialog.getByRole("alert").allTextContents(), []);
          const save = page.waitForEvent("download");
          await download.click();
          const file = join(output, `cropped-rotated-${dpi}.pdf`);
          await (await save).saveAs(file);
          const embedded = execFileSync("pdfimages", ["-list", file], { encoding: "utf8" });
          assert.match(embedded, new RegExp(`image\\s+${w}\\s+${h}\\b`));
          console.log("cropped and rotated", dpi, w, h, Date.now() - start, "ms", (await readFile(file)).length, "bytes");
        }
        await dialog.getByRole("button", { name: "إغلاق" }).click();
      }
      if (n === 10 && engine === chromium) {
        await writeFile(join(output, "workbook-10.mathdoc"), JSON.stringify(data, null, 2));
        await preview.getByRole("button", { name: "تصدير PDF تجريبي" }).click();
        const dialog = page.getByRole("dialog", { name: "تصدير PDF نقطي تجريبي" });
        const metrics = [];
        const client = await page.context().newCDPSession(page);
        const measure = async () => metrics.push((await client.send("Runtime.getHeapUsage")).usedSize);
        await measure();
        const sampler = setInterval(() => void measure().catch(() => {}), 200);
        const start = Date.now();
        try {
          await dialog.getByRole("button", { name: "إنشاء PDF" }).click();
          const link = dialog.getByRole("link", { name: "تنزيل PDF" });
          await link.or(dialog.getByRole("alert")).first().waitFor({ timeout: 120_000 });
          assert.deepEqual(await dialog.getByRole("alert").allTextContents(), []);
          const download = page.waitForEvent("download");
          await link.click();
          const file = join(output, "workbook-10-300.pdf");
          await (await download).saveAs(file);
          assert.match(execFileSync("pdfinfo", [file], { encoding: "utf8" }), /^Pages:\s+10$/m);
          const embedded = execFileSync("pdfimages", ["-list", file], { encoding: "utf8" });
          assert.equal((embedded.match(/\bimage\s+2480\s+3508\b/g) ?? []).length, 10);
          const report = { pages: 10, dpi: 300, elapsedMs: Date.now() - start, bytes: (await readFile(file)).length,
            sampledJsHeapBeforeBytes: metrics[0], sampledJsHeapPeakBytes: Math.max(...metrics) };
          await writeFile(join(output, "workbook-10-metrics.json"), JSON.stringify(report, null, 2));
          console.log("10-page workbook", report);
        } finally {
          clearInterval(sampler);
          await client.detach();
        }
        await dialog.getByRole("button", { name: "إنشاء PDF" }).click();
        await dialog.getByRole("button", { name: "إلغاء التصدير" }).click();
        await dialog.getByRole("alert").getByText("أُلغي التصدير.").waitFor();
        assert.equal(await dialog.getByRole("link", { name: "تنزيل PDF" }).count(), 0);
        assert.equal(await sheets.count(), 10);
        await dialog.getByRole("button", { name: "إغلاق" }).click();
      }
      await page.emulateMedia({ media: "print" });
      const physicalGeometry = await sheets.evaluateAll(nodes => nodes.every(sheet => {
        const rect = sheet.getBoundingClientRect();
        const footer = sheet.querySelector(".pg-footer");
        return Math.abs(rect.left) < 1 && rect.width < 795 &&
          Math.abs(footer.getBoundingClientRect().bottom - rect.bottom) < 1 &&
          getComputedStyle(footer).position === "absolute";
      }));
      if (engine === chromium) {
        const file = join(output, `safari-reference-${n}.pdf`);
        await page.context().setOffline(true);
        try {
          await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
        } finally {
          await page.context().setOffline(false);
        }
        const info = execFileSync("pdfinfo", [file], { encoding: "utf8" });
        assert.match(info, new RegExp(`^Pages:\\s+${n}$`, "m"));
        const pages = execFileSync("pdftotext", [file, "-"], { encoding: "utf8" }).split("\f").filter(Boolean);
        assert.equal(pages.length, n);
        for (const [index, sheet] of pages.entries()) {
          assert.match(sheet, /FOOTERTEST/);
          assert.doesNotMatch(sheet, /https?:\/\//);
          if (n !== 4 && n !== 10) assert.match(sheet, new RegExp(`PAGE-${index + 1}(?![0-9])`));
        }
        if (n === 4) {
          assert.match(execFileSync("pdffonts", [file], { encoding: "utf8" }), /NotoNaskhArabic.*yes\s+yes\s+yes/);
          const bbox = execFileSync("pdftotext", ["-bbox", file, "-"], { encoding: "utf8" });
          const words = [...bbox.matchAll(/<word xMin="([\d.-]+)" yMin="[\d.-]+" xMax="([\d.-]+)"/g)];
          assert.ok(words.length > 30);
          assert.ok(words.every(([, left, right]) => +left >= 0 && +right <= 595.5));
        }
      }
      assert.ok(physicalGeometry, "The print sheet must start at x=0 and contain its own absolute footer");
      await page.emulateMedia({ media: "screen" });
      await page.getByRole("button", { name: "العودة للتحرير" }).click();
      console.log(engine.name(), n, "sheets: origin and footer verified");
    }
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
