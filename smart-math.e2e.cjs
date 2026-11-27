const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { join } = require("node:path");
const { writeFileSync } = require("node:fs");
const { chromium, webkit, devices } = require("playwright-core");
const engine = process.argv[2] === "webkit" ? webkit : chromium;
const base = process.env.MATHPRESS_QA_URL || "http://127.0.0.1:4174/";
const output = process.env.MATHPRESS_QA_OUTPUT;
const examples = [
  "C(h,k)", "x^2+y^2=r^2", String.raw`\frac{x+1}{x-1}`, String.raw`\sqrt{x^2+1}`,
  String.raw`\int_0^1 x^2 dx`, String.raw`\lim_{x\to0}\frac{\sin x}{x}`,
  String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`
];
const block = String.raw`\frac{dy}{dx}=3x^2`;

async function check(page, capture) {
  await page.goto(base);
  await page.getByRole("button", { name: "مستند فارغ", exact: true }).click();
  const editor = page.locator(".editor-source .tiptap");
  await editor.locator("p").first().click();
  const before = "نبدأ بالمعادلة ";
  await page.keyboard.insertText(before);
  const source = "$" + examples[0] + "$";
  const snapshot = () => editor.evaluate(root => root.editor.getJSON());
  await page.keyboard.insertText(source.slice(0, -1));
  await editor.evaluate(root => {
    window.smartUpdateCount = 0;
    const editor = root.editor;
    editor.on("update", () => window.smartUpdateCount++);
  });
  await page.keyboard.press("$");
  const field = editor.locator("math-field").first();
  await field.waitFor();
  assert.equal(await page.evaluate(() => window.smartUpdateCount), 1);
  assert.equal(await editor.evaluate(root => document.activeElement === root), true);
  assert.deepEqual((await snapshot()).content[0].content.map(node => node.text ?? node.attrs.latex), [before, examples[0]]);
  const mod = await page.evaluate(() => /Mac|iP(hone|[oa]d)/.test(navigator.platform) ? "Meta" : "Control");
  await page.keyboard.press(mod + "+z");
  await editor.getByText(before + source, { exact: true }).waitFor();
  assert.equal(await editor.locator("math-field").count(), 0);
  await page.keyboard.press(mod + "+Shift+z");
  await field.waitFor();

  await field.click();
  await editor.locator("math-field:focus").waitFor();
  await page.keyboard.press("End");
  await page.keyboard.type("+1");
  const latexIs = value => page.waitForFunction(expected =>
    document.querySelector(".editor-source .tiptap").editor.state.doc.firstChild.content.content.some(
      node => node.type.name === "mathInline" && node.attrs.latex === expected), value);
  await field.locator("..").getByRole("button", {name:"إلغاء تعديل المعادلة",exact:true}).click();
  await latexIs(examples[0]);
  assert.equal(await field.evaluate(node => node.value), examples[0]);
  await field.click();
  await editor.locator("math-field:focus").waitFor();
  await page.keyboard.press("End");
  await page.keyboard.type("+1");
  const newLatex = examples[0] + "+1";
  await page.waitForFunction(value => document.querySelector(".editor-source math-field")?.value === value, newLatex);
  await latexIs(examples[0]);
  await field.locator("..").getByRole("button", {name:"اعتماد والعودة إلى النص",exact:true}).click();
  await latexIs(newLatex);
  await page.keyboard.press(mod + "+z");
  await latexIs(examples[0]);
  assert.equal(await editor.locator("math-field").count(), 1);
  await page.keyboard.press(mod + "+Shift+z");
  await latexIs(newLatex);
  await page.waitForFunction(() => {
    const root = document.querySelector(".editor-source .tiptap");
    const sel = getSelection();
    const {state, view} = root.editor;
    return document.activeElement === root && state.selection.empty && sel?.isCollapsed &&
      root.contains(sel.anchorNode) && view.posAtDOM(sel.anchorNode, sel.anchorOffset) === state.selection.from;
  });
  await page.keyboard.insertText(" ثم العربية ");
  await editor.getByText(/ثم العربية/).waitFor();
  await page.keyboard.press(mod + "+z");
  await page.waitForFunction(() => !document.querySelector(".editor-source .tiptap").editor.state.doc.textContent.includes("ثم العربية"));
  await latexIs(newLatex);
  // Undo has moved the caret since Escape. A late field focus must still be ignored.
  await field.evaluate(node => HTMLElement.prototype.focus.call(node));
  await page.waitForFunction(() => document.querySelector(".editor-source .tiptap") === document.activeElement);
  await page.keyboard.press(mod + "+Shift+z");
  await editor.getByText(/ثم العربية/).waitFor();
  await latexIs(newLatex);

  const paste = value => editor.evaluate((root, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    root.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, value);
  await paste(examples.slice(1).map(latex => "$" + latex + "$").join(" ومنها "));
  await editor.locator("math-field").nth(6).waitFor();
  assert.deepEqual((await snapshot()).content[0].content.filter(node => node.type === "mathInline").map(node => node.attrs.latex),
    [newLatex, ...examples.slice(1)]);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("$$" + block + "$");
  await page.keyboard.press("$");
  await editor.locator(".math-block").waitFor();
  await page.keyboard.insertText("بعد المعادلة المستقلة");
  assert.equal((await snapshot()).content.find(node => node.type === "mathBlock").attrs.latex, block);
  await editor.getByText("بعد المعادلة المستقلة", { exact: true }).waitFor();
  if (capture) {
    await page.screenshot({ path: join(output, "smart-math-01.png") });
    await page.getByRole("button", { name: "طباعة / PDF", exact: true }).click();
    await page.getByRole("region", { name: "معاينة الطباعة" }).getByText(/صفحة A4/).waitFor();
    await page.pdf({ path: join(output, "smart-math.pdf"), preferCSSPageSize: true });
  }
}

async function documentContexts(page, editor) {
  const text = value => ({type:"text",text:value});
  const paragraph = value => ({type:"paragraph",content:[text(value)]});
  const list = (tag, label) => ({type:"orderedList", attrs: {educationalList:tag},
    content:[{type:"listItem",content:[paragraph(label)]}]});
  const document = {
    format:"mathpress", schemaVersion:3, id:randomUUID(), title:"Smart contexts",
    content:{type:"doc",content:[
      {type:"heading",attrs:{level:2},content:[text("عنوان Heading")]},
      paragraph("فقرة Paragraph"),
      list(null, "قائمة List"),
      {type:"table",content:[{type:"tableRow",content:[{type:"tableCell",content:[paragraph("جدول Cell")]}]}]},
      list("exam", "سؤال Exam"),
      list("solution", "خطوة Solution")
    ]}
  };
  await page.getByRole("tab", {name:"ملف",exact:true}).click();
  await page.locator('input[accept^=".mathdoc"]').setInputFiles({name:"contexts.mathdoc",mimeType:"application/json",
    buffer:Buffer.from(JSON.stringify(document))});
  await editor.getByText("عنوان Heading", {exact:true}).waitFor();
  for (const label of ["عنوان Heading","فقرة Paragraph","قائمة List","جدول Cell","سؤال Exam","خطوة Solution"]) {
    const row = editor.locator("p,h2").filter({hasText:label});
    await row.click();
    await editor.evaluate(root => {
      const editor = root.editor;
      const head = editor.state.selection.$head;
      editor.commands.setTextSelection(head.end());
    });
    await page.keyboard.insertText(" $x+2");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText("3");
    await page.keyboard.press("$");
    await page.keyboard.insertText("$y");
    await page.keyboard.press("$");
    const fields = row.locator("math-field");
    await fields.nth(1).waitFor();
    assert.deepEqual(await fields.evaluateAll(nodes => nodes.map(node => node.value)), ["x+3","y"]);
  }
  const last = editor.locator("math-field").last();
  await last.click();
  await editor.locator("math-field:focus").waitFor();
  await page.keyboard.insertText("$z$");
  assert.equal(await editor.locator("math-field").count(), 12);
}

async function visualTools(page, editor, blank, paste) {
  for (const origin of ["typed","paste","manual"]) {
    for (const block of [false,true]) {
      await blank();
      await editor.locator("p").first().click();
      await page.getByRole("button", {name:"لوحة الرياضيات",exact:true}).click();
      const tools = page.getByRole("region", {name:"لوحة التأليف الرياضي"});
      await tools.waitFor();
      const raw = "x+1";
      const delimiter = block ? "$$" : "$";
      if (origin === "typed") {
        await page.keyboard.insertText(delimiter + raw + delimiter.slice(0,-1));
        await page.keyboard.press("$");
      } else if (origin === "paste") {
        await paste(delimiter + raw + delimiter);
      } else {
        const insert = block ? tools.getByRole("button", {name:"معادلة مستقلة",exact:true})
          : page.getByRole("button", {name:"معادلة سطرية",exact:true});
        await insert.click();
        await editor.locator("math-field:focus").waitFor();
        await page.keyboard.type(raw);
        await page.keyboard.press("Escape");
      }
      const node = editor.locator(block ? ".math-block" : ".math-inline");
      const field = node.locator("math-field");
      await field.click();
      await editor.locator("math-field:focus").waitFor();
      assert.equal(await field.evaluate(el => el.value), raw);
      assert.equal(await page.getByRole("textbox",{name:"مصدر LaTeX"}).count(),0);
      await page.keyboard.press("End");
      await page.keyboard.type("+9");
      await node.getByRole("button",{name:"إلغاء تعديل المعادلة",exact:true}).click();
      assert.equal(await node.getAttribute("data-latex"),raw);
      assert.equal(await field.evaluate(el => el.value),raw);
      await field.click();
      await editor.locator("math-field:focus").waitFor();


      for (const [group,label,marker] of [
        ["structure","كسر","\\frac"],
        ["structure","أس","^"],
        ["structure","جذر تربيعي","\\sqrt"],
        ["calculus","تكامل محدد","\\int"],
        ["greek","ألفا","\\alpha"]
      ]) {
        const menu = tools.getByLabel("مجموعة القوالب الرياضية");
        if (await menu.inputValue() !== group) await menu.selectOption(group);
        await field.evaluate(el => { el.position = el.lastOffset; });
        await tools.getByRole("button",{name:label,exact:true}).click();
        assert.ok((await field.evaluate(el => el.value)).includes(marker), label);
      }
      const draft = await field.evaluate(el => el.value);
      assert.equal(await node.getAttribute("data-latex"),raw);
      await node.getByRole("button",{name:"اعتماد والعودة إلى النص",exact:true}).click();
      assert.equal(await node.getAttribute("data-latex"),draft);
      await page.keyboard.insertText("نص بعد المعادلة");
      await page.waitForFunction(() => {
        const root = document.querySelector(".editor-source .tiptap");
        const math = root.querySelector("math-field").closest(".math-node");
        const marker = "نص بعد المعادلة";
        const { view, state } = root.editor;
        const pos = view.posAtDOM(math.parentNode, Array.prototype.indexOf.call(math.parentNode.childNodes, math));
        const equation = state.doc.nodeAt(pos);
        if (equation?.type.name === "mathInline") return state.doc.nodeAt(pos + equation.nodeSize)?.text === marker;
        const after = equation && state.doc.nodeAt(pos + equation.nodeSize);
        return after?.type.name === "paragraph" && after.textContent === marker;
      });
      assert.equal(await editor.locator("math-field").count(),1);
    }
  }
}

async function edgeCases(page) {
  await page.goto(base);
  const blank = () => page.getByRole("button", {name:"مستند فارغ", exact:true}).click();
  await blank();
  const editor = page.locator(".editor-source .tiptap");
  const paragraph = () => editor.locator("p").first();
  await paragraph().click();
  const literal = String.raw`السعر $50.00 والدولار المهروب \$x\$ وغير المكتمل $y`;
  await page.keyboard.insertText(literal);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("$$");
  assert.equal(await editor.locator("math-field").count(), 0);
  assert.equal(await paragraph().textContent(), literal);
  const paste = (text, html) => editor.evaluate((root, data) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", data.text);
    if (data.html) clipboardData.setData("text/html", data.html);
    root.dispatchEvent(new ClipboardEvent("paste", {clipboardData, bubbles:true, cancelable:true}));
  }, {text, html});
  await blank();
  await paragraph().click();
  await paste("قبل $x$ وسط $$y^2$$ ثم $$z^2$$ نهاية",
    "<p><strong>قبل </strong>$x$ <em>وسط</em> $$y^2$$ ثم $$z^2$$ <strong>نهاية</strong></p>");
  assert.deepEqual(await editor.locator("math-field").evaluateAll(fields => fields.map(node => node.value)), ["x","y^2","z^2"]);
  assert.equal(await editor.locator("strong").first().textContent(), "قبل ");
  assert.equal(await editor.locator("em").textContent(), "وسط");
  assert.equal(await editor.locator("strong").last().textContent(), "نهاية");
  const mod = await page.evaluate(() => /Mac|iP(hone|[oa]d)/.test(navigator.platform) ? "Meta" : "Control");
  await page.keyboard.press(mod + "+z");
  await editor.getByText(/وسط.*\$\$y/).waitFor();
  assert.equal(await editor.locator("math-field").count(), 0);
  await page.keyboard.press(mod + "+Shift+z");
  await editor.locator("math-field").nth(2).waitFor();

  if (engine === chromium) {
    await blank();
    await paragraph().click();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", {text:"$x$", selectionStart:3, selectionEnd:3});
    await editor.getByText("$x$", {exact:true}).waitFor();
    assert.equal(await editor.locator("math-field").count(), 0);
    await cdp.send("Input.insertText", {text:"$x$"});
    await cdp.detach();
    assert.equal(await editor.locator("math-field").count(), 0);
  }

  await documentContexts(page, editor);
  await blank();
  await paragraph().click();
  await page.keyboard.insertText("$");
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText("x");
  await page.keyboard.press("$");
  assert.equal(await paragraph().textContent(), "x$");
  assert.equal(await editor.locator("math-field").count(), 0);
  await blank();
  await paragraph().click();
  await page.keyboard.insertText("$" + "x".repeat(2050));
  await page.keyboard.press("$");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(String.raw`$\frac{x`);
  await page.keyboard.press("$");
  assert.equal(await editor.locator("math-field").count(), 0);
  assert.equal(await paragraph().textContent(), "$" + "x".repeat(2050) + "$");

  await visualTools(page, editor, blank, paste);
  await page.getByRole("button", {name:"خصائص المستند", exact:true}).click();
  const preference = page.getByRole("checkbox", {name:"التحويل التلقائي للمعادلات"});
  await preference.uncheck();
  await blank();
  await paragraph().click();
  await page.keyboard.insertText("$x");
  await page.keyboard.press("$");
  await editor.getByText("$x$", {exact:true}).waitFor();
  assert.equal(await editor.locator("math-field").count(), 0);
  await page.reload();
  await page.getByRole("button", {name:"خصائص المستند", exact:true}).click();
  assert.equal(await preference.isChecked(), false);
}

(async () => {
  const browser = await engine.launch(engine === chromium && process.env.MATHPRESS_CHROMIUM
    ? { executablePath: process.env.MATHPRESS_CHROMIUM } : {});
  try {
    const results = {};
    for (const [name, viewport] of [["desktop", {viewport:{width:1440,height:960}}], ["ipad", devices["iPad (gen 7)"]]]) {
      const runs = results[name] = { passed: 0, failures: [] };
      for (let round = 1; round <= Number(process.env.MATHPRESS_ROUNDS ?? 30); round++) {
        const video = process.env.MATHPRESS_VIDEO === "1" && output && name === "desktop" && round === 1;
        const context = await browser.newContext({ ...viewport, ...(video ? { recordVideo: { dir: output } } : {}) });
        const page = await context.newPage();
        page.setDefaultTimeout(5000);
        try {
          await check(page, !!output && engine === chromium && name === "desktop" && round === 1);
          runs.passed++;
        } catch (error) { runs.failures.push({round, error: String(error.stack || error)}); }
        finally { await context.close(); }
      }
    }
    const edge = await browser.newPage();
    try { edge.setDefaultTimeout(5000); await edgeCases(edge); }
    finally { await edge.close(); }
    if (output) writeFileSync(join(output, "smart-math-results.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
    const summary = Object.fromEntries(Object.entries(results).map(([name, run]) => [name, {
      passed: run.passed, failures: run.failures.length, firstFailure: run.failures[0]?.error
    }]));
    assert.ok(Object.values(results).every(run => !run.failures.length), JSON.stringify(summary));
  } finally { await browser.close(); }
})().catch(error => {
  if (process.env.GITHUB_ACTIONS) console.log("::error::" + error.message.replaceAll("\n", "%0A"));
  console.error(error);
  process.exitCode = 1;
});
