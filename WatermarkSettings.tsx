import { fileToDataUrl } from "./imageUtil";
import { defaultWatermark, type Watermark } from "./watermark";
import { useState } from "react";

export default function WatermarkSettings({value,onChange}:{value?:Watermark;onChange:(w?:Watermark)=>void}) {
  const [error,setError]=useState("");
  const set=(patch:Partial<Watermark>)=>onChange({...value ?? defaultWatermark,...patch});
  return <fieldset className="setting-block">
    <legend>العلامة المائية</legend>
    <label>النوع <select aria-label="نوع العلامة المائية" value={value?.kind ?? ""} onChange={e=>{
      if (!e.target.value) onChange(undefined);
      else set({kind:e.target.value==="image"?"image":"text",value:""});
    }}><option value="">بلا علامة</option><option value="text">نص</option><option value="image">صورة أو شعار</option></select></label>
    {value && <>
      {value.kind==="text" ? <>
        <label>نص العلامة المائية <input value={value.value} maxLength={160} onChange={e=>set({value:e.target.value})}/></label>
        <label>لون العلامة <input type="color" value={value.color} onChange={e=>set({color:e.target.value})}/></label>
      </> : <label>صورة العلامة المائية <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{
        const file=e.currentTarget.files?.[0];
        if(!file) return;
        try {
          if(!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size>12_000_000) throw new Error();
          const data=await fileToDataUrl(file,800);
          if(data.length>2_000_000) throw new Error();
          set({value:data});setError("");
        } catch {setError("تعذّر تحميل الصورة. اختر PNG أو JPEG أو WebP أصغر.");}
      }}/></label>}
      <label>شفافية العلامة <input type="range" min=".01" max=".65" step=".01" value={value.opacity} onChange={e=>set({opacity:e.target.valueAsNumber})}/></label>
      <label>دوران العلامة <input type="range" min="-180" max="180" value={value.rotation} onChange={e=>set({rotation:e.target.valueAsNumber})}/></label>
      <label>حجم العلامة <input type="range" min="12" max="90" value={value.size} onChange={e=>set({size:e.target.valueAsNumber})}/></label>
      <label>موضع العلامة <select value={value.position} onChange={e=>set({position:e.target.value as Watermark["position"]})}>
        <option value="top">أعلى</option><option value="center">وسط</option><option value="bottom">أسفل</option>
      </select></label>
      <label>الصفحات المستهدفة <select value={value.pages} onChange={e=>set({pages:e.target.value as Watermark["pages"]})}>
        <option value="all">الكل</option><option value="first">الأولى</option><option value="odd">الفردية</option><option value="even">الزوجية</option>
      </select></label>
      <label><input type="checkbox" checked={value.repeat} onChange={e=>set({repeat:e.target.checked})}/> تكرار داخل الصفحة</label>
    </>}
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}
