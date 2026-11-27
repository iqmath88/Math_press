import { describe, expect, it } from "vitest";
import { createDocument, parseDocument, protectEducationalDocument } from "./document";
import { creativeTemplates, educationBlock, makeTemplate } from "./creativeDesign";
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
});
