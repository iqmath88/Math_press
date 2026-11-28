import {describe,expect,it} from "vitest";
import {createDocument,parseDocument,protectEducationalDocument} from "./document";
import {defaultWatermark,watermarkOnPage} from "./watermark";
import {defaultFurniture,pageNumber} from "./pageFurniture";

describe("page studio MathDoc compatibility",()=>{
  it("protects page furniture and restores the exact watermark settings",()=>{
    const watermark={...defaultWatermark,value:"مراجعة",pages:"odd" as const,repeat:true};
    const pageFurniture={...defaultFurniture,headerEnd:"الرياضيات",numberStart:7,arabicDigits:true,rule:true};
    const doc=protectEducationalDocument({...createDocument(),watermark,pageFurniture});
    expect(doc.schemaVersion).toBe(6);
    expect(parseDocument(doc)).toEqual(doc);
    expect(watermarkOnPage(watermark,1)).toBe(true);
    expect(watermarkOnPage(watermark,2)).toBe(false);
    expect(pageNumber(2,3,pageFurniture)).toBe("صفحة ٨ من ٩");
  });
  it("rejects unsupported watermark data and preserves ordinary legacy documents",()=>{
    const original=createDocument();
    expect(parseDocument(original)).toEqual(original);
    expect(parseDocument({...original,watermark:{...defaultWatermark,value:"مراجعة"}})).toBeNull();
    expect(parseDocument({...original,schemaVersion:6,watermark:{...defaultWatermark,kind:"image",value:"https://other.invalid/logo.png"}})).toBeNull();
    expect(parseDocument({...original,schemaVersion:7})).toBeNull();
  });
});
