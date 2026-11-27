const assert = require("node:assert/strict");
const { readFile, mkdir } = require("node:fs/promises");
const { join } = require("node:path");
const { chromium, webkit, devices } = require("playwright-core");

const engine = process.argv[2] === "webkit" ? webkit : chromium;
const home = process.env.MATHPRESS_QA_URL || "http://127.0.0.1:4174/";
const output = process.env.MATHPRESS_QA_OUTPUT;
async function choose(page, title) {
  await page.getByRole("button",{name:"القوالب",exact:true}).click();
  await page.getByRole("region",{name:"مكتبة القوالب"}).getByRole("button",{name:title}).click();
}
async function lesson(page, capture) {
  await page.goto(home);
  await choose(page,/تطبيقات التفاضل/);
  const editor = page.locator(".editor-source .tiptap");
  const def = editor.locator('[data-education-block="definition"]').first();
  await def.locator("p").click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" $x^2");
  await page.keyboard.press("$");
  await def.locator("math-field").waitFor();
  await page.getByRole("button",{name:"التصميم والصناديق"}).click();
  await page.getByLabel("هوية المستند").selectOption("emerald");
  await page.getByRole("group",{name:"خصائص الصندوق"}).getByLabel("العنوان",{exact:true}).fill("تعريف محرّر");
  await def.getByText("تعريف محرّر",{exact:true}).waitFor();
  await page.getByText("محفوظ محليًا",{exact:true}).waitFor();
  await page.getByRole("tab",{name:"ملف",exact:true}).click();
  const file = page.waitForEvent("download");
  await page.getByRole("button",{name:"تصدير المستند كملف قابل للتحرير"}).click();
  const download = await file;
  const persisted = JSON.parse(await readFile(await download.path(),"utf8"));
  assert.equal(persisted.schemaVersion,4);
  assert.equal(persisted.creativeDesign,"emerald");
  assert.equal(persisted.content.content.find(node=>node.type==="educationBlock").attrs.title,"تعريف محرّر");
  if (capture) await download.saveAs(join(output,"applied-derivatives.mathdoc"));
  await page.reload();
  await page.getByRole("tab",{name:"ملف",exact:true}).click();
  await page.getByRole("button",{name:"المستندات المحفوظة على هذا الجهاز"}).click();
  await page.locator(".library-open").filter({hasText:"تطبيقات التفاضل"}).first().click();
  await def.getByText("تعريف محرّر",{exact:true}).waitFor();
  await def.locator("math-field").waitFor();
  await editor.locator(".graph-box svg").first().waitFor();
  if (capture) await page.screenshot({path:join(output,"creative-editor.png")});
  await page.getByRole("button",{name:"طباعة / PDF",exact:true}).click();
  await page.getByRole("region",{name:"معاينة الطباعة"}).getByText(/صفحة A4/).waitFor();
  assert.ok(await page.locator(".print-sheet").count() >= 5);
  assert.equal(await page.locator(".print-sheet .creative-block-label").filter({hasText:"تعريف محرّر"}).count(),1);
  if (capture) {
    await page.pdf({path:join(output,"applied-derivatives.pdf"),preferCSSPageSize:true});
    await page.screenshot({path:join(output,"creative-preview.png")});
  }
}
(async () => {
  if (output) await mkdir(output,{recursive:true});
  const browser = await engine.launch(engine===chromium && process.env.MATHPRESS_CHROMIUM ?
    {executablePath:process.env.MATHPRESS_CHROMIUM} : {});
  try {
    for (const [index, context] of [{viewport:{width:1440,height:1000}}, devices["iPad (gen 7)"]].entries()) {
      const page = await browser.newPage(context);
      await lesson(page, !!output && engine===chromium && index===0);
      await page.close();
    }
    console.log(engine.name(),"creative lesson editor, IndexedDB and print verified on desktop and iPad emulation");
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
