const assert = require("node:assert/strict");
const { join } = require("node:path");
const { chromium, webkit, devices } = require("playwright-core");

const engine = process.argv[2] === "webkit" ? webkit : chromium;
const base = process.env.MATHPRESS_QA_URL || "http://127.0.0.1:4174/";
const structures = [
  ["كسر", /\\frac/], ["جذر تربيعي", /\\sqrt/], ["جذر نوني", /\\sqrt\[/],
  ["أس", /\^/], ["مؤشر سفلي", /_/], ["تكامل محدد", /\\int/], ["تكامل غير محدد", /\\int/],
  ["نهاية", /\\lim/], ["مجموع", /\\sum/], ["مصفوفة", /bmatrix/], ["محدد", /vmatrix/],
  ["قيمة مطلقة", /\|/], ["جيب", /\\sin/], ["لوغاريتم", /\\log/], ["متجه", /\\vec/],
];

async function exercise(page, viewportName, touch) {
  const button = name => page.getByRole("button", {name, exact:true});
  const source = page.locator(".editor-source .mp-editor");
  const activeField = source.locator("math-field:focus");
  const perform = locator => locator[touch ? "tap" : "click"]();
  const blank = async () => {
    await perform(button("مستند فارغ"));
    await source.locator("p").first().waitFor();
    assert.equal(await source.locator("math-field").count(), 0);
    await perform(source.locator("p").first());
  };
  await page.goto(base);
  await source.locator("p").first().waitFor();
  await blank();
  await page.keyboard.insertText("قبل ");
  await perform(button("معادلة سطرية"));
  await activeField.waitFor();
  await page.keyboard.type("x");
  await page.keyboard.press("Escape");
  await page.keyboard.insertText(" ثم ");
  await perform(button("لوحة الرياضيات"));
  await perform(button("كسر"));
  await activeField.waitFor();
  await page.keyboard.type("3");
  await page.keyboard.press("Tab");
  await page.keyboard.type("7");
  assert.equal(await activeField.evaluate(node => node.value), String.raw`\frac37`);
  await perform(page.getByRole("region", {name:"لوحة التأليف الرياضي"}).getByRole("button", {name:"العودة إلى النص", exact:true}));
  await page.keyboard.insertText(" بعد");
  const actual = await source.evaluate(editor => editor.editor.getJSON().content[0].content);
  assert.deepEqual(actual.map(node=>node.text ?? node.attrs.latex), ["قبل ", "x", " ثم ", String.raw`\frac37`, " بعد"]);
  if (process.env.MATHPRESS_QA_OUTPUT) {
    await page.screenshot({path:join(process.env.MATHPRESS_QA_OUTPUT,`authoring-${engine.name()}-${viewportName}.png`)});
  }
  await page.getByText("محفوظ محليًا", {exact:true}).waitFor();
  const title = await page.getByLabel("عنوان المستند").inputValue();
  await page.reload();
  await page.getByRole("tab",{name:"ملف",exact:true}).click();
  await button("المستندات المحفوظة على هذا الجهاز").click();
  await page.locator(".library-open").filter({hasText:title}).first().click();
  await source.getByText("ثم",{exact:false}).waitFor();
  assert.deepEqual(await source.locator("math-field").evaluateAll(fields=>fields.map(f=>f.value)), ["x",String.raw`\frac37`]);
}

(async()=>{
  const browser=await engine.launch(engine===chromium&&process.env.MATHPRESS_CHROMIUM?{executablePath:process.env.MATHPRESS_CHROMIUM}:{});
  try {
    for (const [name, options] of [
      ["desktop",{viewport:{width:1440,height:1000}}], ["ipad-portrait",devices["iPad (gen 7)"]],
      ["ipad-landscape",devices["iPad (gen 7) landscape"]],
    ]) {
      const page=await browser.newPage(options);
      await exercise(page,name,!!options.hasTouch);
      if (!options.hasTouch) {
        const first = page.locator(".editor-source math-field").first();
        await first.click();
        await page.locator(".editor-source math-field:focus").waitFor();
        await first.evaluate(field => { field.position = field.lastOffset; });
        await page.getByRole("button",{name:"لوحة الرياضيات",exact:true}).click();
        await page.getByLabel("البحث عن رمز أو قالب").fill("يساوي");
        await page.getByRole("button",{name:"المفضلة: يساوي",exact:true}).click();
        await page.getByRole("button",{name:"يساوي",exact:true}).click();
        assert.equal(await first.evaluate(field => field.value),"x=");
        await page.getByLabel("مجموعة القوالب الرياضية").selectOption("recent");
        await page.getByRole("button",{name:"يساوي",exact:true}).waitFor();
        await page.getByLabel("مجموعة القوالب الرياضية").selectOption("favorite");
        await page.getByRole("button",{name:"يساوي",exact:true}).waitFor();
        for (const [label, expected] of structures) {
          await page.getByRole("button",{name:"مستند فارغ",exact:true}).click();
          await page.locator(".editor-source p").first().click();
          await page.getByRole("button",{name:"لوحة الرياضيات",exact:true}).click();
          await page.getByLabel("البحث عن رمز أو قالب").fill(label);
          await page.getByRole("button",{name:label,exact:true}).click();
          const field=page.locator(".editor-source math-field:focus");
          await field.waitFor();
          const skeleton=await field.evaluate(node=>node.value);
          assert.match(skeleton,expected);
          assert.match(skeleton,/\\placeholder/);
          await page.keyboard.type("9");
          assert.match(await field.evaluate(node=>node.value),/9/);
          await page.keyboard.press("Escape");
        }
      }
      console.log(`${engine.name()} authoring ${name} passed`);
      await page.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
