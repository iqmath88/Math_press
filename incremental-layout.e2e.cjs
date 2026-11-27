const assert = require("node:assert/strict");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { chromium, webkit, devices } = require("playwright-core");
const engine = process.argv[2] === "webkit" ? webkit : chromium;
const mode = process.env.MATHPRESS_LAYOUT_MODE || "direct";
const session = process.env.MATHPRESS_LAYOUT_SESSION || "first";
const fixtures = (size) => Array.from({ length: size }, (_, i) => [
  ...(i ? [{ type: "pageBreak" }] : []),
  { type: "paragraph", content: [{ type: "text", text: `صفحة ${i + 1} · تطبيق رياضي ` },
    { type: "mathInline", attrs: { latex: `f(x)=x^2+${i}` } }] }
]).flat();

(async () => {
  const browser = await engine.launch(engine === chromium && process.env.MATHPRESS_CHROMIUM
    ? { executablePath: process.env.MATHPRESS_CHROMIUM } : {});
  try {
    const results = {};
    for (const [name, options] of [["desktop", { viewport: { width: 1440, height: 960 } }], ["ipad", devices["iPad (gen 7)"]]]) {
      const page = await browser.newPage(options);
      await page.goto((process.env.MATHPRESS_QA_URL || "http://127.0.0.1:4174/") + "#live-layout-lab");
      const source = page.locator(".live-lab-source .tiptap");
      const projection = page.locator(".live-lab-result .print-pages");
      const setDoc = content => source.evaluate((root, content) =>
        root.editor.chain().setMeta("addToHistory", false).setContent({ type: "doc", content }, true).run(), content);
      await source.waitFor();
      await setDoc(fixtures(200));
      await page.waitForFunction(() => document.querySelector("[data-pages]")?.dataset.pages === "200");
      await projection.evaluate(root => {
        window.originalSheets = [...root.children];
      });
      await source.evaluate(root => {
        const editor = root.editor;
        const position = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize + 1;
        editor.commands.insertContentAt(position, "تعديل فريد ");
      });
      await projection.locator('[data-print-page="2"]').filter({ hasText: "تعديل فريد" }).waitFor();
      await page.locator('[data-rebuilt="1"]').waitFor();
      assert.equal(await projection.evaluate(root => [...root.children].filter((sheet, index) =>
        sheet === window.originalSheets[index]).length), 199);
      const ranges = JSON.parse(await page.locator("[data-ranges]").getAttribute("data-ranges"));
      assert.deepEqual(ranges[1].start, { block: 2, offset: 0 });
      await source.evaluate(root => {
        const editor = root.editor;
        editor.commands.insertContentAt(editor.state.doc.child(0).nodeSize, {
          type: "paragraph", content: [{ type: "text", text: "تعديل بنيوي قبل الفاصل" }]
        });
      });
      await projection.locator('[data-print-page="1"]').filter({ hasText: "تعديل بنيوي قبل الفاصل" }).waitFor();
      await page.locator('[data-rebuilt="1"]').waitFor();
      const moved = JSON.parse(await page.locator("[data-ranges]").getAttribute("data-ranges"));
      assert.deepEqual(moved[1].start, { block: 3, offset: 0 });
      assert.equal(await projection.evaluate(root => root.children[2] === window.originalSheets[2]), true);
      await page.getByLabel("الهامش الرأسي").selectOption("28");
      await page.waitForFunction(() => document.querySelector("[data-rebuilt]")?.dataset.rebuilt === "200");

      const direct = page.getByLabel("تحرير مباشر تجريبي بالأعمدة");
      await setDoc([{ type: "paragraph", content: [{ type: "text", text: "تمرين عربي x=2. ".repeat(190) }] }]);
      const snapshot = () => source.evaluate(root => root.editor.getJSON());
      const before = await snapshot();
      await direct.check();
      assert.equal(await projection.count(), 0);
      assert.equal(await page.locator(".live-lab-source .tiptap[contenteditable=true]").count(), 1);
      const columns = () => source.evaluate(root => {
        const range = document.createRange();
        range.selectNodeContents(root.querySelector("p"));
        const edges = [...range.getClientRects()].filter(rect => rect.height > 0).map(rect => rect.right);
        return Math.max(...edges) - Math.min(...edges);
      });
      assert.ok(await columns() > 270);
      await source.evaluate(root => root.editor.commands.focus("end"));
      await page.waitForFunction(() => {
        const root = document.querySelector(".live-lab-source .tiptap");
        const caret = document.getSelection();
        return document.activeElement === root && root.contains(caret?.anchorNode) &&
          root.editor.state.selection.from === root.editor.state.doc.content.size - 1;
      });
      if (process.env.MATHPRESS_QA_OUTPUT && engine === chromium && name === "desktop")
        await page.screenshot({ path: join(process.env.MATHPRESS_QA_OUTPUT, "direct-column-01.png") });
      await page.keyboard.insertText(" نهاية النص العربي");
      await source.getByText(/نهاية النص العربي/).waitFor();
      await page.keyboard.press("Control+z");
      await page.waitForFunction(() => !document.querySelector(".live-lab-source .tiptap").textContent.includes("نهاية النص العربي"));
      assert.deepEqual(await snapshot(), before);
      await page.keyboard.press("Control+Shift+z");
      await source.getByText(/نهاية النص العربي/).waitFor();
      const edited = await snapshot();
      if (process.env.MATHPRESS_QA_OUTPUT && engine === chromium && name === "desktop")
        await page.screenshot({ path: join(process.env.MATHPRESS_QA_OUTPUT, "direct-column-02.png") });
      await direct.uncheck();
      await projection.locator(".print-sheet").first().waitFor();
      assert.deepEqual(await snapshot(), edited);
      if (process.env.MATHPRESS_QA_OUTPUT) {
        writeFileSync(join(process.env.MATHPRESS_QA_OUTPUT, `incremental-${engine.name()}-${name}.json`),
          JSON.stringify({ pages: 200, rebuilt: 1, reused: 199, ranges }, null, 2));
        await page.screenshot({ path: join(process.env.MATHPRESS_QA_OUTPUT, `incremental-${engine.name()}-${name}.png`) });
      }
      if (mode === "direct") await direct.check();
      else if (mode === "hybrid") {
        await setDoc(fixtures(3));
        await page.locator('[data-pages="3"]').waitFor();
        await page.getByRole("button", { name: "معاينة الصفحة 3" }).click();
        await page.getByRole("button", { name: "تحرير من بداية الصفحة 3" }).click();
        await page.waitForFunction(() => {
          const root = document.querySelector(".live-lab-source .tiptap");
          return document.activeElement === root && root.editor.state.selection.$head.index(0) === 4;
        });
        const position = await source.evaluate(root => root.editor.state.selection.from);
        await page.getByRole("button", { name: "معاينة الصفحة 1" }).click();
        await page.getByRole("button", { name: "متابعة التحرير عند المؤشر" }).click();
        await page.waitForFunction(pos => {
          const root = document.querySelector(".live-lab-source .tiptap");
          return document.activeElement === root && root.editor.state.selection.from === pos;
        }, position);
      }
      if (mode === "continuous") await page.getByLabel("عرض الصفحات الحية").uncheck();
      const review = " النص العربي بعد الحقل";
      const focusRoot = () => page.waitForFunction(() => {
        const root = document.querySelector(".live-lab-source .tiptap");
        return document.activeElement === root && root.contains(document.getSelection()?.anchorNode);
      });
      const record = { attempted: 0, passed: 0, failures: [] };
      results[name] = record;
      page.setDefaultTimeout(3500);
      for (let round = 0; round < 30; round++) {
        record.attempted++;
        let stage = "fixture";
        try {
          await setDoc([
            { type: "paragraph", content: [{ type: "text", text: "فقرة عربية x=2. ".repeat(190) }] },
            { type: "pageBreak" },
            { type: "paragraph", content: [{ type: "text", text: "حول الفاصل " },
              { type: "mathInline", attrs: { latex: "x=2" } }] }
          ]);
          stage = "MathLive input";
          const atom = source.locator("math-field").first();
          await atom.click();
          await atom.press("End");
          await page.keyboard.type("+1");
          await page.waitForFunction(() => {
            const doc = document.querySelector(".live-lab-source .tiptap").editor.state.doc;
            return doc.lastChild?.lastChild?.attrs.latex === "x=2+1";
          });
          stage = "MathLive exit";
          await page.keyboard.press("Escape");
          await focusRoot();
          await page.keyboard.insertText(review);
          await page.waitForFunction(text =>
            document.querySelector(".live-lab-source .tiptap").editor.state.doc.lastChild?.textContent.includes(text), review);
          const state = await snapshot();
          stage = "undo";
          await page.keyboard.press("Control+z");
          await page.waitForFunction(text =>
            !document.querySelector(".live-lab-source .tiptap").editor.state.doc.lastChild?.textContent.includes(text), review);
          stage = "redo";
          await page.keyboard.press("Control+Shift+z");
          await page.waitForFunction(text =>
            document.querySelector(".live-lab-source .tiptap").editor.state.doc.lastChild?.textContent.includes(text), review);
          assert.deepEqual(await snapshot(), state);
          stage = "cross-column selection";
          await source.evaluate(root => {
            const editor = root.editor;
            editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 });
          });
          await page.waitForFunction(() => {
            const root = document.querySelector(".live-lab-source .tiptap");
            const native = document.getSelection();
            const view = root.editor.view;
            const { from, to } = view.state.selection;
            if (!native || native.isCollapsed || !root.contains(native.anchorNode) || !root.contains(native.focusNode)) return false;
            return view.posAtDOM(native.anchorNode, native.anchorOffset) === from &&
              view.posAtDOM(native.focusNode, native.focusOffset) === to;
          });
          stage = "cross-column deletion";
          await page.keyboard.press("Backspace");
          await page.waitForFunction(() => document.querySelector(".live-lab-source .tiptap").editor.state.doc.textContent.trim() === "");
          record.passed++;
        } catch (error) {
          const diagnostic = await source.evaluate(root => {
            const { state } = root.editor;
            const active = document.activeElement;
            const selection = getSelection();
            const stack = state.plugins.find(plugin => plugin.spec.key?.key.startsWith("history$"))?.getState(state);
            return {
              active: active === root ? "editor" : active?.localName,
              nativeInEditor: root.contains(selection?.anchorNode),
              from: state.selection.from, to: state.selection.to,
              lastText: state.doc.lastChild?.textContent.slice(-80),
              latex: state.doc.lastChild?.lastChild?.attrs.latex,
              undoDepth: stack?.done.eventCount, redoDepth: stack?.undone.eventCount
            };
          }).catch(() => null);
          record.failures.push({ diagnostic, round: round + 1, stage, message: error.message.split("\n")[0] });
        }
      }
      await page.close();
    }
    if (process.env.MATHPRESS_QA_OUTPUT)
      writeFileSync(join(process.env.MATHPRESS_QA_OUTPUT, `${mode}-${session}-gate-${engine.name()}.json`), JSON.stringify(results, null, 2));
    const summary = Object.fromEntries(Object.entries(results).map(([name, entry]) => [
      name, { attempted: entry.attempted, passed: entry.passed,
        failures: entry.failures.map(({ round, stage }) => ({ round, stage })) }
    ]));
    console.log(mode, session, engine.name(), JSON.stringify(summary));
    const failures = Object.values(results).reduce((sum, result) => sum + result.failures.length, 0);
    assert.equal(failures, 0, mode + " " + session + " acceptance gate: " + JSON.stringify(summary));
  } finally { await browser.close(); }
})().catch(error => {
  console.error(error);
  if (process.env.GITHUB_ACTIONS)
    console.log("::error title=Incremental layout " + mode + " " + session + " " + engine.name() + "::" + String(error.stack).replaceAll("%", "%25").replaceAll("\n", "%0A"));
  process.exitCode = 1;
});
