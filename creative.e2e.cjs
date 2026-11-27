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
async function verifyLongBox(page) {
  await page.goto(home);
  await page.getByRole("button",{name:"مستند فارغ",exact:true}).click();
  const root = page.locator(".editor-source .tiptap");
  const markers = Array.from({length:65},(_,i)=>`BLOCK${String(i).padStart(3,"0")}`);
  await root.evaluate((el,markers)=>{
    el.editor.commands.setContent({type:"doc", content:[{
      type:"educationBlock",attrs:{kind:"proof",title:"برهان يمتد إلى صفحات"},
      content:markers.map(text=>({type:"paragraph",content:[{type:"text",text}]}))
    }]},true);
  },markers);
  await page.getByRole("button",{name:"طباعة / PDF",exact:true}).click();
  await page.getByRole("region",{name:"معاينة الطباعة"}).getByText(/صفحة A4/).waitFor();
  const fragments = page.locator(".print-sheet .creative-block");
  assert.ok(await fragments.count() >= 2);
  assert.deepEqual((await fragments.allTextContents()).join("").match(/BLOCK\d{3}/g),markers);
}
async function captureTemplates(browser) {
  for (const [title, fileName] of [
    [/القطوع المخروطية/,"conics"], [/امتحان رياضيات/,"exam"],
    [/غلاف الفصل الدراسي/,"cover"], [/ورقة قوانين التفاضل/,"formula-sheet"]
  ]) {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    try {
      await page.goto(home);
      await choose(page,title);
      const pages = page.locator(".editor-source .tiptap");
      await pages.waitFor();
      if(fileName==="exam") assert.equal(await pages.locator('[data-educational-list="exam"] > li').count(),4);
      if(fileName==="conics") await pages.locator(".graph-box svg").nth(3).waitFor();
      await page.getByRole("tab",{name:"ملف",exact:true}).click();
      const file = page.waitForEvent("download");
      await page.getByRole("button",{name:"تصدير المستند كملف قابل للتحرير"}).click();
      await (await file).saveAs(join(output,fileName+".mathdoc"));
      await page.getByRole("button",{name:"طباعة / PDF",exact:true}).click();
      await page.getByRole("region",{name:"معاينة الطباعة"}).getByText(/صفحة A4/).waitFor();
      await page.pdf({path:join(output,fileName+".pdf"),preferCSSPageSize:true});
    } finally { await page.close(); }
  }
}
(async () => {
  if (output) await mkdir(output,{recursive:true});
  const browser = await engine.launch(engine===chromium && process.env.MATHPRESS_CHROMIUM ?
    {executablePath:process.env.MATHPRESS_CHROMIUM} : {});
  try {
    for (const [index, context] of [{viewport:{width:1440,height:1000}}, devices["iPad (gen 7)"]].entries()) {
      const capture = !!output && engine === chromium && index === 0;
      const session = await browser.newContext({...context,
        ...(capture && process.env.MATHPRESS_CREATIVE_VIDEO === "1" ? {recordVideo:{dir:output}} : {})});
      try { await lesson(await session.newPage(), capture); }
      finally { await session.close(); }
    }
    const longBox = await browser.newPage();
    try { await verifyLongBox(longBox); }
    finally { await longBox.close(); }
    if (output && engine===chromium) await captureTemplates(browser);
    console.log(engine.name(),"creative lesson editor, IndexedDB and print verified on desktop and iPad emulation");
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
