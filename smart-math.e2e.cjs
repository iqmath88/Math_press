const assert = require("node:assert/strict");
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
  await page.keyboard.press("$");
  const field = editor.locator("math-field").first();
  await field.waitFor();
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
  const newLatex = examples[0] + "+1";
  await latexIs(newLatex);
  await page.keyboard.press("Escape");
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
    if (output) writeFileSync(join(output, "smart-math-results.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
    assert.ok(Object.values(results).every(run => !run.failures.length));
  } finally { await browser.close(); }
})().catch(error => {
  if (process.env.GITHUB_ACTIONS) console.log("::error::" + error.message.replaceAll("\n", "%0A"));
  console.error(error);
  process.exitCode = 1;
});
