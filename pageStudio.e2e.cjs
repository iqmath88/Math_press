const assert = require("node:assert/strict");
const { mkdir, readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { chromium, webkit } = require("playwright-core");

const engine = process.argv[2] === "webkit" ? webkit : chromium;
const home = process.env.MATHPRESS_QA_URL || "http://127.0.0.1:4174/";
const output = process.env.MATHPRESS_QA_OUTPUT;

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
    await printed.getByText("شعبة الرياضيات",{exact:true}).waitFor();
    await printed.getByText("العام الدراسي",{exact:true}).waitFor();
    await printed.getByText("صفحة ٧ من ٧",{exact:true}).waitFor();
    if(output && engine===chromium) await page.pdf({path:join(output,"page-studio.pdf"),preferCSSPageSize:true});
    await page.getByRole("button",{name:"العودة للتحرير"}).click();
    const logo=await configure();
    await logo.getByLabel("نوع العلامة المائية").selectOption("image");
    await logo.getByLabel("صورة العلامة المائية").setInputFiles(join(__dirname,"icon-512.png"));
    await page.waitForFunction(()=>!document.querySelector('.modal .primary-action')?.disabled);
    await logo.getByRole("button",{name:"تطبيق",exact:true}).click();
    await page.locator(".watermark-editor .page-watermark img").waitFor();
    await page.getByRole("button",{name:"طباعة / PDF",exact:true}).click();
    await printed.locator(".page-watermark img").waitFor();
    if(output && engine===chromium) await page.pdf({path:join(output,"page-studio-logo.pdf"),preferCSSPageSize:true});
    console.log(engine.name(),"page chrome, watermark, MathDoc 6 and print round-trip passed");
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
