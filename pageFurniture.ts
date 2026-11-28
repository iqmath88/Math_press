export type PageFurniture = {
  headerEnd:string;
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
  return {headerEnd,footerEnd,numberStart,arabicDigits,rule};
}

export function pageNumber(page:number,total:number,furniture?:PageFurniture) {
  const label=`صفحة ${page+(furniture?.numberStart ?? 1)-1} من ${total+(furniture?.numberStart ?? 1)-1}`;
  return furniture?.arabicDigits ? label.replace(/[0-9]/g,value=>"٠١٢٣٤٥٦٧٨٩"[Number(value)]) : label;
}

export function applyFurniture(container: HTMLElement, text:string, end?:string, rule=false) {
  const lead=document.createElement("span");
  lead.textContent=text;
  container.append(lead);
  if(end){
    const trail=document.createElement("span");
    trail.textContent=end;
    container.append(trail);
  }
  if(rule) container.dataset.furnitureRule="true";
}
