import { Node, mergeAttributes } from "@tiptap/core";
import { blockLabel, blockFonts, blockFrames } from "./creativeDesign";

export const CreativeBlock = Node.create({
  name: "educationBlock",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      kind: {default:"definition",parseHTML:el=>el.dataset.educationBlock,renderHTML:attrs=>({"data-education-block":attrs.kind})},
      title: {default:"",parseHTML:el=>el.dataset.blockTitle ?? "",renderHTML:attrs=>({"data-block-title":attrs.title})},
      hideTitle: {default:false,parseHTML:el=>el.dataset.hideTitle==="true",renderHTML:attrs=>({"data-hide-title":attrs.hideTitle ? "true" : null})},
      background: {default:null,parseHTML:el=>el.dataset.blockBackground ?? null,renderHTML:attrs=>
        typeof attrs.background==="string" && /^#[\da-f]{6}$/i.test(attrs.background)
          ? {"data-block-background":attrs.background,style:`--block-background:${attrs.background}`} : {}},
      padding: {default:null,parseHTML:el=>el.dataset.blockPadding ? Number(el.dataset.blockPadding) : null,renderHTML:attrs=>
        Number.isInteger(attrs.padding) && attrs.padding >= 0 && attrs.padding <= 48
          ? {"data-block-padding":attrs.padding,style:`--block-padding:${attrs.padding}px`} : {}},
      radius: {default:null,parseHTML:el=>el.dataset.blockRadius ? Number(el.dataset.blockRadius) : null,renderHTML:attrs=>
        Number.isInteger(attrs.radius) && attrs.radius >= 0 && attrs.radius <= 30
          ? {"data-block-radius":attrs.radius,style:`--block-radius:${attrs.radius}px`} : {}},
      frame: {default:null,parseHTML:el=>el.dataset.blockFrame ?? null,renderHTML:attrs=>
        blockFrames.some(frame=>frame===attrs.frame) ? {"data-block-frame":attrs.frame} : {}},
      font: {default:null,parseHTML:el=>el.dataset.blockFont ?? null,renderHTML:attrs=>
        blockFonts.some(font=>font===attrs.font) ? {"data-block-font":attrs.font,style:`--block-font:"${attrs.font}"`} : {}},
      size: {default:null,parseHTML:el=>el.dataset.blockSize ? Number(el.dataset.blockSize) : null,renderHTML:attrs=>
        Number.isInteger(attrs.size) && attrs.size>=10 && attrs.size<=30
          ? {"data-block-size":attrs.size,style:`--block-size:${attrs.size}px`} : {}},
      exampleNumber: {default:null,parseHTML:el=>el.dataset.exampleNumber ?? null,renderHTML:attrs=>
        typeof attrs.exampleNumber==="string" && /^[0-9٠-٩]{1,8}$/.test(attrs.exampleNumber)
          ? {"data-example-number":attrs.exampleNumber} : {}},
      surface: {default:null,parseHTML:el=>el.dataset.blockSurface ? Number(el.dataset.blockSurface) : null,renderHTML:attrs=>
        Number.isInteger(attrs.surface) && attrs.surface>=20 && attrs.surface<=100
          ? {"data-block-surface":attrs.surface,style:`--block-surface:${attrs.surface}%`} : {}},
      shadow: {default:null,parseHTML:el=>el.dataset.blockShadow ?? null,renderHTML:attrs=>
        attrs.shadow==="none" || attrs.shadow==="soft" ? {"data-block-shadow":attrs.shadow} : {}},
      accent: {default:null,parseHTML:el=>el.dataset.blockAccent ?? null,renderHTML:attrs=>
        typeof attrs.accent==="string" && /^#[\da-f]{6}$/i.test(attrs.accent)
          ? {"data-block-accent":attrs.accent,style:`--block-accent:${attrs.accent}`} : {}}
    };
  },
  parseHTML() { return [{tag:"section[data-education-block]",contentElement:".creative-block-content"}]; },
  renderHTML({node,HTMLAttributes}) {
    const number=HTMLAttributes["data-example-number"];
    const title=node.attrs.title || blockLabel(node.attrs.kind);
    return ["section",mergeAttributes(HTMLAttributes,{class:"creative-block"}),[
      "div",{class:"creative-block-label",contenteditable:"false"}, number ? `${title} ${number}` : title
    ],["div",{class:"creative-block-content"},0]];
  }
});
