const {chromium}=require('playwright-core');
const fs=require('node:fs');
const {join}=require('node:path');
const output=process.env.MATHPRESS_QA_OUTPUT || '.';
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const b=await chromium.launch(process.env.MATHPRESS_CHROMIUM ? {executablePath:process.env.MATHPRESS_CHROMIUM} : {});
 for(const [index,url] of process.argv.slice(2).entries()){
  const p=await b.newPage({viewport:{width:1440,height:1000}});
  await p.goto(url);
  await p.getByRole('button',{name:'مستند فارغ',exact:true}).click();
  const el=p.locator('.editor-source .tiptap');
  await el.evaluate(el=>{
   const e=el.editor;
   const content=Array.from({length:50},(_,i)=>[
     ...(i?[{type:'pageBreak'}]:[]),
     ...Array.from({length:4},()=>({type:'paragraph',content:[{type:'text',text:'لغة عربية مع كتابة تعليمية. '.repeat(5)}]}))
   ]).flat();
   e.commands.setContent({type:'doc',content},true);
  });
  await p.waitForFunction(()=>document.querySelector('.tiptap').editor.storage.pagination.pages===50);
  await p.evaluate(()=>document.fonts.ready);
  await el.evaluate(el=>{
    window.counts={doc:0,pages:0,mathConnects:0};
    el.editor.on("transaction",({transaction})=>{
      if(transaction.docChanged) window.counts.doc++;
      if(Object.keys(transaction.meta).some(key=>key.startsWith("mathpress-pagination"))) window.counts.pages++;
    });
    new MutationObserver(records=>{
      for(const record of records) for(const node of record.addedNodes)
        if(node instanceof Element) window.counts.mathConnects+= (node.matches("math-field")?1:0)+node.querySelectorAll("math-field").length;
    }).observe(el,{subtree:true,childList:true});
  });
  const c=await p.context().newCDPSession(p);
  const events=[];c.on('Tracing.dataCollected',e=>events.push(...e.value));
  await c.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline.stack,v8'});
  for(let i=0;i<12;i++){
   await el.evaluate(el=>{
    const e=el.editor;
    e.commands.focus(1);
    e.commands.insertContentAt(1,'$x^2+1');
   });
   await p.waitForFunction(()=>document.activeElement?.classList.contains('tiptap'));
   await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await p.evaluate(i=>performance.mark('convert-start-'+i),i);
   await p.keyboard.press('$');
   await p.evaluate(i=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
    performance.mark('convert-end-'+i);r();
   }))),i);
  }
  const done=new Promise(r=>c.once('Tracing.tracingComplete',r));
  await c.send('Tracing.end');await done;
  fs.writeFileSync(join(output,`conversion-trace-${index+1}.json`),JSON.stringify(events));
  console.log(url,await p.evaluate(()=>window.counts));
  await p.close();
 }
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
