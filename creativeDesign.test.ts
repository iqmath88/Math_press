import { describe, expect, it } from "vitest";
import { createDocument, parseDocument, protectEducationalDocument } from "./document";
import { creativeTemplates, educationBlock, makeTemplate, solvedExample } from "./creativeDesign";
import { validateImportedContent } from "./importValidation";

describe("Creative Studio documents", () => {
  it.each(creativeTemplates)("accepts the editable $id template as protected MathDoc", ({id}) => {
    const document = makeTemplate(createDocument(),id);
    expect(parseDocument(document)).toEqual(document);
    expect(validateImportedContent(document.content,true)).not.toBeNull();
  });

  it("protects a new block or design without upgrading ordinary documents", () => {
    const base = createDocument();
    expect(protectEducationalDocument(base).schemaVersion).toBe(3);
    expect(protectEducationalDocument({...base,creativeDesign:"academic"}).schemaVersion).toBe(4);
    const content = {type:"doc",content:[educationBlock("definition")]};
    expect(protectEducationalDocument({...base,content}).schemaVersion).toBe(4);
  });

  it("protects editable publishing attributes while preserving partial examples", () => {
    const content = {type:"doc",content:[solvedExample(3)]};
    const document = protectEducationalDocument({...createDocument(),content});
    expect(document.schemaVersion).toBe(5);
    expect(parseDocument(document)?.content).toEqual(content);
    expect(validateImportedContent(content,true)?.content?.[0].attrs?.exampleNumber).toBe("3");
  });
});
