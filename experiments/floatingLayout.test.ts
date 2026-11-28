import {expect,it} from "vitest";
import {availableLine,paintOrder,type Float} from "./floatingLayout";

const item:Float={id:"diagram",box:{x:30,y:20,width:70,height:40},mode:"square",layer:2,anchor:{kind:"paragraph",id:"p1"}};

it("subtracts the same obstacle from each affected line with either text direction",()=>{
  expect(availableLine(140,25,10,[item])).toEqual([{left:0,right:30},{left:100,right:140}]);
  expect(availableLine(140,60,10,[item])).toEqual([{left:0,right:140}]);
  expect(availableLine(140,25,10,[{...item,mode:"top-bottom"}])).toEqual([]);
  expect(availableLine(140,25,10,[{...item,mode:"in-front"}])).toEqual([{left:0,right:140}]);
});

it("orders overlapping elements without mutating the document input",()=>{
  const input=[item,{...item,id:"a",layer:1},{...item,id:"b",layer:2}];
  expect(paintOrder(input).map(x=>x.id)).toEqual(["a","b","diagram"]);
  expect(input[0]).toBe(item);
});
