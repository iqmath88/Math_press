// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { convertLatexToMarkup } from "mathlive";
import { importDocx } from "./docxImport";
import { ommlToLatex } from "./omml";

const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml"`;

const mr = (t: string, sty = "") => `<m:r>${sty ? `<m:rPr><m:sty m:val="${sty}"/></m:rPr>` : ""}<m:t>${t}</m:t></m:r>`;
const omml = (inner: string) => new DOMParser().parseFromString(`<m:oMath ${NS}>${inner}</m:oMath>`, "application/xml").documentElement;
const tex = (inner: string) => ommlToLatex(omml(inner));
const valid = (latex: string) => !convertLatexToMarkup(latex).includes("ML__error");

describe("OMML → LaTeX", () => {
  const cases: [string, string, RegExp][] = [
    ["fraction", `<m:f><m:num>${mr("a")}</m:num><m:den>${mr("b")}</m:den></m:f>`, /^\\frac\{a\}\{b\}$/],
    ["quadratic formula",
      `${mr("x=")}<m:f><m:num>${mr("−b±")}<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e><m:sSup><m:e>${mr("b")}</m:e><m:sup>${mr("2")}</m:sup></m:sSup>${mr("−4ac")}</m:e></m:rad></m:num><m:den>${mr("2a")}</m:den></m:f>`,
      /^x=\\frac\{-b\\pm ?\\sqrt\{\{b\}\^2-4ac\}\}\{2a\}$/],
    ["nth root", `<m:rad><m:deg>${mr("3")}</m:deg><m:e>${mr("x")}</m:e></m:rad>`, /^\\sqrt\[3\]\{x\}$/],
    ["sub and sup", `<m:sSubSup><m:e>${mr("x")}</m:e><m:sub>${mr("i")}</m:sub><m:sup>${mr("2")}</m:sup></m:sSubSup>`, /^\{x\}_i\^2$/],
    ["sum with limits",
      `<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${mr("i=1")}</m:sub><m:sup>${mr("n")}</m:sup><m:e>${mr("i")}</m:e></m:nary>`, /^\\sum_\{i=1\}\^n ?i$/],
    ["definite integral",
      `<m:nary><m:naryPr><m:chr m:val="∫"/></m:naryPr><m:sub>${mr("0")}</m:sub><m:sup>${mr("1")}</m:sup><m:e>${mr("x")}${mr("dx")}</m:e></m:nary>`, /^\\int_0\^1 ?xdx$/],
    ["integral without chr defaults to ∫",
      `<m:nary><m:naryPr><m:subHide m:val="1"/><m:supHide m:val="1"/></m:naryPr><m:sub/><m:sup/><m:e>${mr("f")}</m:e></m:nary>`, /^\\int ?f$/],
    ["function sin^2", `<m:func><m:fName><m:sSup><m:e>${mr("sin", "p")}</m:e><m:sup>${mr("2")}</m:sup></m:sSup></m:fName><m:e>${mr("x")}</m:e></m:func>`, /sin.*\^2.*x/],
    ["limit", `<m:func><m:fName><m:limLow><m:e>${mr("lim", "p")}</m:e><m:lim>${mr("x→0")}</m:lim></m:limLow></m:fName><m:e>${mr("x")}</m:e></m:func>`, /^\\lim_\{x\\to 0\} ?x$/],
    ["abs value", `<m:d><m:dPr><m:begChr m:val="|"/><m:endChr m:val="|"/></m:dPr><m:e>${mr("x")}</m:e></m:d>`, /^\\left\| x \\right\|$/],
    ["brackets", `<m:d><m:e>${mr("a+b")}</m:e></m:d>`, /^\\left\( a\+b \\right\)$/],
    ["matrix with parens",
      `<m:d><m:e><m:m><m:mr><m:e>${mr("a")}</m:e><m:e>${mr("b")}</m:e></m:mr><m:mr><m:e>${mr("c")}</m:e><m:e>${mr("d")}</m:e></m:mr></m:m></m:e></m:d>`,
      /^\\begin\{pmatrix\}a&b \\\\ c&d ?\\end\{pmatrix\}$/],
    ["piecewise cases",
      `<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e><m:eqArr><m:e>${mr("x,&amp;x≥0")}</m:e><m:e>${mr("−x,&amp;x&lt;0")}</m:e></m:eqArr></m:e></m:d>`,
      /^\\begin\{cases\}x,&x\\ge 0 \\\\ -x,&x<0 ?\\end\{cases\}$/],
    ["aligned equations", `<m:eqArr><m:e>${mr("x&amp;=1")}</m:e><m:e>${mr("y&amp;=2")}</m:e></m:eqArr>`, /^\\begin\{aligned\}x&=1 \\\\ y&=2 ?\\end\{aligned\}$/],
    ["binomial", `<m:d><m:e><m:f><m:fPr><m:type m:val="noBar"/></m:fPr><m:num>${mr("n")}</m:num><m:den>${mr("k")}</m:den></m:f></m:e></m:d>`, /^\\binom\{n\}\{k\}$/],
    ["vector accent", `<m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr><m:e>${mr("v")}</m:e></m:acc>`, /^\\vec\{v\}$/],
    ["overline", `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${mr("AB")}</m:e></m:bar>`, /^\\overline\{AB\}$/],
    ["greek, degrees, inequality", `${mr("θ=30°")}${mr("≤π")}`, /^\\theta =30\^\\circ \\le \\pi$/],
    ["plain text run", `<m:r><m:rPr><m:nor/></m:rPr><m:t>إذن</m:t></m:r>`, /^\\text\{إذن\}$/],
    ["Arabic variables", `${mr("س+ص=٥")}`, /^س\+ص=٥$/]
  ];
  for (const [name, inner, re] of cases) {
    it(`converts ${name}`, () => {
      const out = tex(inner);
      expect(out).toMatch(re);
      expect(valid(out), `MathLive rejected: ${out}`).toBe(true);
    });
  }

  it("never drops content of unknown elements", () => {
    expect(tex(`<m:foo><m:r><m:t>q</m:t></m:r></m:foo>`)).toBe("q");
  });
});

async function makeDocx(body: string, extra: Record<string, string> = {}, sect = ""): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`);
  zip.file("word/styles.xml", `<?xml version="1.0"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="24"/><w:szCs w:val="28"/></w:rPr></w:rPrDefault></w:docDefaults>
    <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
    <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>`);
  zip.file("word/numbering.xml", `<?xml version="1.0"?><w:numbering ${NS}>
    <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
    <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
    <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`);
  for (const [path, content] of Object.entries(extra)) zip.file(path, content);
  return zip.generateAsync({ type: "arraybuffer" });
}

const p = (inner: string, ppr = "") => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${inner}</w:p>`;
const r = (t: string, rpr = "") => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${t}</w:t></w:r>`;
const flat = (n: any): any[] => [n, ...(n.content ?? []).flatMap(flat)];

describe("DOCX import", () => {
  it("imports headings, formatted Arabic text and direction", async () => {
    const res = await importDocx(await makeDocx(
      p(r("المعادلات التربيعية"), `<w:pStyle w:val="Heading1"/><w:bidi/>`) +
      p(r("نص ") + r("غامق", `<w:bCs/><w:rtl/>`) + r(" وملوّن", `<w:color w:val="C00000"/><w:highlight w:val="yellow"/>`), `<w:bidi/><w:jc w:val="both"/>`) +
      p(r("English line"), ``) +
      p(r("يمين", ""), `<w:bidi/><w:jc w:val="right"/>`)
    ));
    const doc = res.content.content!;
    expect(doc[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(doc[1].attrs?.textAlign).toBe("justify");
    const marks = (doc[1].content ?? []).flatMap(n => (n.marks ?? []).map(m => m.type));
    expect(marks).toEqual(expect.arrayContaining(["bold", "textStyle", "highlight"]));
    expect(doc[2].attrs?.dir).toBe("ltr");
    expect(doc[3].attrs?.textAlign).toBe("left"); // jc=right في فقرة bidi يعني اليسار بصريًا
    expect(res.stats.headings).toBe(1);
  });

  it("converts inline equations, and a lone equation paragraph becomes a block equation", async () => {
    const eq = `<m:oMath><m:f><m:num>${mr("1")}</m:num><m:den>${mr("2")}</m:den></m:f></m:oMath>`;
    const res = await importDocx(await makeDocx(p(r("قيمة ") + eq + r(" ثابتة")) + p(eq)));
    const nodes = res.content.content!.flatMap(flat);
    expect(nodes.filter(n => n.type === "mathInline").length).toBe(1);
    expect(nodes.filter(n => n.type === "mathBlock").length).toBe(1);
    expect(nodes.find(n => n.type === "mathBlock")!.attrs!.latex).toBe("\\frac{1}{2}");
    expect(res.stats.equations).toBe(2);
  });

  it("imports oMathPara as block equations", async () => {
    const res = await importDocx(await makeDocx(p(`<m:oMathPara><m:oMath>${mr("a=b")}</m:oMath><m:oMath>${mr("c=d")}</m:oMath></m:oMathPara>`)));
    expect(res.content.content!.filter(n => n.type === "mathBlock").map(n => n.attrs!.latex)).toEqual(["a=b", "c=d"]);
  });

  it("builds nested bullet and numbered lists", async () => {
    const li = (t: string, id: number, lvl: number) => p(r(t), `<w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="${id}"/></w:numPr>`);
    const res = await importDocx(await makeDocx(li("أ", 1, 0) + li("ب", 1, 1) + li("ج", 1, 0) + p(r("فاصل")) + li("واحد", 2, 0) + li("اثنان", 2, 0)));
    const d = res.content.content!;
    expect(d[0].type).toBe("bulletList");
    expect(d[0].content!.length).toBe(2);
    expect(d[0].content![0].content![1].type).toBe("orderedList");
    expect(d[1].type).toBe("paragraph");
    expect(d[2].type).toBe("orderedList");
    expect(d[2].content!.length).toBe(2);
  });

  it("detects lists whose numbering comes from the paragraph style (e.g. List Bullet)", async () => {
    const buf = await makeDocx(p(r("أ"), `<w:pStyle w:val="ListBullet"/>`) + p(r("ب"), `<w:pStyle w:val="ListBullet2"/>`));
    const z = await JSZip.loadAsync(buf);
    z.file("word/styles.xml", `<?xml version="1.0"?><w:styles ${NS}>
      <w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>
      <w:style w:type="paragraph" w:styleId="ListBullet2"><w:name w:val="List Bullet 2"/><w:basedOn w:val="ListBullet"/></w:style></w:styles>`);
    const res = await importDocx(await z.generateAsync({ type: "arraybuffer" }));
    expect(res.content.content![0].type).toBe("bulletList");
    expect(res.content.content![0].content!.length).toBe(2);
  });

  it("starts a new list when the numbering system changes between adjacent lists", async () => {
    const li = (t: string, id: number) => p(r(t), `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${id}"/></w:numPr>`);
    const res = await importDocx(await makeDocx(li("نقطة", 1) + li("رقم", 2)));
    expect(res.content.content!.map(n => n.type)).toEqual(["bulletList", "orderedList"]);
  });

  it("imports tables with merged cells", async () => {
    const tc = (t: string, pr = "") => `<w:tc><w:tcPr>${pr}</w:tcPr>${p(r(t))}</w:tc>`;
    const tbl = `<w:tbl><w:tr>${tc("عنوان", `<w:gridSpan w:val="2"/>`)}</w:tr><w:tr>${tc("أ", `<w:vMerge w:val="restart"/>`)}${tc("ب")}</w:tr><w:tr>${tc("", `<w:vMerge/>`)}${tc("د")}</w:tr></w:tbl>`;
    const res = await importDocx(await makeDocx(tbl));
    const t = res.content.content![0];
    expect(t.type).toBe("table");
    expect(t.content![0].content![0].attrs).toMatchObject({ colspan: 2, rowspan: 1 });
    expect(t.content![1].content![0].attrs).toMatchObject({ rowspan: 2 });
    expect(t.content![2].content!.length).toBe(1);
  });

  it("imports page breaks, images, and reports MathType objects", async () => {
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const draw = `<w:r><w:drawing><wp:inline><wp:extent cx="3132000" cy="1000000"/><a:graphic><a:graphicData><a:blip r:embed="rId5"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    const mt = `<w:r><w:object><v:shape><v:imagedata r:id="rId6"/></v:shape><o:OLEObject ProgID="Equation.DSMT4"/></w:object></w:r>`;
    const res = await importDocx(await makeDocx(
      p(r("قبل") + `<w:r><w:br w:type="page"/></w:r>` + r("بعد")) + p(draw) + p(r("معادلة ") + mt),
      {
        "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId5" Type="image" Target="media/a.png"/><Relationship Id="rId6" Type="image" Target="media/b.wmf"/></Relationships>`,
        "word/header1.xml": `<w:hdr ${NS}/>`
      }
    ).then(async buf => {
      const z = await JSZip.loadAsync(buf);
      z.file("word/media/a.png", png, { base64: true });
      z.file("word/media/b.wmf", "x");
      return z.generateAsync({ type: "arraybuffer" });
    }));
    const types = res.content.content!.map(n => n.type);
    expect(types).toEqual(expect.arrayContaining(["pageBreak", "image"]));
    const img = res.content.content!.find(n => n.type === "image")!;
    expect(img.attrs!.src).toMatch(/^data:image\/png;base64,/);
    expect(img.attrs!.width).toBe("50%");
    expect(res.stats.mathType).toBe(1);
    expect(res.warnings.join(" ")).toMatch(/MathType/);
    expect(res.warnings.join(" ")).toMatch(/رؤوس/);
    expect(JSON.stringify(res.content)).toContain("[معادلة MathType]");
  });

  it("reads landscape orientation and margins", async () => {
    const sect = `<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1134" w:bottom="1134" w:left="850" w:right="850"/></w:sectPr>`;
    const res = await importDocx(await makeDocx(p(r("x")), {}, sect));
    expect(res.page).toEqual({ orientation: "landscape", marginsMm: { top: 20, bottom: 20, left: 15, right: 15 } });
  });

  it("scales font sizes relative to the document body size", async () => {
    const res = await importDocx(await makeDocx(p(r("عادي") + r("كبير", `<w:szCs w:val="36"/>`))));
    const sizes = (res.content.content![0].content ?? []).map(n => n.marks?.find(m => m.type === "textStyle")?.attrs?.fontSize);
    expect(sizes[0]).toBeUndefined();
    expect(sizes[1]).toBe("18"); // النص العربي يستعمل szCs: 18pt مقابل أساس 14pt (szCs الافتراضي) → 18
  });

  it("rejects non-docx files with a readable message", async () => {
    await expect(importDocx(new TextEncoder().encode("hello").buffer as ArrayBuffer)).rejects.toThrow(/docx/);
    const zip = new JSZip(); zip.file("a.txt", "x");
    await expect(importDocx(await zip.generateAsync({ type: "arraybuffer" }))).rejects.toThrow(/document\.xml/);
  });

  it("produces content the editor schema accepts", async () => {
    const { Editor } = await import("@tiptap/core");
    const { buildExtensions } = await import("./extensions");
    const tc = (t: string) => `<w:tc>${p(r(t))}</w:tc>`;
    const li = p(r("بند"), `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>`);
    const res = await importDocx(await makeDocx(
      p(r("عنوان"), `<w:pStyle w:val="Heading2"/>`) + li + `<w:tbl><w:tr>${tc("1")}${tc("2")}</w:tr></w:tbl>` +
      p(`<m:oMath>${mr("x^2")}</m:oMath>`) + p(r("نهاية"))
    ));
    const host = document.createElement("div"); document.body.appendChild(host);
    const ed = new Editor({ element: host, extensions: buildExtensions(), content: res.content });
    expect(ed.state.doc.check()).toBeUndefined();
    const json = JSON.stringify(ed.getJSON());
    for (const t of ["heading", "bulletList", "table", "mathBlock"]) expect(json).toContain(`"${t}"`);
    ed.destroy();
  });
});
