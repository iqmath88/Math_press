const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");
const { chromium, webkit, devices } = require("playwright-core");

const url = process.env.MATHPRESS_QA_URL || "http://127.0.0.1:4174/";
const engine = process.argv[2] === "webkit" ? webkit : chromium;
const mode = process.argv[3];
const text = value => ({ type: "text", text: value });
const math = latex => ({ type: "mathInline", attrs: { latex } });
const paragraph = (content, attrs) => ({ type: "paragraph", attrs, content });

async function importDoc(page, content) {
  await page.getByRole("tab", {name:"ملف", exact:true}).click();
  await page.locator('input[accept^=".mathdoc"]').setInputFiles({
    name: "stability.mathdoc", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      format: "mathpress", schemaVersion: 3, id: randomUUID(), title: "Stability fixture",
      headerText: "STABILITY HEADER", footerText: "STABILITY FOOTER", showPageNumbers: true,
      content: {type: "doc", content},
    })),
  });
  await page.waitForFunction(() =>
    document.querySelector(".document-title-input")?.value === "Stability fixture" &&
    !!document.querySelector(".editor-source .mp-editor")?.editor);
}

async function checkFocus(page, touch) {
  await importDoc(page, ["rtl", "ltr"].map(dir => paragraph([
    text("قبل "), math(String.raw`\frac{a}{b}`), math(String.raw`\sqrt{x}`),
    math(String.raw`\begin{bmatrix}a&b\\c&d\end{bmatrix}`), text(" بعد"),
  ], {dir})));
  await page.locator('.editor-source p[dir="ltr"] math-field').last().waitFor();
  if (mode === "history") await page.evaluate(() => {
    const editor = document.querySelector(".editor-source .mp-editor").editor;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) window.recordHistoryKey({ change: transaction.steps.map(step => step.toJSON()),
        stored: editor.state.doc.textContent, undo: editor.can().undo() });
    });
  });
  for (const dir of ["rtl", "ltr"]) {
    const row = page.locator(`.editor-source p[dir="${dir}"]`);
    const field = row.locator("math-field").first();
    await field[touch ? "tap" : "click"]({timeout: 4000});
    await row.locator("math-field:focus").first().waitFor({timeout: 4000});
    const original = await field.evaluate(node => node.value);
    if (touch) {
      const exit = row.getByRole("button", {name:"العودة إلى النص"});
      await exit.tap();
    } else {
      await page.keyboard.press("Escape");
    }
    await page.locator(".editor-source .mp-editor:focus").waitFor({timeout:4000});
    await page.keyboard.insertText(" نص تالٍ ");
    assert.equal(await field.evaluate(node => node.value), original);
    const editOrder = await row.evaluate(node => [...node.childNodes].flatMap(child => {
      if (child.nodeType === Node.TEXT_NODE) return child.textContent.trim() ? [child.textContent.trim()] : [];
      const field = child.querySelector?.("math-field");
      return field ? [field.value] : [];
    }));
    assert.deepEqual(editOrder, ["قبل", original, "نص تالٍ", String.raw`\sqrt{x}`, await row.locator("math-field").last().evaluate(node => node.value), "بعد"]);
    const activeField = row.locator("math-field:focus");
    const focus = async field => {
      await field.focus();
      await activeField.waitFor({timeout:4000});
      assert.ok(await field.evaluate(node => node === document.activeElement));
    };
    const values = () => row.locator("math-field").evaluateAll(nodes => nodes.map(node => node.value));
    const all = await values();
    await focus(row.locator("math-field").nth(1));
    await row.locator("math-field").nth(1).evaluate(node => {node.position=1;});
    await page.keyboard.press("Tab");
    await focus(row.locator("math-field").nth(2));
    await row.locator("math-field").nth(2).evaluate(node => {node.position=node.lastOffset;});
    await page.keyboard.press("Shift+Tab");
    assert.deepEqual(await values(), all);
    const last = row.locator("math-field").last();
    await focus(last);
    await last.evaluate(node => {node.position=node.lastOffset;});
    await page.keyboard.press("ArrowRight");
    await page.locator(".editor-source .mp-editor:focus").waitFor({timeout:4000});
    await page.keyboard.press("ArrowLeft");
    await row.locator("math-field:focus").waitFor({timeout: 4000});
    assert.ok(await last.evaluate(node => node === document.activeElement));
    await page.keyboard.press("Escape");
  }
  await page.waitForFunction(() => {
    const source = document.querySelector(".editor-source .mp-editor");
    return source === document.activeElement && source.editor.can().undo();
  });
  const historyShortcut = await page.evaluate(() => /Mac|iP(hone|[oa]d)/.test(navigator.platform) ? "Meta" : "Control");
  const hasEdit = expected => page.waitForFunction(value => {
    const row = document.querySelector('.editor-source p[dir="ltr"]');
    return !!row && row.textContent.includes("نص تالٍ") === value;
  }, expected, {timeout:4000});
  await page.keyboard.press(historyShortcut + "+z");
  await hasEdit(false);
  await page.keyboard.press(historyShortcut + "+Shift+z");
  await hasEdit(true);
}

async function checkPrint(page) {
  const joined = "نص عربي لاختبار إبقاء الفقرة معًا. ".repeat(35).trim();
  const lines = Array.from({length: 44}, (_, i) => `LINE${String(i + 1).padStart(2,"0")}`);
  const long = lines.flatMap((token,i) => [
    ...(i ? [{type:"hardBreak"}] : []), text(token),
    ...(i === 21 ? [math(String.raw`\frac{3}{7}`)] : []),
  ]);
  await importDoc(page, [
    ...Array.from({length:18},()=>paragraph([text("تمهيد للفقرة التالية")])),
    paragraph([text(joined)], {paragraphFormat:{keepLines:true, widows:true}}),
    {type:"pageBreak"},
    ...Array.from({length:25},()=>paragraph([text("تمهيد للفقرة الممتدة")])),
    paragraph(long, {paragraphFormat:{keepLines:true, widows:true}}),
  ]);
  await page.getByRole("button",{name:"طباعة / PDF",exact:true}).click();
  await page.getByRole("region",{name:"معاينة الطباعة"}).getByText(/صفحة A4/).waitFor();
  const kept = page.locator(".print-pages p[data-paragraph-format]").filter({hasText:"إبقاء الفقرة"});
  assert.equal(await kept.count(),1,"A paragraph fitting a full sheet must stay intact");
  assert.equal(await kept.textContent(),joined);
  const fragments = await page.locator(".print-pages p[data-paragraph-format]").filter({hasText:/LINE\d{2}/}).allTextContents();
  assert.ok(fragments.length > 1);
  assert.ok(fragments.every(fragment => (fragment.match(/LINE\d{2}/g) || []).length >= 2), "no single-line fragment");
  assert.deepEqual(fragments.join("").match(/LINE\d{2}/g), lines);
  assert.deepEqual(await page.locator(".print-pages math-field").evaluateAll(fields => fields.map(node => node.value)), [String.raw`\frac{3}{7}`]);
  const sheets = page.locator(".print-sheet");
  for (const [i,sheet] of (await sheets.all()).entries()) {
    assert.ok((await sheet.locator(".print-sheet-content").textContent()).trim());
    assert.equal(await sheet.locator(".pg-footer-num").textContent(), `صفحة ${i+1} من ${await sheets.count()}`);
  }
  if (engine === chromium && process.env.MATHPRESS_QA_OUTPUT) {
    const file = join(process.env.MATHPRESS_QA_OUTPUT, "paragraph-stability.pdf");
    await page.pdf({path:file,preferCSSPageSize:true});
    assert.match(execFileSync("pdfinfo", [file], {encoding:"utf8"}), new RegExp(`^Pages:\\s+${await sheets.count()}$`,"m"));
    assert.deepEqual(execFileSync("pdftotext", ["-layout",file,"-"], {encoding:"utf8"}).match(/LINE\d{2}/g), lines);
  }
}

(async () => {
  const browser = await engine.launch(engine === chromium && process.env.MATHPRESS_CHROMIUM
    ? {executablePath:process.env.MATHPRESS_CHROMIUM} : {});
  try {
    if (mode !== "math" && mode !== "history") {
      const page = await browser.newPage({viewport:{width:1440,height:1000}});
      await page.goto(url);
      await checkPrint(page);
      await page.close();
    }
    if (mode !== "print") {
      const rounds = mode === "history" ? 30 : 1;
      const failures = [];
      for (let round = 1; round <= rounds; round++) {
        const viewports = [
          {viewport:{width:1440,height:1000}}, devices["iPad (gen 7)"], devices["iPad (gen 7) landscape"],
        ];
        for (const options of mode === "history" ? [viewports[(round - 1) % viewports.length]] : viewports) {
          const page = await browser.newPage(options);
          const trace = [];
          if (mode === "history") {
            await page.exposeFunction("recordHistoryKey", event => trace.push(event));
            await page.addInitScript(() => document.addEventListener("keydown", event => {
              if (event.key !== "Escape" && !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z")) return;
              const editor = document.querySelector(".mp-editor")?.editor;
              window.recordHistoryKey({ key: event.key, target: event.target.tagName,
                active: document.activeElement?.tagName, platform: navigator.platform, undo: editor?.can().undo(),
                position: editor?.state.selection.from });
            }, true));
          }
          try {
            await page.goto(url);
            await checkFocus(page, !!options.hasTouch);
          } catch (error) {
            if (mode !== "history") throw error;
            failures.push({ round, viewport: options.viewport, error: String(error), trace });
            console.log("History failure", JSON.stringify(failures.at(-1)));
          } finally { await page.close(); }
        }
        if (mode === "history") console.log(`History round ${round}/${rounds}`);
      }
      assert.equal(failures.length, 0, `${failures.length} history scenarios failed across ${rounds} rounds`);
    }
    console.log(`${engine.name()} ${browser.version()} stability ${mode || "print and focus (desktop and both iPad orientations)"} passed`);
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
