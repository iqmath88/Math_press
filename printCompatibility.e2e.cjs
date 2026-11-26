const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { chromium, webkit, devices } = require("playwright-core");

const url = process.env.MATHPRESS_QA_URL || "http://127.0.0.1:4174/";
const engine = process.argv[2] === "webkit" ? webkit : chromium;
const output = process.env.MATHPRESS_QA_OUTPUT || mkdtempSync(join(tmpdir(), "mathpress-compat-"));
const tablet = devices["iPad (gen 7)"];
const latex = [String.raw`\text{س}^2+\text{ص}^2=\text{ن}^2`, String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`];
const text = value => ({ type: "text", text: value });
const paragraph = (...content) => ({ type: "paragraph", content });
const expression = (type, value) => ({ type, attrs: { latex: value } });
const row = (type, ...labels) => ({
  type: "tableRow", content: labels.map(label => ({ type, content: [paragraph(text(label))] })),
});

async function run() {
  const browser = await engine.launch(engine === chromium && process.env.MATHPRESS_CHROMIUM
    ? { executablePath: process.env.MATHPRESS_CHROMIUM } : {});
  try {
    for (const orientation of ["portrait", "landscape"]) {
      const viewport = orientation === "portrait" ? tablet.viewport
        : { width: tablet.viewport.height, height: tablet.viewport.width };
      const page = await browser.newPage({
        viewport, hasTouch: true, isMobile: true, deviceScaleFactor: tablet.deviceScaleFactor,
      });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(url);
      await page.locator(".pg-last").waitFor();
      assert.equal(await page.locator(".version").textContent(), "v0.5.0");
      await page.getByRole("tab", { name: "ملف", exact: true }).tap();
      const content = [
        paragraph(text("BODYLEFT بداية المعادلة "), expression("mathInline", latex[0]), text(" نهاية")),
        expression("mathBlock", latex[1]),
        ...(orientation === "portrait" ? [{ type: "graph" }] : []),
        { type: "pageBreak" },
        { type: "table", content: [
          row("tableHeader", "HEADTABLE", "معادلات"),
          ...Array.from({ length: 46 }, (_, index) => row("tableCell", `CELL${String(index + 1).padStart(2, "0")}`, "بيانات")),
        ] },
        paragraph(text("TAILMARK"), expression("mathInline", latex[0])),
      ];
      const fixture = {
        format: "mathpress", schemaVersion: 3, id: randomUUID(), title: "تدقيق الطباعة",
        page: { size: "A4", orientation, marginsMm: { top: 17, right: 27, bottom: 23, left: 13 } },
        headerText: "HEADERMARK", footerText: "FOOTERMARK", showPageNumbers: true,
        content: { type: "doc", content }, updatedAt: new Date().toISOString(),
      };
      if (engine === chromium) writeFileSync(join(output, `compat-${orientation}.mathdoc`), JSON.stringify(fixture, null, 2));
      await page.locator('input[accept^=".mathdoc"]').setInputFiles({
        name: "compatibility.mathdoc", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)),
      });
      const editor = page.locator(".editor-source");
      await editor.locator("table").waitFor();
      if (orientation === "portrait") await editor.locator(".graph-box svg").waitFor();
      const fields = await editor.locator("math-field").evaluateAll(nodes =>
        nodes.map(node => ({ latex: node.value, width: node.getBoundingClientRect().width, shadow: !!node.shadowRoot })));
      assert.equal(fields.length, 3);
      assert.match(fields[0].latex, /س.*ص.*ن/);
      assert.match(fields[1].latex, /\\frac.*\\sqrt/);
      assert.ok(fields.every(field => field.width > 20 && field.shadow));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width);
      await page.screenshot({ path: join(output, `${engine.name()}-${orientation}-editor.png`) });
      await page.getByRole("button", { name: "طباعة / PDF", exact: true }).tap();
      const preview = page.getByRole("region", { name: "معاينة الطباعة" });
      await preview.getByText(/صفحة A4/).waitFor();
      const sheets = page.locator(".print-sheet");
      const pages = await sheets.count();
      assert.ok(pages >= 3);
      assert.equal(await sheets.locator("table thead").count(), pages - 1);
      assert.deepEqual(await sheets.locator("math-field").evaluateAll(nodes => nodes.map(node => node.value)),
        fields.map(field => field.latex));
      if (orientation === "portrait") {
        const graph = sheets.locator(".graph-box svg");
        assert.equal(await graph.count(), 1);
        assert.equal(await graph.evaluate(svg => [...svg.querySelectorAll("[id]")].every(
          node => document.getElementById(node.id) === node && node.id.startsWith("print-"))), true);
      }
      const layout = () => sheets.evaluateAll(nodes => nodes.map(sheet => {
        const rect = sheet.getBoundingClientRect();
        const header = sheet.querySelector("header").getBoundingClientRect();
        const footer = sheet.querySelector("footer").getBoundingClientRect();
        const body = sheet.querySelector(".print-sheet-content");
        const css = getComputedStyle(body);
        return {
          width: rect.width, height: rect.height, header: header.height, footer: footer.height,
          left: parseFloat(css.paddingLeft), right: parseFloat(css.paddingRight),
          number: sheet.querySelector(".pg-footer-num").textContent,
          headerText: sheet.querySelector("header").textContent,
          footerText: sheet.querySelector("footer span").textContent,
        };
      }));
      const screen = await layout();
      const px = mm => mm * 96 / 25.4;
      for (const [index, dimensions] of screen.entries()) {
        assert.ok(Math.abs(dimensions.width - px(orientation === "portrait" ? 210 : 297)) < 1);
        assert.ok(Math.abs(dimensions.height - px(orientation === "portrait" ? 297 : 210)) < 1);
        for (const [property, mm] of Object.entries({ header: 17, footer: 23, left: 13, right: 27 }))
          assert.ok(Math.abs(dimensions[property] - px(mm)) < 1, property);
        assert.equal(dimensions.number, `صفحة ${index + 1} من ${pages}`);
        assert.equal(dimensions.headerText, fixture.headerText);
        assert.equal(dimensions.footerText, fixture.footerText);
      }
      await page.screenshot({ path: join(output, `${engine.name()}-${orientation}-preview.png`) });
      await page.emulateMedia({ media: "print" });
      assert.deepEqual(await layout(), screen);
      if (engine === chromium) {
        const file = join(output, `compat-${orientation}.pdf`);
        await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
        const info = execFileSync("pdfinfo", [file], { encoding: "utf8" });
        assert.match(info, new RegExp(`^Pages:\\s+${pages}$`, "m"));
        const [width, height] = info.match(/Page size:\s+([\d.]+) x ([\d.]+)/).slice(1).map(Number);
        assert.equal(width > height, orientation === "landscape");
        const print = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }).trim().split("\f");
        assert.equal(print.length, pages);
        assert.match(print[0], /√/u);
        assert.match(print[0], /±/u);
        for (const letter of ["س", "ص", "ن"]) assert.ok(print[0].includes(letter), letter);
        for (const [index, sheet] of print.entries()) {
          assert.match(sheet, /HEADERMARK/);
          assert.match(sheet, /FOOTERMARK/);
          assert.match(sheet, new RegExp(`(?<!\\d)${index + 1}(?!\\d)`));
          if (index) assert.match(sheet, /HEADTABLE/);
        }
        assert.deepEqual(print.join("").match(/CELL\d{2}/g),
          Array.from({ length: 46 }, (_, i) => `CELL${String(i + 1).padStart(2, "0")}`));
        const bbox = execFileSync("pdftotext", ["-bbox", file, "-"], { encoding: "utf8" });
        const bounds = (label) => {
          const match = bbox.match(new RegExp(`xMin="([\\d.]+)" yMin="([\\d.]+)" xMax="([\\d.]+)" yMax="([\\d.]+)">${label}</word>`));
          return match.slice(1).map(Number);
        };
        const points = mm => mm * 72 / 25.4;
        assert.ok(Math.abs(width - bounds("HEADERMARK")[2] - points(27)) < 2);
        assert.ok(bounds("HEADERMARK")[1] < points(17));
        assert.ok(bounds("FOOTERMARK")[1] > height - points(23));
      }
      assert.deepEqual(errors, []);
      console.log(`${engine.name()} ${browser.version()} iPad ${orientation} ${viewport.width}×${viewport.height}: ${pages} A4 sheets, RTL/LTR math and print geometry passed`);
      await page.close();
    }
    console.log(`Artifacts: ${output}`);
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
