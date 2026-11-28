const assert = require("node:assert/strict");
const { mkdir, readFile } = require("node:fs/promises");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");
const { chromium, webkit } = require("playwright-core");

const engine = process.argv[2] === "webkit" ? webkit : chromium;
const home = process.env.MATHPRESS_QA_URL || "http://127.0.0.1:4174/";
const output = process.env.MATHPRESS_QA_OUTPUT;

async function captureCatalog(browser) {
  const page=await browser.newPage({viewport:{width:1440,height:1150}});
  try {
    await page.goto(home);
    await page.getByRole("button",{name:"مستند فارغ",exact:true}).click();
    const editor=page.locator(".editor-source .tiptap");
    await editor.evaluate(el=>{
      const types=["chapter","lesson","subtitle","definition","concept","law","theorem","proof","property","rule",
        "example","solution","note","warning","idea","ministerial-idea","ministerial-question","exercise","check","summary","homework","illustration","custom"];
      el.editor.commands.setContent({type:"doc",content:types.map(kind=>({type:"educationBlock",attrs:{kind},content:[
        {type:"paragraph",content:[{type:"text",text:"عينة تنسيق قابلة للتحرير — المشتقة والقيم القصوى."}]}
      ]}))},true);
    });
    await page.getByRole("button",{name:"طباعة / PDF",exact:true}).click();
    const preview=page.getByRole("region",{name:"معاينة الطباعة"});
    await preview.getByText(/صفحة A4/).waitFor();
    assert.equal(await page.locator(".print-sheet .creative-block").count(),23);
    await page.pdf({path:join(output,"glass-box-catalog.pdf"),preferCSSPageSize:true});
    await preview.getByText("تدرج رمادي",{exact:true}).click();
    await page.pdf({path:join(output,"glass-box-catalog-gray.pdf"),preferCSSPageSize:true});
  } finally {await page.close();}
}

async function captureTable(browser) {
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  try {
    await page.goto(home);
    await page.getByRole("button",{name:"مستند فارغ",exact:true}).click();
    await page.getByRole("tab",{name:"إدراج",exact:true}).click();
    await page.getByRole("button",{name:"إدراج جدول 3×3",exact:true}).click();
    const cell=page.locator(".editor-source table td").first();
    await cell.click();
    await page.keyboard.insertText("قيمة المشتقة");
    await page.getByLabel("خلفية الخلايا",{exact:true}).fill("#dceaf5");
    await page.getByLabel("حدود الخلايا",{exact:true}).fill("#193c6b");
    await page.getByLabel("محاذاة الخلايا",{exact:true}).selectOption("center");
    assert.equal(await cell.getAttribute("data-cell-align"),"center");
    await page.getByRole("button",{name:"طباعة / PDF",exact:true}).click();
    await page.getByRole("region",{name:"معاينة الطباعة"}).getByText(/1 صفحة A4/).waitFor();
    await page.locator('.print-sheet td[data-cell-fill="#dceaf5"]').waitFor();
    await page.pdf({path:join(output,"glass-table.pdf"),preferCSSPageSize:true});
  } finally {await page.close();}
}

(async()=>{
  const browser=await engine.launch(engine===chromium && process.env.MATHPRESS_CHROMIUM ?
    {executablePath:process.env.MATHPRESS_CHROMIUM} : {});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:1000}});
    await page.goto(home);
    await page.getByRole("button",{name:"مستند فارغ",exact:true}).click();
    const body=page.locator(".editor-source .tiptap");
    await body.locator("p").first().click();
    await page.keyboard.insertText("تمارين على المشتقة");
    const configure=async()=>{
      await page.getByRole("tab",{name:"الصفحة",exact:true}).click();
      await page.getByRole("button",{name:"هوامش مخصصة، الرأس والتذييل، الترقيم"}).click();
      return page.getByRole("dialog",{name:"إعدادات الصفحة"});
    };
    const settings=await configure();
    await settings.getByText("خيارات الرأس والتذييل",{exact:true}).click();
    await settings.getByLabel("وسط الرأس").fill("المراجعة النهائية");
    await settings.getByLabel("وسط التذييل").fill("الفصل الأول");
    await settings.getByLabel("النص المقابل في الرأس").fill("شعبة الرياضيات");
    await settings.getByLabel("النص المقابل في التذييل").fill("العام الدراسي");
    await settings.getByLabel("بداية ترقيم الصفحات").fill("7");
    await settings.getByText("الأرقام ١٢٣",{exact:true}).click();
    await settings.getByLabel("نوع العلامة المائية").selectOption("text");
    await settings.getByLabel("نص العلامة المائية").fill("مراجعة");
    await settings.getByRole("button",{name:"تطبيق",exact:true}).click();
    await page.locator(".watermark-editor .page-watermark").getByText("مراجعة",{exact:true}).waitFor();
    assert.equal(await body.locator("p").first().textContent(),"تمارين على المشتقة");
    if(output && engine===chromium){
      await mkdir(output,{recursive:true});
      await page.screenshot({path:join(output,"page-studio-editor.png")});
    }
    await page.getByRole("tab",{name:"ملف",exact:true}).click();
    const download=page.waitForEvent("download");
    await page.getByRole("button",{name:"تصدير المستند كملف قابل للتحرير"}).click();
    const exported=await download;
    const data=JSON.parse(await readFile(await exported.path(),"utf8"));
    assert.equal(data.schemaVersion,6);
    assert.equal(data.pageFurniture.numberStart,7);
    assert.equal(data.watermark.value,"مراجعة");
    if(output && engine===chromium) await exported.saveAs(join(output,"page-studio.mathdoc"));
    await page.locator('input[accept^=".mathdoc"]').setInputFiles({
      name:"restored-page.mathdoc",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(data))
    });
    await page.getByText("تم فتح المستند بنجاح.",{exact:true}).waitFor();
    await page.getByRole("button",{name:"طباعة / PDF",exact:true}).click();
    await page.getByRole("region",{name:"معاينة الطباعة"}).getByText(/1 صفحة A4/).waitFor();
    const printed=page.locator(".print-sheet");
    await printed.getByText("مراجعة",{exact:true}).waitFor();
    await printed.getByText("المراجعة النهائية",{exact:true}).waitFor();
    await printed.getByText("الفصل الأول",{exact:true}).waitFor();
    await printed.getByText("شعبة الرياضيات",{exact:true}).waitFor();
    await printed.getByText("العام الدراسي",{exact:true}).waitFor();
    await printed.getByText("صفحة ٧ من ٧",{exact:true}).waitFor();
    if(output && engine===chromium) {
      const path=join(output,"page-studio.pdf");
      await page.pdf({path,preferCSSPageSize:true,displayHeaderFooter:false});
      assert.match(execFileSync("pdfinfo",[path],{encoding:"utf8"}),/^Pages:\s+1$/m);
      const text=execFileSync("pdftotext",[path,"-"],{encoding:"utf8"});
      assert.match(text,/٧/);
      assert.doesNotMatch(text,/https?:\/\//);
    }
    await page.getByRole("region",{name:"معاينة الطباعة"}).getByText("الرأس والتذييل",{exact:true}).click();
    await printed.getByText("شعبة الرياضيات",{exact:true}).waitFor({state:"detached"});
    await printed.getByText("صفحة ٧ من ٧",{exact:true}).waitFor();
    await page.getByRole("region",{name:"معاينة الطباعة"}).getByText("العلامة المائية",{exact:true}).click();
    await printed.locator(".page-watermark").waitFor({state:"detached"});
    await page.getByRole("button",{name:"العودة للتحرير"}).click();
    const logo=await configure();
    await logo.getByLabel("نوع العلامة المائية").selectOption("image");
    await logo.getByLabel("صورة العلامة المائية").setInputFiles(join(__dirname,"icon-512.png"));
    await page.waitForFunction(()=>!document.querySelector('.modal .primary-action')?.disabled);
    await logo.getByRole("button",{name:"تطبيق",exact:true}).click();
    await page.locator(".watermark-editor .page-watermark img").waitFor();
    await page.getByRole("button",{name:"طباعة / PDF",exact:true}).click();
    await printed.locator(".page-watermark img").waitFor();
    await printed.locator(".page-watermark img").evaluate(image=>image.decode());
    if(output && engine===chromium) await page.pdf({path:join(output,"page-studio-logo.pdf"),preferCSSPageSize:true});
    await page.getByRole("button",{name:"العودة للتحرير"}).click();
    await page.getByRole("tab",{name:"ملف",exact:true}).click();
    const logoFile=page.waitForEvent("download");
    await page.getByRole("button",{name:"تصدير المستند كملف قابل للتحرير"}).click();
    const logoBackup=await logoFile;
    const logoData=JSON.parse(await readFile(await logoBackup.path(),"utf8"));
    assert.equal(logoData.watermark.kind,"image");
    assert.match(logoData.watermark.value,/^data:image\//);
    if(output && engine===chromium) await logoBackup.saveAs(join(output,"page-studio-logo.mathdoc"));
    await page.locator('input[accept^=".mathdoc"]').setInputFiles({
      name:"logo-backup.mathdoc",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(logoData))
    });
    await page.getByText("تم فتح المستند بنجاح.",{exact:true}).waitFor();
    await page.locator(".watermark-editor .page-watermark img").evaluate(image=>image.decode());
    if(output && engine===chromium) {
      await captureCatalog(browser);
      await captureTable(browser);
    }
    console.log(engine.name(),"page chrome, watermark, MathDoc 6 and print round-trip passed");
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
