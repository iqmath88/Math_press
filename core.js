'use strict';
const MP = (()=>{
 const uid=()=>globalThis.crypto.randomUUID();
 const copy=x=>JSON.parse(JSON.stringify(x));
 function valid(d){return !!(d&&d.format==='mathpress'&&d.schemaVersion===1&&typeof d.id==='string'&&d.id.length>0&&typeof d.title==='string'&&d.page?.size==='A4'&&['portrait','landscape'].includes(d.page.orientation)&&['top','right','bottom','left'].every(k=>Number.isFinite(d.page.marginsMm?.[k])&&d.page.marginsMm[k]>=0&&d.page.marginsMm[k]<=60)&&Array.isArray(d.content)&&d.content.every(b=>b&&typeof b.id==='string'&&b.id.length>0&&((b.type==='paragraph'&&typeof b.text==='string')||(b.type==='math'&&typeof b.latex==='string')))&&new Set(d.content.map(b=>b.id)).size===d.content.length);}
 function imported(d){if(!valid(d))throw Error('صيغة المستند غير صالحة أو تحتوي معرفات مكررة');const x=copy(d);x.id=uid();x.content.forEach(b=>b.id=uid());x.updatedAt=new Date().toISOString();return x;}
 return {uid,copy,valid,imported};
})();
if(typeof module!=='undefined')module.exports=MP;
