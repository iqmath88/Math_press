export type Watermark = {
  kind: "text" | "image";
  value: string;
  opacity: number;
  rotation: number;
  size: number;
  position: "center" | "top" | "bottom";
  pages: "all" | "first" | "odd" | "even";
  repeat: boolean;
  color: string;
};

export const defaultWatermark: Watermark = {
  kind:"text", value:"", opacity:.12, rotation:-35, size:52,
  position:"center", pages:"all", repeat:false, color:"#193c6b"
};

export function readWatermark(input: unknown): Watermark | undefined {
  if (!input || typeof input !== "object") return;
  const w = input as Record<string, unknown>;
  if ((w.kind !== "text" && w.kind !== "image") || typeof w.value !== "string" || !w.value.trim() ||
      (w.kind === "text" ? w.value.length > 160 :
        w.value.length > 2_000_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(w.value)) ||
      typeof w.opacity !== "number" || !Number.isFinite(w.opacity) || w.opacity < .01 || w.opacity > .65 ||
      typeof w.rotation !== "number" || !Number.isFinite(w.rotation) || w.rotation < -180 || w.rotation > 180 ||
      typeof w.size !== "number" || !Number.isFinite(w.size) || w.size < 12 || w.size > 90 ||
      (w.position !== "center" && w.position !== "top" && w.position !== "bottom") ||
      (w.pages !== "all" && w.pages !== "first" && w.pages !== "odd" && w.pages !== "even") ||
      typeof w.repeat !== "boolean" || typeof w.color !== "string" || !/^#[0-9a-f]{6}$/i.test(w.color)) return;
  return {kind:w.kind,value:w.value,opacity:w.opacity,rotation:w.rotation,size:w.size,
    position:w.position,pages:w.pages,repeat:w.repeat,color:w.color};
}

export function watermarkOnPage(watermark: Watermark, page: number) {
  return watermark.pages==="all" || (watermark.pages==="first" && page===1) ||
    (watermark.pages==="odd" && page%2===1) || (watermark.pages==="even" && page%2===0);
}

export function createWatermarkLayer(watermark: Watermark) {
  const layer = document.createElement("div");
  layer.className = "page-watermark";
  layer.dataset.position = watermark.position;
  layer.dataset.repeat = String(watermark.repeat);
  layer.setAttribute("aria-hidden","true");
  for (let index=0; index<(watermark.repeat?6:1); index++) {
    const mark = document.createElement(watermark.kind==="image"?"img":"span");
    mark.style.opacity=String(watermark.opacity);
    mark.style.rotate=watermark.rotation+"deg";
    if (mark instanceof HTMLImageElement) {
      mark.src=watermark.value;
      mark.alt="";
      mark.style.inlineSize=watermark.size+"%";
    } else {
      mark.textContent=watermark.value;
      mark.style.fontSize=watermark.size+"px";
      mark.style.color=watermark.color;
    }
    layer.append(mark);
  }
  return layer;
}
