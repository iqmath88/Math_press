/** Standalone geometry experiment. Coordinates use CSS pixels relative to page content. */
export type Box={x:number;y:number;width:number;height:number};
export type FloatMode="inline"|"square"|"tight"|"top-bottom"|"behind"|"in-front";
export type Float={id:string; box:Box; mode:FloatMode; layer:number; anchor:{kind:"paragraph"|"page";id:string}};
export type Span={left:number;right:number};

export function availableLine(width:number,y:number,height:number,items:readonly Float[]):Span[]{
  let spans:Span[]=[{left:0,right:width}];
  for(const item of items){
    const {box,mode}=item;
    if(mode==="inline" || mode==="behind" || mode==="in-front" || y>=box.y+box.height || y+height<=box.y) continue;
    if(mode==="top-bottom") return [];
    const left=Math.max(0,box.x);
    const right=Math.min(width,box.x+box.width);
    if(left>=right) continue;
    spans=spans.flatMap(span=>{
      if(right<=span.left || left>=span.right) return [span];
      const result:Span[]=[];
      if(left>span.left) result.push({left:span.left,right:left});
      if(right<span.right) result.push({left:right,right:span.right});
      return result;
    });
  }
  return spans;
}

export function paintOrder(items:readonly Float[]) {
  return [...items].sort((a,b)=>a.layer-b.layer || (a.id<b.id?-1:a.id>b.id?1:0));
}
