const assert = require("node:assert/strict");
const { readFile, mkdir, mkdtemp, writeFile, rm } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { chromium, webkit, devices } = require("playwright-core");

const engine = process.argv[2] === "webkit" ? webkit : chromium;
const home = process.env.MATHPRESS_QA_URL || "http://127.0.0.1:4174/";
const output = process.env.MATHPRESS_QA_OUTPUT;
async function choose(page, title) {
  await page.getByRole("button",{name:"القوالب",exact:true}).click();
  await page.getByRole("region",{name:"مكتبة القوالب"}).getByRole("button",{name:title}).click();
}
async function lesson(page, capture) {
  page.setDefaultTimeout(10000);
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
  assert.equal(persisted.schemaVersion,5);
  assert.equal(persisted.creativeDesign,"emerald");
  assert.equal(persisted.content.content.find(node=>node.attrs?.kind==="definition").attrs.title,"تعريف محرّر");
  if (capture) await download.saveAs(join(output,"applied-derivatives.mathdoc"));
  // Keep the media exercise on the final page independently of bidi caret behavior.
  await editor.evaluate(el=>{
    const paragraph = el.querySelector('[data-education-block="homework"] p');
    const { editor } = el;
    editor.commands.setTextSelection(editor.view.posAtDOM(paragraph,paragraph.childNodes.length));
  });
  const tools = page.getByLabel("الأشكال الهندسية");
  await tools.selectOption("triangle");
  const shape = editor.locator(".studio-shape").first();
  await shape.click();
  await page.getByRole("group",{name:"خصائص الشكل"}).getByLabel("التسمية").fill("مثلث المماس");
  await shape.getByText("مثلث المماس").waitFor();
  await page.getByRole("group",{name:"خصائص الشكل"}).getByLabel("قياس خط البُعد").fill("٦ سم");
  await shape.getByText("٦ سم",{exact:true}).waitFor();
  await page.getByRole("group",{name:"خصائص الشكل"}).getByLabel("العرض (مم)").fill("32");
  const png = await editor.evaluate(async (el, paste)=>{
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1200;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f1faf7";
    ctx.fillRect(0,0,2048,1200);
    ctx.strokeStyle = "#9bbcac";
    ctx.lineWidth = 2;
    for (let step=40;step<2048;step+=80) {
      ctx.beginPath(); ctx.moveTo(step,0); ctx.lineTo(step,1200); ctx.stroke();
    }
    for (let step=40;step<1200;step+=80) {
      ctx.beginPath(); ctx.moveTo(0,step); ctx.lineTo(2048,step); ctx.stroke();
    }
    ctx.fillStyle = "#105542";
    ctx.font = "84px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("معدل التغير ومنحدر المماس",1024,165);
    ctx.strokeStyle = "#11634e"; ctx.lineWidth = 13;
    ctx.beginPath(); ctx.moveTo(250,1000); ctx.quadraticCurveTo(950,970,1750,245); ctx.stroke();
    ctx.strokeStyle = "#273d91";
    ctx.beginPath(); ctx.moveTo(500,1180); ctx.lineTo(1840,380); ctx.stroke();
    if (!paste) return canvas.toDataURL("image/png").split(",")[1];
    const blob = await new Promise(resolve=>canvas.toBlob(resolve));
    const data = new DataTransfer();
    data.items.add(new File([blob],"tangent.png",{type:"image/png"}));
    el.dispatchEvent(new ClipboardEvent("paste",{clipboardData:data,bubbles:true,cancelable:true}));
  }, engine === chromium);
  if (engine === webkit) {
    assert.ok(png,"WebKit must generate a PNG fixture");
    const dir = await mkdtemp(join(tmpdir(),"mathpress-image-"));
    try {
      const diskImage = join(dir,"tangent.png");
      await writeFile(diskImage,Buffer.from(png,"base64"));
      await page.getByRole("tab",{name:"إدراج",exact:true}).click();
      const chosen = page.waitForEvent("filechooser");
      await page.getByRole("button",{name:"إدراج صورة",exact:true}).click();
      await (await chosen).setFiles(diskImage);
      try {
        await editor.locator(".studio-image img[src]").waitFor({state:"attached"});
      } catch (error) {
        const notice = await page.locator(".statusbar").textContent();
        const files = await page.locator('input[accept="image/*"]').evaluate(element=>
          [...element.files].map(file=>({name:file.name,type:file.type,size:file.size})));
        throw new Error(`WebKit file chooser: ${JSON.stringify({notice,files})}`,{cause:error});
      }
    } finally { await rm(dir,{recursive:true,force:true}); }
  }
  const image = editor.locator(".studio-image img");
  try {
    await editor.locator(".studio-image img[src]").waitFor({state:"attached"});
    await image.evaluate(element=>element.decode());
    await image.waitFor({state:"visible"});
  } catch (error) {
    const alerts = await page.locator('[role="status"],[role="alert"],.statusbar').allTextContents();
    const state = await image.evaluateAll(elements=>elements.map(element=>({
      source: element.getAttribute("src")?.split(":")[0], alt: element.alt, width: element.naturalWidth
    })));
    throw new Error(`${engine.name()} image import: ${JSON.stringify({alerts,state})}`,{cause:error});
  }
  assert.equal(await image.evaluate(element=>Number(element.dataset.originalWidth) || element.naturalWidth),2048);
  if (engine===chromium) assert.equal(await image.evaluate(element=>element.naturalWidth),1200);
  await image.click();
  await page.getByRole("group",{name:"خصائص الصورة"}).getByLabel("العرض (مم)").fill("64");
  await page.getByRole("group",{name:"خصائص الصورة"}).getByLabel("القص من كل حافة (%)").fill("3");
  await page.getByText("قص كل حافة على حدة",{exact:true}).click();
  await page.getByLabel("القص من الأعلى (%)").fill("7");
  assert.match(await image.evaluate(el=>el.style.clipPath),/7%/);
  await page.getByText("محفوظ محليًا",{exact:true}).waitFor();
  await page.getByRole("tab",{name:"ملف",exact:true}).click();
  const mediaFile = page.waitForEvent("download");
  await page.getByRole("button",{name:"تصدير المستند كملف قابل للتحرير"}).click();
  const media = await mediaFile;
  const saved = JSON.parse(await readFile(await media.path(),"utf8"));
  const serialized = JSON.stringify(saved.content);
  assert.equal(saved.schemaVersion,5);
  assert.match(serialized,/data:image\/png;base64,/);
  assert.doesNotMatch(serialized,/mathpress-asset:/);
  assert.match(serialized,/مثلث المماس/);
  assert.match(serialized,/"cropTop":7/);
  assert.match(serialized,/٦ سم/);
  if (capture) await media.saveAs(join(output,"applied-derivatives.mathdoc"));
  await page.reload();
  await page.getByRole("tab",{name:"ملف",exact:true}).click();
  await page.getByRole("button",{name:"المستندات المحفوظة على هذا الجهاز"}).click();
  await page.locator(".library-open").filter({hasText:"تطبيقات التفاضل"}).first().click();
  await def.getByText("تعريف محرّر",{exact:true}).waitFor();
  await def.locator("math-field").waitFor();
  await editor.locator(".graph-box svg").first().waitFor();
  await image.waitFor();
  await shape.getByText("مثلث المماس").waitFor();
  if (capture) {
    await page.screenshot({path:join(output,"creative-editor.png")});
    const theme = page.getByRole("button",{name:"الوضع الداكن"});
    const effects = page.getByRole("button",{name:"تأثيرات بصرية منخفضة"});
    const paperColor = () => page.locator(".paper").first().evaluate(element=>getComputedStyle(element).backgroundColor);
    const initialColor = await paperColor();
    await theme.click();
    assert.equal(await theme.getAttribute("aria-pressed"),"true");
    assert.equal(await paperColor(),initialColor);
    await page.screenshot({path:join(output,"glass-dark.png")});
    await effects.click();
    assert.equal(await effects.getAttribute("aria-pressed"),"true");
    assert.equal(await page.locator(".topbar").evaluate(element=>getComputedStyle(element).backdropFilter),"none");
    await effects.click();
    await theme.click();
  }
  await page.getByRole("button",{name:"طباعة / PDF",exact:true}).click();
  await page.getByRole("region",{name:"معاينة الطباعة"}).getByText(/صفحة A4/).waitFor();
  const printImage = page.locator(".print-sheet .studio-image img");
  await printImage.waitFor();
  assert.equal(await printImage.evaluate(async image=>{await image.decode();return image.naturalWidth;}),2048);
  await page.locator(".print-sheet .studio-shape").getByText("مثلث المماس").waitFor();
  assert.equal(await page.locator(".print-sheet .creative-block-label").filter({hasText:"تعريف محرّر"}).count(),1);
  if (capture) {
    await page.pdf({path:join(output,"applied-derivatives.pdf"),preferCSSPageSize:true});
    await page.screenshot({path:join(output,"creative-preview.png")});
    await page.getByRole("button",{name:"العودة للتحرير"}).click();
    await page.getByRole("button",{name:"الوضع الداكن"}).click();
    await page.getByRole("button",{name:"طباعة / PDF",exact:true}).click();
    await page.getByRole("region",{name:"معاينة الطباعة"}).getByText(/6 صفحة A4/).waitFor();
    await page.pdf({path:join(output,"applied-derivatives-dark.pdf"),preferCSSPageSize:true});
  }
  assert.equal(await page.locator(".print-sheet").count(),6);
  const restored = await page.context().browser().newPage();
  try {
    await restored.goto(home);
    await restored.getByRole("button",{name:"مستند فارغ",exact:true}).click();
    await restored.getByRole("tab",{name:"ملف",exact:true}).click();
    await restored.locator('input[accept^=".mathdoc"]').setInputFiles({
      name:"restored.mathdoc",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(saved))
    });
    const restoredImage = restored.locator(".editor-source .studio-image img[src]");
    await restoredImage.waitFor();
    await restoredImage.evaluate(element=>element.decode());
    assert.equal(await restoredImage.evaluate(element=>Number(element.dataset.originalWidth) || element.naturalWidth),2048);
    await restored.locator(".editor-source .studio-shape").getByText("مثلث المماس").waitFor();
    await restored.getByRole("tab",{name:"الصفحة",exact:true}).click();
    await restored.getByRole("button",{name:"هوامش مخصصة، الرأس والتذييل، الترقيم"}).click();
    await restored.getByLabel("حجم الورق").selectOption("A5");
    await restored.getByRole("button",{name:"تطبيق",exact:true}).click();
    await restored.getByRole("button",{name:"طباعة / PDF",exact:true}).click();
    await restored.getByRole("region",{name:"معاينة الطباعة"}).getByText(/صفحة A5/).waitFor();
  } finally { await restored.close(); }
}
async function verifyStyleLibrary(page, capture) {
  await page.goto(home);
  await page.getByRole("button",{name:"مستند فارغ",exact:true}).click();
  await page.getByRole("button",{name:"التصميم والصناديق"}).click();
  await page.getByText("هوية مخصصة للملزمة",{exact:true}).click();
  await page.getByLabel("اسم الهوية").fill("هوية مدرس الرياضيات");
  await page.getByRole("button",{name:"حفظ الهوية",exact:true}).click();
  await page.getByRole("button",{name:"تطبيق الهوية على الملزمة",exact:true}).click();
  assert.equal(await page.locator(".paper").getAttribute("data-creative-design"),"custom");
  await page.getByRole("button",{name:"مكتبة أنماط الصناديق"}).click();
  await page.getByRole("button",{name:"تثبيت",exact:true}).click();
  const library = page.getByRole("region",{name:"مكتبة أنماط الصناديق"});
  assert.equal(await library.locator(".block-style-card").count(),23);
  await library.getByRole("button",{name:"المفضلة: تعريف",exact:true}).click();
  await library.getByLabel("التصنيف",{exact:true}).selectOption("favorites");
  assert.equal(await library.locator(".block-style-card").count(),1);
  await library.getByLabel("التصنيف",{exact:true}).selectOption("");
  await library.getByLabel("بحث الصناديق").fill("قانون");
  assert.equal(await library.locator(".block-style-card").count(),1);
  await library.getByLabel("بحث الصناديق").fill("");
  if (capture) await page.screenshot({path:join(output,"glass-box-library.png")});
  await library.getByRole("button",{name:"إدراج تعريف",exact:true}).click();
  const block = page.locator('.editor-source [data-education-block="definition"]');
  await block.locator("p").click();
  await page.keyboard.insertText("نص التعريف لا يدخل في النمط");
  await page.getByRole("group",{name:"خصائص الصندوق"}).getByLabel("الحشوة").fill("15");
  await library.getByLabel("اسم النمط").fill("تعريف المبرهنة");
  await library.getByRole("button",{name:"حفظ تنسيق الصندوق"}).click();
  await page.reload();
  const showStudio = page.getByRole("button",{name:"التصميم والصناديق"});
  if (await page.getByRole("button",{name:"مستند فارغ",exact:true}).isVisible())
    await page.getByRole("button",{name:"مستند فارغ",exact:true}).click();
  await showStudio.click();
  await page.getByRole("button",{name:"مكتبة أنماط الصناديق"}).click();
  await page.getByRole("button",{name:"تثبيت",exact:true}).click();
  await library.getByText("تعريف المبرهنة",{exact:true}).waitFor();
  await library.getByRole("button",{name:"إدراج",exact:true}).click();
  const inserted = block.last();
  assert.equal(await inserted.getAttribute("data-block-padding"),"15");
  assert.equal(await inserted.locator("p").textContent(),"");
  const downloadPromise = page.waitForEvent("download");
  await library.getByRole("button",{name:"تصدير أنماط الصناديق"}).click();
  const exported = await readFile(await (await downloadPromise).path());
  await library.getByRole("button",{name:"إزالة النمط"}).click();
  assert.equal(await library.getByText("تعريف المبرهنة",{exact:true}).count(),0);
  await inserted.waitFor();
  await library.getByLabel("استيراد أنماط الصناديق").setInputFiles({
    name:"styles.json", mimeType:"application/json", buffer:exported
  });
  await library.getByText("تعريف المبرهنة",{exact:true}).waitFor();
  await library.getByRole("button",{name:"إدراج مثال محلول"}).click();
  const example = page.locator('.editor-source [data-education-block="example"]').last();
  assert.equal(await example.getAttribute("data-example-number"),"1");
  const solution = example.locator('[data-education-block="solution"] p');
  assert.equal(await solution.textContent(),"اكتب خطوات الحل هنا.");
  await solution.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" تعديل");
  assert.match(await solution.textContent(),/تعديل/);
  await page.getByRole("group",{name:"خصائص الصندوق"}).getByLabel("حجم خط الصندوق").fill("18");
  assert.equal(await solution.locator("xpath=../..").getAttribute("data-block-size"),"18");
  await example.getByText("النتيجة النهائية",{exact:true}).waitFor();
  await page.getByRole("button",{name:"تقديم القسم",exact:true}).click();
  assert.equal(await example.locator(":scope > .creative-block-content > section").first().getAttribute("data-education-block"),"solution");
  await page.getByRole("button",{name:"إضافة ملاحظة للمثال",exact:true}).click();
  await example.locator('[data-education-block="note"]').waitFor();
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
async function captureEducationalDesign(browser) {
  const page = await browser.newPage({viewport:{width:1536,height:1320}});
  try {
    await page.goto(home);
    await page.getByRole("button",{name:"مستند فارغ",exact:true}).click();
    await page.getByRole("tab",{name:"أنماط",exact:true}).click();
    await page.getByRole("button",{name:"معرض الصناديق التعليمية"}).click();
    await page.getByRole("button",{name:"تثبيت",exact:true}).click();
    const library=page.getByRole("region",{name:"مكتبة أنماط الصناديق"});
    const root=page.locator(".editor-source .tiptap");
    const heading=page.locator(".document-title-input");
    await heading.fill("نماذج الإخراج التعليمي");
    const entries=[
      ["chapter","عنوان الفصل","التفاضل وتطبيقاته"],
      ["lesson","عنوان الدرس","اختبار المشتقة الأولى"],
      ["definition","تعريف","عند النقطة الحرجة تكون المشتقة صفرًا أو غير موجودة."],
      ["law","قانون","مشتقة مربع المتغير تساوي ضعفه."],
      ["theorem","نظرية","تغيّر إشارة المشتقة من السالب إلى الموجب يدل على قيمة صغرى محلية."]
    ];
    const insert=async ([kind,label,content])=>{
      await library.getByRole("button",{name:`إدراج ${label}`,exact:true}).click();
      const paragraph=root.locator(`:scope > [data-education-block="${kind}"] p`).last();
      await paragraph.click();
      await page.keyboard.insertText(content);
    };
    for(const entry of entries) await insert(entry);
    await library.getByRole("button",{name:"إدراج مثال محلول",exact:true}).click();
    const example=root.locator(':scope > [data-education-block="example"]');
    for (const [kind,text] of [["custom","أوجد القيمة الصغرى للدالة س²."],["solution","تتغيّر إشارة المشتقة عند الصفر من سالبة إلى موجبة."],["summary","القيمة الصغرى تساوي صفرًا."]]) {
      const p=example.locator(`[data-education-block="${kind}"] p`);
      await p.click();
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+End");
      await page.keyboard.insertText(text);
    }
    await example.locator(":scope > .creative-block-label").click();
    for(const entry of [
      ["proof","برهان","نقارن إشارة المشتقة على جانبي النقطة."],
      ["note","ملاحظة","افحص طرفي الفترة المغلقة."],
      ["warning","تنبيه","لا يكفي انعدام المشتقة للحكم وحده."],
      ["ministerial-question","سؤال وزاري","حدّد القيمة الصغرى للدالة ومكان تحققها."],
      ["exercise","تمرين","طبّق الاختبار على دالة تربيعية أخرى."]
    ]) await insert(entry);
    await page.getByRole("button",{name:"التصميم والصناديق",exact:true}).click();
    assert.equal(await root.locator(":scope > .creative-block").count(),11);
    await page.screenshot({path:join(output,"educational-design-editor.png"),fullPage:true});
    await page.getByRole("tab",{name:"ملف",exact:true}).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button",{name:"تصدير المستند كملف قابل للتحرير"}).click();
    await (await download).saveAs(join(output,"educational-design.mathdoc"));
    await page.getByRole("button",{name:"طباعة / PDF",exact:true}).click();
    await page.getByRole("region",{name:"معاينة الطباعة"}).getByText(/صفحة A4/).waitFor();
    assert.equal(await page.locator(".print-sheet").count(),1);
    assert.equal(await page.locator(".print-sheet-content > .creative-block").count(),11);
    await page.pdf({path:join(output,"educational-design.pdf"),preferCSSPageSize:true});
  } finally { await page.close(); }
}
async function captureMediaDesign(browser) {
  const page = await browser.newPage({viewport:{width:1440,height:1200}});
  try {
    await page.goto(home);
    await page.getByRole("button",{name:"مستند فارغ",exact:true}).click();
    await page.locator(".document-title-input").fill("لوحة الصور والأشكال الهندسية");
    const root=page.locator(".editor-source .tiptap");
    await root.locator("p").first().click();
    await page.keyboard.insertText("لوحة الصور والأشكال الهندسية");
    await page.keyboard.press("Enter");
    await page.getByRole("tab",{name:"إدراج",exact:true}).click();
    const chooser=page.waitForEvent("filechooser");
    await page.getByRole("button",{name:"إدراج صورة",exact:true}).click();
    await (await chooser).setFiles(join(__dirname,"icon-512.png"));
    await root.locator(".studio-image img[src]").waitFor();
    const image=root.locator(".studio-image img");
    await image.click();
    const imageProperties=page.getByRole("group",{name:"خصائص الصورة"});
    await imageProperties.getByLabel("العرض (مم)").waitFor();
    assert.equal(await page.getByLabel("الأشكال الهندسية").count(), 0);
    assert.equal(await page.getByRole("button",{name:"مكتبة أنماط الصناديق"}).count(), 0);
    await imageProperties.getByLabel("العرض (مم)").fill("44");
    await page.getByRole("button",{name:"التصميم والصناديق",exact:true}).click();
    await imageProperties.getByLabel("التسمية",{exact:true}).fill("عينة صورة نقطية");
    await page.getByLabel("الأشكال الهندسية").selectOption("triangle");
    const shape=root.locator(".studio-shape");
    await shape.click();
    const shapeProperties=page.getByRole("group",{name:"خصائص الشكل"});
    await shapeProperties.getByLabel("التسمية",{exact:true}).fill("مثلث قابل للتحرير");
    await shapeProperties.getByLabel("قياس خط البُعد").fill("٦ سم");
    await shapeProperties.getByLabel("أسماء النقاط، مفصولة بفاصلة").fill("A,B,C");
    await page.getByRole("tab",{name:"ملف",exact:true}).click();
    const download=page.waitForEvent("download");
    await page.getByRole("button",{name:"تصدير المستند كملف قابل للتحرير"}).click();
    await (await download).saveAs(join(output,"media-design.mathdoc"));
    await page.getByRole("button",{name:"التصميم والصناديق",exact:true}).click();
    await page.screenshot({path:join(output,"media-design-editor.png")});
    await page.getByRole("button",{name:"طباعة / PDF",exact:true}).click();
    await page.getByRole("region",{name:"معاينة الطباعة"}).getByText(/صفحة A4/).waitFor();
    assert.equal(await page.locator(".print-sheet").count(),1);
    await page.locator(".print-sheet .studio-image img[src]").waitFor();
    await page.locator(".print-sheet .studio-shape").getByText("٦ سم",{exact:true}).waitFor();
    await page.pdf({path:join(output,"media-design.pdf"),preferCSSPageSize:true});
  } finally {await page.close();}
}

async function captureTemplates(browser) {
  for (const [title, fileName] of [
    [/القطوع المخروطية/,"conics"], [/امتحان رياضيات/,"exam"],
    [/غلاف الفصل الدراسي/,"cover"], [/ورقة قوانين التفاضل/,"formula-sheet"], [/تمارين على القيم القصوى/,"practice"], [/مراجعة مركزة/,"review"]
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
    const stylePage = await browser.newPage();
    try { await verifyStyleLibrary(stylePage, !!output && engine===chromium); }
    finally { await stylePage.close(); }
    if (output && engine===chromium) { await captureTemplates(browser); await captureEducationalDesign(browser); await captureMediaDesign(browser); }
    console.log(engine.name(),"creative lesson editor, IndexedDB and print verified on desktop and iPad emulation");
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
