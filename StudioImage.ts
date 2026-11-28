import Image from "@tiptap/extension-image";
import { Plugin } from "@tiptap/pm/state";
import { assetReference, readImage, storeImage } from "./imageAssets";

export const pendingStudioImages = new WeakMap<HTMLImageElement, Promise<void>>();

export const StudioImage = Image.extend({
  addAttributes() {
    const attrs = {...this.parent?.()};
    for (const name of ["width","widthMm","rotation","opacity","border","align","crop","caption"]) {
      attrs[name] = {default:null,parseHTML:el=>{
        const raw = el.getAttribute("data-image-"+name);
        try { return raw === null ? (name==="width" ? el.style.width || null : null) : JSON.parse(raw); }
        catch { return null; }
      },renderHTML:value=>value[name]==null ? {} : {["data-image-"+name]:JSON.stringify(value[name])}};
    }
    return attrs;
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const insert = (data: DataTransfer | null, pos: number) => {
      const file = data && ([...data.files].find(value => value.type.startsWith("image/")) ??
        [...data.items].find(item => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile());
      if (!file) return false;
      const original = editor.state.doc;
      void storeImage(file).then(src=>{
        if (!editor.isDestroyed && editor.state.doc===original)
          editor.chain().focus().insertContentAt(pos,{type:"image",attrs:{src,alt:file.name}}).run();
        else if (!editor.isDestroyed)
          editor.view.dom.dispatchEvent(new CustomEvent("studio-image-error",{detail:"تغيّر المستند أثناء قراءة الصورة. أعد الإدراج في الموضع المطلوب."}));
      }).catch(error=>{ if (!editor.isDestroyed) editor.view.dom.dispatchEvent(new CustomEvent("studio-image-error",{detail:String(error.message)})); });
      return true;
    };
    return [new Plugin({props:{
      handlePaste:(view,event)=>insert(event.clipboardData,view.state.selection.from),
      handleDrop:(view,event,_slice,moved)=>{
        if(moved) return false;
        const pos = view.posAtCoords({left:event.clientX,top:event.clientY})?.pos;
        return pos===undefined ? false : insert(event.dataTransfer,pos);
      }
    }})];
  },
  addNodeView() {
    return ({node})=>{
      const dom=document.createElement("figure");
      dom.className="studio-image";
      const image=document.createElement("img");
      const caption=document.createElement("figcaption");
      dom.append(image,caption);
      let previous="", url="", destroyed=false;
      const put = (attrs: Record<string,unknown>)=>{
        if(typeof attrs.src==="string" && previous!==attrs.src) {
          previous=attrs.src;
          const src=previous;
          if(url) URL.revokeObjectURL(url);
          url="";
          if(assetReference.test(src)) {
            image.removeAttribute("src");
            const ready = readImage(src).then(blob=>{
              if(!destroyed && previous===src) image.src=url=URL.createObjectURL(blob);
            });
            pendingStudioImages.set(image,ready);
            void ready.catch(()=>{if(!destroyed && previous===src) image.alt="أصل الصورة غير موجود";});
          } else {
            pendingStudioImages.delete(image);
            image.src=src;
          }
        }
        image.alt=typeof attrs.alt==="string" ? attrs.alt : "";
        image.title=typeof attrs.title==="string" ? attrs.title : "";
        caption.textContent=typeof attrs.caption==="string" ? attrs.caption : "";
        caption.hidden=!caption.textContent;
        const width=Number(attrs.widthMm);
        dom.style.width=width>0 && width<=400 ? width+"mm" :
          typeof attrs.width==="string" && /^\d+(?:\.\d+)?%?$/.test(attrs.width) ? (attrs.width.endsWith("%") ? attrs.width : attrs.width+"px") : "";
        dom.style.marginInlineStart=attrs.align==="end" || attrs.align==="center" ? "auto" : "0";
        dom.style.marginInlineEnd=attrs.align==="start" || attrs.align==="center" ? "auto" : "0";
        image.style.rotate=typeof attrs.rotation==="number" ? Math.max(-360,Math.min(360,attrs.rotation))+"deg" : "";
        image.style.opacity=attrs.opacity==null ? "" : String(Math.max(0,Math.min(1,Number(attrs.opacity))));
        image.style.border=typeof attrs.border==="number" ? Math.max(0,Math.min(12,attrs.border))+"px solid currentColor" : "";
        const crop=typeof attrs.crop==="number" ? Math.max(0,Math.min(45,attrs.crop)) : 0;
        image.style.clipPath=crop ? `inset(${crop}%)` : "";
      };
      put(node.attrs);
      return {dom,update:updated=>{if(updated.type!==node.type)return false;put(updated.attrs);return true;},destroy:()=>{
        destroyed=true;
        if(url) URL.revokeObjectURL(url);
      }};
    };
  }
});
