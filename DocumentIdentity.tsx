import { useState } from "react";
import { blockFonts, readDocumentIdentity, type PublishingIdentity } from "./creativeDesign";

const key = "mathpress:publishing-identities";
const defaults: PublishingIdentity = {name:"",accent:"#193c6b",tint:"#eef4fa",font:"Cairo"};

function savedIdentities(): PublishingIdentity[] {
  try {
    const records: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(records) ? records.flatMap(value => {
      const identity = readDocumentIdentity(value);
      return identity ? [identity] : [];
    }) : [];
  } catch { return []; }
}

export default function DocumentIdentity({current,apply,notice}: {
  current?: PublishingIdentity;
  apply: (identity?: PublishingIdentity) => void;
  notice: (message: string) => void;
}) {
  const [draft,setDraft] = useState(current ?? defaults);
  const [library,setLibrary] = useState(savedIdentities);
  const update = (patch: Partial<PublishingIdentity>) => setDraft(previous=>({...previous,...patch}));
  const candidate = readDocumentIdentity(draft);
  const store = (next: PublishingIdentity[]) => {
    try {localStorage.setItem(key,JSON.stringify(next));setLibrary(next);}
    catch {notice("تعذّر حفظ الهوية على هذا الجهاز.");}
  };
  const importIdentity = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size>16_384) throw new Error();
      const identity = readDocumentIdentity(JSON.parse(await file.text()));
      if (!identity) throw new Error();
      if (savedIdentities().some(item=>item.name===identity.name)) {
        notice("توجد هوية بهذا الاسم. اختر اسمًا مختلفًا في ملف الهوية.");
        return;
      }
      store([...savedIdentities(),identity]);
      setDraft(identity);
    } catch { notice("تعذّر قراءة ملف الهوية."); }
  };
  return <details className="publishing-identity">
    <summary>هوية مخصصة للملزمة</summary>
    <fieldset>
      <legend>ألوان وخط الملزمة</legend>
      <label>اسم الهوية <input maxLength={60} value={draft.name} onChange={e=>update({name:e.target.value})}/></label>
      <label>لون العناوين <input type="color" value={draft.accent} onChange={e=>update({accent:e.target.value})}/></label>
      <label>خلفية الصناديق <input type="color" value={draft.tint} onChange={e=>update({tint:e.target.value})}/></label>
      <label>خط الملزمة <select value={draft.font} onChange={e=>update({font:blockFonts.find(x=>x===e.target.value) ?? defaults.font})}>
        {blockFonts.map(font=><option key={font}>{font}</option>)}
      </select></label>
      <span className="publishing-identity-sample" style={{color:draft.accent,background:draft.tint,fontFamily:draft.font}}>عنوان الملزمة</span>
      <button type="button" disabled={!candidate} onClick={()=>candidate && apply(candidate)}>تطبيق الهوية على الملزمة</button>
      <button type="button" disabled={!candidate} onClick={()=>{
        if (!candidate) return;
        const next=[...savedIdentities().filter(item=>item.name!==candidate.name),candidate];
        store(next);
      }}>حفظ الهوية</button>
      <label>الهويات المحفوظة <select value="" onChange={e=>{
        const chosen=library.find(item=>item.name===e.target.value);
        if(chosen){setDraft(chosen);apply(chosen);}
      }}>
        <option value="">اختر هوية</option>
        {library.map(item=><option key={item.name}>{item.name}</option>)}
      </select></label>
      <button type="button" disabled={!candidate} onClick={()=>{
        if(!candidate) return;
        const url=URL.createObjectURL(new Blob([JSON.stringify(candidate,null,2)],{type:"application/json"}));
        const anchor=document.createElement("a");
        anchor.href=url; anchor.download="mathpress-identity.json"; anchor.click();
        window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      }}>تصدير الهوية</button>
      <label>استيراد هوية <input type="file" accept=".json,application/json" onChange={event=>{
        const input=event.currentTarget;
        const file=input.files?.[0];
        void importIdentity(file).finally(()=>{if(input.files?.[0]===file) input.value="";});
      }}/></label>
      <button type="button" disabled={!library.some(item=>item.name===draft.name)} onClick={()=>{
        if(window.confirm(`إزالة «${draft.name}» من المكتبة؟`)) store(savedIdentities().filter(item=>item.name!==draft.name));
      }}>إزالة الهوية من المكتبة</button>
    </fieldset>
  </details>;
}
