import { Node } from "@tiptap/core";

const shapes: Record<string,[string,string]> = {
  line:["مستقيم","M5 95L195 25"], segment:["قطعة مستقيمة","M35 85L165 35 M32 85a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M162 35a3 3 0 1 0 6 0a3 3 0 1 0-6 0"],
  ray:["شعاع","M30 90L178 30l-15-2 M178 30l-9 12"],arrow:["سهم","M22 60h152l-15-12 M174 60l-15 12"],
  triangle:["مثلث","M100 15L175 105H25Z"],square:["مربع","M55 15h90v90H55Z"],rectangle:["مستطيل","M25 25h150v70H25Z"],
  parallelogram:["متوازي الأضلاع","M56 28h120l-35 70H22Z"],trapezoid:["شبه منحرف","M59 28h82l38 68H21Z"],
  circle:["دائرة","M144 60a44 44 0 1 1-88 0a44 44 0 1 1 88 0Z"],
  sector:["قطاع دائري","M100 63L100 15A48 48 0 0 1 147 69Z"],ellipse:["قطع ناقص","M173 60a73 37 0 1 1-146 0a73 37 0 1 1 146 0Z"],
  angle:["زاوية","M34 93h135 M34 93l92-66 M67 93a33 33 0 0 0-6-20"],
  pentagon:["خماسي","M100 12l53 38-20 58H67L47 50Z"],
  cube:["مكعب","M51 37h70v70H51Z M51 37l26-26h70v70l-26 26 M121 37l26-26"],
  cuboid:["متوازي مستطيلات","M28 43h115v61H28Z M28 43l23-26h115v61l-23 26 M143 43l23-26"],
  cone:["مخروط","M100 12L50 91a50 14 0 1 0 100 0Z M50 91a50 14 0 0 1 100 0"],
  cylinder:["أسطوانة","M52 30a48 14 0 1 0 96 0a48 14 0 1 0-96 0Z M52 30v61a48 14 0 1 0 96 0V30"],
  sphere:["كرة","M145 60a45 45 0 1 1-90 0a45 45 0 1 1 90 0 M145 60a45 14 0 1 1-90 0a45 14 0 1 1 90 0"],
  pyramid:["هرم","M92 12L38 92l40 16 86-22-40-17Z M92 12l-14 96 M92 12l72 74 M92 12l32 57"],
  prism:["منشور","M55 40l-31 61h62Z M55 40l72-24 31 61-72 24 M24 101l72-24 31-61"]
};
export const shapeOptions = Object.entries(shapes).map(([id,[label]])=>({id,label}));
const svgNS="http://www.w3.org/2000/svg";
const paint=(value:unknown,fallback:string)=>typeof value==="string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const bounded=(value:unknown,min:number,max:number,fallback:number)=>typeof value==="number" && Number.isFinite(value) ? Math.min(max,Math.max(min,value)) : fallback;

export function drawShape(attrs:Record<string,unknown>) {
  const svg=document.createElementNS(svgNS,"svg");
  svg.setAttribute("xmlns",svgNS);
  svg.setAttribute("viewBox","0 0 200 145");
  svg.setAttribute("width","200");
  svg.setAttribute("height","145");
  const group=document.createElementNS(svgNS,"g");
  group.setAttribute("transform",`rotate(${bounded(attrs.rotation,-360,360,0)} 100 60)`);
  const path=document.createElementNS(svgNS,"path");
  const shape=Object.hasOwn(shapes,String(attrs.kind)) ? shapes[String(attrs.kind)] : shapes.triangle;
  path.setAttribute("d",shape[1]);
  path.setAttribute("fill",attrs.filled===true ? paint(attrs.fill,"#dbeafe") : "none");
  path.setAttribute("stroke",paint(attrs.stroke,"#193c6b"));
  path.setAttribute("stroke-width",String(bounded(attrs.weight,1,10,2)));
  path.setAttribute("opacity",String(bounded(attrs.opacity,0,1,1)));
  if(attrs.dashed===true) path.setAttribute("stroke-dasharray","5 4");
  group.append(path);
  svg.append(group);
  const label=document.createElementNS(svgNS,"text");
  label.setAttribute("x","100"); label.setAttribute("y","132"); label.setAttribute("text-anchor","middle");
  label.setAttribute("font-size","12");
  label.setAttribute("style","font-family: sans-serif");
  label.textContent=typeof attrs.label==="string" ? attrs.label.slice(0,150) : "";
  svg.append(label);
  return svg;
}

export const StudioShape = Node.create({
  name:"studioShape", group:"block", atom:true, draggable:true,
  addAttributes:()=>{
    const attrs:Record<string,{default:unknown;parseHTML:(el:HTMLElement)=>unknown}>={};
    for(const [key,value] of Object.entries({kind:"triangle",label:"",widthMm:55,rotation:0,stroke:"#193c6b",fill:"#dbeafe",filled:false,weight:2,opacity:1,dashed:false})) {
      attrs[key]={default:value,parseHTML:el=>{
        try {return JSON.parse(el.dataset.studioShape || "{}")[key] ?? value;} catch {return value;}
      }};
    }
    return attrs;
  },
  parseHTML:()=>[{tag:"figure[data-studio-shape]"}],
  renderHTML:({node})=>["figure",{"data-studio-shape":JSON.stringify(node.attrs)},"شكل هندسي"],
  addNodeView() {
    return ({node})=>{
      const dom=document.createElement("figure");
      dom.className="studio-shape";
      const draw=(attrs:Record<string,unknown>)=>{
        dom.dataset.studioShape=JSON.stringify(attrs);
        dom.style.width=bounded(attrs.widthMm,15,250,55)+"mm";
        dom.replaceChildren(drawShape(attrs));
      };
      draw(node.attrs);
      return {dom,update:updated=>{if(updated.type!==node.type)return false;draw(updated.attrs);return true;}};
    };
  }
});
