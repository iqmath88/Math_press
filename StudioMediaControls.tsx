import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { drawShape, shapeOptions } from "./StudioShape";
import { storeImage } from "./imageAssets";

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href=url;anchor.download=name;anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};

export default function StudioMediaControls({editor,onNotice}:{editor:Editor;onNotice:(message:string)=>void}) {
  const selection=editor.state.selection;
  const selected=selection instanceof NodeSelection ? selection.node : null;
  const attrs=selected?.attrs ?? {};
  const image=selected?.type.name==="image";
  const shape=selected?.type.name==="studioShape";
  const edit=(data:Record<string,unknown>)=>{
    const current=editor.state.selection;
    if(current instanceof NodeSelection && current.node.type===selected?.type) {
      const tr=editor.state.tr.setNodeMarkup(current.from,undefined,{...current.node.attrs,...data});
      editor.view.dispatch(tr.setSelection(NodeSelection.create(tr.doc,current.from)));
    }
  };
  const number=(label:string,key:string,min:number,max:number,step=1)=><label>{label} <input type="number" min={min} max={max} step={step}
    value={attrs[key] ?? ""} onChange={event=>{
      const value=event.target.valueAsNumber;
      edit({[key]:Number.isFinite(value) ? Math.min(max,Math.max(min,value)) : null});
    }}/></label>;
  async function replace(file?:File) {
    if(!file) return;
    try {
      const src=await storeImage(file);
      if(editor.isDestroyed) return;
      if(editor.state.selection instanceof NodeSelection && editor.state.selection.node===selected) edit({src});
      else onNotice("تغيّر تحديد الصورة. أعد اختيار الصورة المطلوب استبدالها.");
    } catch(error) {onNotice(String((error as Error).message));}
  }
  const shapeBlob = () => new Blob([new XMLSerializer().serializeToString(drawShape(attrs))],{type:"image/svg+xml"});
  async function png() {
    const url=URL.createObjectURL(shapeBlob());
    try {
      const image=new Image();
      image.src=url;
      await image.decode();
      const canvas=document.createElement("canvas");
      canvas.width=2400;canvas.height=1740;
      const context=canvas.getContext("2d");
      if(!context) throw new Error("تعذر تجهيز الصورة.");
      context.drawImage(image,0,0,2400,1740);
      canvas.toBlob(blob=>blob ? download(blob,"shape.png") : onNotice("تعذر تصدير الصورة."));
    } catch {onNotice("تعذر تصدير الصورة.");}
    finally {URL.revokeObjectURL(url);}
  }
  const dpi=() => {
    if(!image || !attrs.widthMm) return;
    const dom=editor.view.nodeDOM(selection.from);
    const element=dom instanceof Element ? dom.querySelector("img") : null;
    if(!element?.naturalWidth) return onNotice("لم تكتمل قراءة أبعاد الصورة.");
    const width=element.getBoundingClientRect().width;
    const pixels=Number(element.dataset.originalWidth) || element.naturalWidth;
    const value=Math.round(pixels * 96 / (element.offsetWidth || width));
    onNotice(`الدقة الأفقية عند العرض المحدد: ${value} DPI${value<300 ? " · أقل من 300 DPI" : ""}`);
  };
  return <>
    <label>الأشكال الهندسية <select value="" onChange={event=>{
      if (!event.target.value) return;
      const shape = {type:"studioShape",attrs:{kind:event.target.value}};
      const chain = editor.chain().focus();
      if (selection instanceof NodeSelection) chain.insertContentAt(selection.to,shape).run();
      else chain.insertContent(shape).run();
    }}><option value="">اختر شكلًا</option>{shapeOptions.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    {(image || shape) && <fieldset>
      <legend>{image ? "خصائص الصورة" : "خصائص الشكل"}</legend>
      {number("العرض (مم)","widthMm",15,250)}
      {number("الدوران","rotation",-360,360)}
      {number("الشفافية","opacity",0,1,.1)}
      <label>التسمية <input value={attrs[image?"caption":"label"] ?? ""} onChange={event=>edit({[image?"caption":"label"]:event.target.value})}/></label>
      {image ? <>
        {number("القص من كل حافة (%)","crop",0,45)}
        <details><summary>قص كل حافة على حدة</summary>
          {number("القص من الأعلى (%)","cropTop",0,45)}
          {number("القص من اليمين (%)","cropRight",0,45)}
          {number("القص من الأسفل (%)","cropBottom",0,45)}
          {number("القص من اليسار (%)","cropLeft",0,45)}
        </details>
        {number("سماكة الإطار","border",0,12)}
        <label>محاذاة الصورة <select value={attrs.align ?? "start"} onChange={event=>edit({align:event.target.value})}>
          <option value="start">البداية</option><option value="center">وسط</option><option value="end">النهاية</option>
        </select></label>
        <label>استبدال الصورة <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={event=>{
          void replace(event.target.files?.[0]);event.target.value="";
        }}/></label>
        <button type="button" disabled={!attrs.widthMm} onClick={dpi}>فحص الدقة النقطية</button>
      </> : <>
        {number("سماكة خط الشكل","weight",1,10)}
        {["triangle","rectangle","square","circle"].includes(attrs.kind) && <>
          <label>قياس خط البُعد <input maxLength={50} value={attrs.dimension ?? ""} onChange={event=>edit({dimension:event.target.value})}/></label>
          <label>أسماء النقاط، مفصولة بفاصلة <input maxLength={60} value={attrs.pointNames ?? ""} onChange={event=>edit({pointNames:event.target.value})}/></label>
        </>}
        <label>لون الحدود <input type="color" value={attrs.stroke} onChange={event=>edit({stroke:event.target.value})}/></label>
        <label>لون التعبئة <input type="color" value={attrs.fill} onChange={event=>edit({fill:event.target.value,filled:true})}/></label>
        <label><input type="checkbox" checked={attrs.filled===true} onChange={event=>edit({filled:event.target.checked})}/> تعبئة</label>
        <label><input type="checkbox" checked={attrs.dashed===true} onChange={event=>edit({dashed:event.target.checked})}/> خط متقطع</label>
        <button type="button" onClick={()=>{
          if (selected) editor.chain().focus().insertContentAt(selection.to,selected.toJSON()).run();
        }}>تكرار الشكل</button>
        <button type="button" onClick={()=>editor.chain().focus().deleteSelection().run()}>حذف الشكل</button>
        <button type="button" onClick={()=>download(shapeBlob(),"shape.svg")}>تصدير SVG</button>
        <button type="button" onClick={()=>void png()}>تصدير PNG</button>
      </>}
    </fieldset>}
  </>;
}
