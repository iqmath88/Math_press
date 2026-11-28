export const furniturePresets = [
  ["academic","أكاديمي أزرق",true],
  ["minimal","عصري بسيط",false],
  ["gold","عاجي وذهبي",true],
  ["mathematical","رياضي كلاسيكي",true],
  ["exam","امتحاني",true],
  ["school","مدرسي رسمي",true],
  ["book","كتاب تعليمي",true],
  ["ink","أبيض وأسود",false]
] as const;
type FurniturePreset = typeof furniturePresets[number][0];

export type PageFurniture = {
  headerEnd:string;
  preset?: FurniturePreset;
  headerCenter?:string;
  footerCenter?:string;
  footerEnd:string;
  numberStart:number;
  arabicDigits:boolean;
  rule:boolean;
};

export const defaultFurniture:PageFurniture = {headerEnd:"",footerEnd:"",numberStart:1,arabicDigits:false,rule:false};

export function readPageFurniture(input:unknown):PageFurniture | undefined {
  if (!input || typeof input!=="object") return;
  const data=input as Record<string,unknown>;
  const {headerEnd,footerEnd,numberStart,arabicDigits,rule}=data;
  if(typeof headerEnd!=="string" || headerEnd.length>140 || typeof footerEnd!=="string" || footerEnd.length>140 ||
    typeof numberStart!=="number" || !Number.isInteger(numberStart) || numberStart<1 || numberStart>9999 ||
    typeof arabicDigits!=="boolean" || typeof rule!=="boolean") return;
  const {headerCenter,footerCenter,preset}=data;
  const theme=furniturePresets.find(item=>item[0]===preset);
  if(preset!==undefined && !theme) return;
  if ((headerCenter!==undefined && (typeof headerCenter!=="string" || headerCenter.length>140)) ||
      (footerCenter!==undefined && (typeof footerCenter!=="string" || footerCenter.length>140))) return;
  return {headerEnd,footerEnd,numberStart,arabicDigits,rule,
    ...(theme ? {preset:theme[0]} : {}),
    ...(typeof headerCenter==="string" ? {headerCenter} : {}),
    ...(typeof footerCenter==="string" ? {footerCenter} : {})};
}

export function pageNumber(page:number,total:number,furniture?:PageFurniture) {
  const label=`صفحة ${page+(furniture?.numberStart ?? 1)-1} من ${total+(furniture?.numberStart ?? 1)-1}`;
  return furniture?.arabicDigits ? label.replace(/[0-9]/g,value=>"٠١٢٣٤٥٦٧٨٩"[Number(value)]) : label;
}

export function applyFurniture(container: HTMLElement, text:string, end?:string, rule=false, center?:string, preset?:FurniturePreset) {
  const lead=document.createElement("span");
  lead.textContent=text;
  container.append(lead);
  if(center) {
    const middle=document.createElement("span");
    middle.className="furniture-center";
    middle.textContent=center;
    container.append(middle);
  }
  if(end){
    const trail=document.createElement("span");
    trail.textContent=end;
    container.append(trail);
  }
  if(rule) container.dataset.furnitureRule="true";
  if(preset) container.dataset.furniturePreset=preset;
}
