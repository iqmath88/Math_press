/**
 * محوّل معادلات Word (Office Math / OMML) إلى LaTeX.
 * يغطي: الكسور، الجذور، الأس والفهرس، المجاميع والتكاملات (nary)، الأقواس، المصفوفات، الدوال،
 * النهايات، المحاذاة متعددة الأسطر، الحالات (cases)، الأقواس العلوية والسفلية، الإعلاءات (accents).
 * أي عنصر غير معروف تُحوَّل أبناؤه دون إسقاط محتواه.
 */
const M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

type Ctx = { amp: boolean; perRun?: boolean };

/** لون النص (hex بحروف كبيرة) من w:rPr/w:color داخل m:r، أو null للون التلقائي. */
function runColor(r: Element): string | null {
  for (const c of Array.from(r.children)) {
    if (c.namespaceURI === W_NS && c.localName === "rPr") {
      for (const d of Array.from(c.children)) {
        if (d.namespaceURI === W_NS && d.localName === "color") {
          const v = d.getAttributeNS(W_NS, "val") ?? "";
          if (/^[0-9a-fA-F]{6}$/.test(v) && v.toLowerCase() !== "000000") return v.toUpperCase();
        }
      }
    }
  }
  return null;
}

const kids = (el: Element): Element[] => Array.from(el.children);
const isM = (el: Element, name: string) => el.namespaceURI === M_NS && el.localName === name;
const child = (el: Element | null | undefined, name: string) => (el ? kids(el).find(c => isM(c, name)) : undefined);
const val = (el: Element | null | undefined) => el?.getAttributeNS(M_NS, "val") ?? null;
const on = (el: Element | null | undefined) => {
  if (!el) return false;
  const v = val(el);
  return v === null || v === "1" || v === "on" || v === "true";
};

const GREEK_LOWER: Record<string, string> = {
  α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "epsilon", ϵ: "varepsilon", ζ: "zeta", η: "eta", θ: "theta",
  ϑ: "vartheta", ι: "iota", κ: "kappa", λ: "lambda", μ: "mu", ν: "nu", ξ: "xi", π: "pi", ϖ: "varpi", ρ: "rho",
  ϱ: "varrho", σ: "sigma", ς: "varsigma", τ: "tau", υ: "upsilon", φ: "varphi", ϕ: "phi", χ: "chi", ψ: "psi", ω: "omega"
};
const GREEK_UPPER: Record<string, string> = {
  Γ: "Gamma", Δ: "Delta", Θ: "Theta", Λ: "Lambda", Ξ: "Xi", Π: "Pi", Σ: "Sigma", Υ: "Upsilon", Φ: "Phi", Ψ: "Psi", Ω: "Omega"
};

const SYMBOLS: Record<string, string> = {
  "×": "\\times ", "÷": "\\div ", "±": "\\pm ", "∓": "\\mp ", "·": "\\cdot ", "⋅": "\\cdot ", "∙": "\\cdot ",
  "−": "-", "–": "-", "—": "-", "≤": "\\le ", "⩽": "\\le ", "≥": "\\ge ", "⩾": "\\ge ", "≠": "\\ne ",
  "≈": "\\approx ", "≡": "\\equiv ", "∝": "\\propto ", "∞": "\\infty ", "∂": "\\partial ", "∇": "\\nabla ",
  "∈": "\\in ", "∉": "\\notin ", "∋": "\\ni ", "⊂": "\\subset ", "⊃": "\\supset ", "⊆": "\\subseteq ", "⊇": "\\supseteq ",
  "∪": "\\cup ", "∩": "\\cap ", "∅": "\\emptyset ", "→": "\\to ", "←": "\\leftarrow ", "↔": "\\leftrightarrow ",
  "⇒": "\\Rightarrow ", "⇐": "\\Leftarrow ", "⇔": "\\Leftrightarrow ", "↦": "\\mapsto ", "∀": "\\forall ",
  "∃": "\\exists ", "¬": "\\neg ", "∧": "\\wedge ", "∨": "\\vee ", "∴": "\\therefore ", "∵": "\\because ",
  "∠": "\\angle ", "⊥": "\\perp ", "∥": "\\parallel ", "△": "\\triangle ", "°": "^\\circ ", "′": "'", "″": "''",
  "…": "\\ldots ", "⋯": "\\cdots ", "⋮": "\\vdots ", "⋱": "\\ddots ", "∘": "\\circ ", "∗": "*", "∼": "\\sim ",
  "≅": "\\cong ", "≪": "\\ll ", "≫": "\\gg ", "⊕": "\\oplus ", "⊗": "\\otimes ", "∖": "\\setminus ",
  "ℝ": "\\mathbb{R}", "ℕ": "\\mathbb{N}", "ℤ": "\\mathbb{Z}", "ℚ": "\\mathbb{Q}", "ℂ": "\\mathbb{C}",
  "ℓ": "\\ell ", "ℏ": "\\hbar ", "∫": "\\int ", "∑": "\\sum ", "∏": "\\prod ", "√": "\\surd ",
  "{": "\\{", "}": "\\}", "%": "\\%", "#": "\\#", "_": "\\_", "$": "\\$", "\\": "\\backslash ", "^": "\\^{}", "~": "\\sim ",
  "\u00a0": " ", "\u2061": "", "\u2062": "", "\u2063": "", "\u200b": ""
};

const NARY: Record<string, string> = {
  "∑": "\\sum", "∏": "\\prod", "∐": "\\coprod", "∫": "\\int", "∬": "\\iint", "∭": "\\iiint", "∮": "\\oint",
  "⋃": "\\bigcup", "⋂": "\\bigcap", "⋁": "\\bigvee", "⋀": "\\bigwedge", "⨁": "\\bigoplus", "⨂": "\\bigotimes"
};

const FUNCS = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "coth",
  "log", "ln", "lg", "exp", "lim", "max", "min", "sup", "inf", "det", "gcd", "deg", "dim", "ker", "arg", "limsup", "liminf"
]);
const LIMIT_OPS = new Set(["lim", "max", "min", "sup", "inf", "limsup", "liminf"]);

const ACCENTS: Record<string, string> = {
  "\u0302": "hat", "^": "hat", "\u0303": "tilde", "~": "tilde", "\u0304": "bar", "¯": "bar", "\u0305": "overline",
  "\u20d7": "vec", "→": "vec", "\u0307": "dot", "˙": "dot", "\u0308": "ddot", "¨": "ddot", "\u0301": "acute",
  "´": "acute", "\u0300": "grave", "`": "grave", "\u0306": "breve", "˘": "breve", "\u030c": "check", "ˇ": "check"
};

const DELIMS: Record<string, string> = {
  "": ".", "{": "\\{", "}": "\\}", "‖": "\\Vert", "⟨": "\\langle", "⟩": "\\rangle", "〈": "\\langle", "〉": "\\rangle",
  "⌈": "\\lceil", "⌉": "\\rceil", "⌊": "\\lfloor", "⌋": "\\rfloor", "⟦": "[", "⟧": "]"
};
const delim = (c: string) => (c in DELIMS ? DELIMS[c] : c);

function mapChars(text: string, ctx: Ctx): string {
  let out = "";
  for (const ch of Array.from(text)) {
    if (ch === "&" && ctx.amp) out += "&";
    else if (ch === "&") out += "\\&";
    else if (ch === " ") out += "";
    else if (ch in GREEK_LOWER) out += `\\${GREEK_LOWER[ch]} `;
    else if (ch in GREEK_UPPER) out += `\\${GREEK_UPPER[ch]} `;
    else if (ch in SYMBOLS) out += SYMBOLS[ch];
    else out += ch;
  }
  return out;
}

function escapeText(text: string): string {
  return text.replace(/\\/g, "\\textbackslash ").replace(/([{}%#&_$])/g, "\\$1").replace(/\^/g, "\\^{}").replace(/~/g, "\\~{}");
}

/** النص الخام داخل عنصر (بلا تحويل). */
function plainText(el: Element): string {
  let s = "";
  const walk = (e: Element) => {
    for (const c of kids(e)) {
      if (isM(c, "t")) s += c.textContent ?? "";
      else walk(c);
    }
  };
  walk(el);
  return s;
}

/** يضع الوسيط بين أقواس إلا إن كان رمزًا واحدًا. */
const arg = (s: string): string => {
  const t = s.trim();
  return /^[A-Za-z0-9]$/.test(t) ? t : `{${t}}`;
};

function run(r: Element, ctx: Ctx): string {
  const out = runPlain(r, ctx);
  if (!ctx.perRun || !out.trim()) return out;
  const col = runColor(r);
  return col ? `\\textcolor{#${col}}{${out}}` : out;
}

function runPlain(r: Element, ctx: Ctx): string {
  const pr = child(r, "rPr");
  const raw = kids(r).filter(c => isM(c, "t")).map(c => c.textContent ?? "").join("");
  if (!raw) return "";
  if (on(child(pr, "nor"))) return `\\text{${escapeText(raw)}}`;
  const trimmed = raw.trim();
  if (FUNCS.has(trimmed)) return `\\${trimmed} `;
  const mapped = mapChars(raw, ctx);
  const sty = val(child(pr, "sty"));
  if (sty === "p" && /^[A-Za-z0-9]+$/.test(mapped)) return `\\mathrm{${mapped}}`;
  if (sty === "b" && /^[A-Za-z0-9]+$/.test(mapped)) return `\\mathbf{${mapped}}`;
  if (sty === "bi" && /^[A-Za-z0-9]+$/.test(mapped)) return `\\boldsymbol{${mapped}}`;
  return mapped;
}

function seq(el: Element | null | undefined, ctx: Ctx): string {
  if (!el) return "";
  return kids(el).map(c => node(c, ctx)).join("");
}

function matrix(m: Element, env: string, ctx: Ctx): string {
  const rows = kids(m).filter(c => isM(c, "mr")).map(mr =>
    kids(mr).filter(c => isM(c, "e")).map(e => seq(e, ctx).trim()).join(" & ")
  );
  return `\\begin{${env}} ${rows.join(" \\\\ ")} \\end{${env}}`;
}

function eqRows(arr: Element, ctx: Ctx): string[] {
  const inner: Ctx = { ...ctx, amp: true };
  return kids(arr).filter(c => isM(c, "e")).map(e => seq(e, inner).trim());
}

function onlyChild(e: Element | undefined, name: string): Element | undefined {
  if (!e) return undefined;
  const list = kids(e).filter(c => !isM(c, "ctrlPr"));
  return list.length === 1 && isM(list[0], name) ? list[0] : undefined;
}

function delimiters(d: Element, ctx: Ctx): string {
  const pr = child(d, "dPr");
  const chr = (name: string, dflt: string) => {
    const el = child(pr, name);
    return el ? val(el) ?? "" : dflt;
  };
  const beg = chr("begChr", "(");
  const end = chr("endChr", ")");
  const sep = chr("sepChr", "|");
  const es = kids(d).filter(c => isM(c, "e"));

  if (es.length === 1) {
    const mat = onlyChild(es[0], "m");
    if (mat) {
      const key = `${beg}${end}`;
      const env = key === "()" ? "pmatrix" : key === "[]" ? "bmatrix" : key === "{}" ? "Bmatrix"
        : key === "||" ? "vmatrix" : key === "‖‖" ? "Vmatrix" : key === "" ? "matrix" : "";
      if (env) return matrix(mat, env, ctx);
    }
    const arr = onlyChild(es[0], "eqArr");
    if (arr && beg === "{" && end === "") {
      return `\\begin{cases} ${eqRows(arr, ctx).join(" \\\\ ")} \\end{cases}`;
    }
    const frac = onlyChild(es[0], "f");
    if (frac && val(child(child(frac, "fPr"), "type")) === "noBar" && beg === "(" && end === ")") {
      return `\\binom{${seq(child(frac, "num"), ctx).trim()}}{${seq(child(frac, "den"), ctx).trim()}}`;
    }
  }
  const body = es.map(e => seq(e, ctx).trim()).join(` ${sep === "|" ? "\\middle|" : delim(sep) === "." ? "" : `\\middle${delim(sep)}`} `);
  return `\\left${delim(beg)} ${body} \\right${delim(end)} `;
}

function node(el: Element, ctx: Ctx): string {
  if (el.namespaceURI !== M_NS) return "";
  switch (el.localName) {
    case "r": return run(el, ctx);
    case "f": {
      const type = val(child(child(el, "fPr"), "type"));
      const num = seq(child(el, "num"), ctx).trim();
      const den = seq(child(el, "den"), ctx).trim();
      if (type === "noBar") return `\\genfrac{}{}{0pt}{}{${num}}{${den}}`;
      if (type === "lin" || type === "skw") return `${arg(num)}/${arg(den)}`;
      return `\\frac{${num}}{${den}}`;
    }
    case "rad": {
      const pr = child(el, "radPr");
      const deg = seq(child(el, "deg"), ctx).trim();
      const e = seq(child(el, "e"), ctx).trim();
      return deg && !on(child(pr, "degHide")) ? `\\sqrt[${deg}]{${e}}` : `\\sqrt{${e}}`;
    }
    case "sSup": return `{${seq(child(el, "e"), ctx).trim()}}^${arg(seq(child(el, "sup"), ctx))}`;
    case "sSub": return `{${seq(child(el, "e"), ctx).trim()}}_${arg(seq(child(el, "sub"), ctx))}`;
    case "sSubSup":
      return `{${seq(child(el, "e"), ctx).trim()}}_${arg(seq(child(el, "sub"), ctx))}^${arg(seq(child(el, "sup"), ctx))}`;
    case "sPre":
      return `{}_${arg(seq(child(el, "sub"), ctx))}^${arg(seq(child(el, "sup"), ctx))}${arg(seq(child(el, "e"), ctx))}`;
    case "nary": {
      const pr = child(el, "naryPr");
      const chrEl = child(pr, "chr");
      const chr = chrEl ? val(chrEl) ?? "" : "∫";
      const op = chr === "" ? "" : NARY[chr] ?? mapChars(chr, ctx).trim();
      const sub = on(child(pr, "subHide")) ? "" : seq(child(el, "sub"), ctx).trim();
      const sup = on(child(pr, "supHide")) ? "" : seq(child(el, "sup"), ctx).trim();
      return `${op}${sub ? `_${arg(sub)}` : ""}${sup ? `^${arg(sup)}` : ""} ${seq(child(el, "e"), ctx).trim()} `;
    }
    case "d": return delimiters(el, ctx);
    case "func": {
      const name = seq(child(el, "fName"), ctx).trim();
      const plain = plainText(child(el, "fName") ?? el).trim();
      const head = /^[A-Za-z]+$/.test(plain) && !FUNCS.has(plain) && name === `\\mathrm{${plain}}` ? `\\operatorname{${plain}}` : name;
      return `${head} ${seq(child(el, "e"), ctx).trim()} `;
    }
    case "limLow": {
      const base = child(el, "e");
      const lim = seq(child(el, "lim"), ctx).trim();
      const name = base ? plainText(base).trim() : "";
      if (LIMIT_OPS.has(name)) return `\\${name}_{${lim}} `;
      return `\\underset{${lim}}{${seq(base, ctx).trim()}}`;
    }
    case "limUpp": return `\\overset{${seq(child(el, "lim"), ctx).trim()}}{${seq(child(el, "e"), ctx).trim()}}`;
    case "acc": {
      const chrEl = child(child(el, "accPr"), "chr");
      const chr = chrEl ? val(chrEl) ?? "" : "\u0302";
      const cmd = ACCENTS[chr] ?? "hat";
      return `\\${cmd}{${seq(child(el, "e"), ctx).trim()}}`;
    }
    case "bar": {
      const pos = val(child(child(el, "barPr"), "pos"));
      return `${pos === "bot" ? "\\underline" : "\\overline"}{${seq(child(el, "e"), ctx).trim()}}`;
    }
    case "groupChr": {
      const pr = child(el, "groupChrPr");
      const chr = val(child(pr, "chr")) ?? "⏟";
      const e = seq(child(el, "e"), ctx).trim();
      return chr === "⏞" ? `\\overbrace{${e}}` : `\\underbrace{${e}}`;
    }
    case "borderBox": return `\\boxed{${seq(child(el, "e"), ctx).trim()}}`;
    case "m": return matrix(el, "matrix", ctx);
    case "eqArr": return `\\begin{aligned} ${eqRows(el, ctx).join(" \\\\ ")} \\end{aligned}`;
    case "rPr": case "ctrlPr": case "fPr": case "radPr": case "naryPr": case "dPr": case "accPr": case "barPr":
    case "groupChrPr": case "limLowPr": case "limUppPr": case "sSupPr": case "sSubPr": case "sSubSupPr": case "sPrePr":
    case "funcPr": case "eqArrPr": case "mPr": case "boxPr": case "borderBoxPr": case "phantPr":
      return "";
    default:
      // oMath المتداخلة، box، phant، e، وغيرها: نحوّل المحتوى فقط.
      return seq(el, ctx);
  }
}

/** يحوّل عنصر m:oMath إلى نص LaTeX. */
export function ommlToLatex(oMath: Element): string {
  // ألوان الأسطر: لون واحد موحّد → يُلفّ كل التعبير، وإلا يُلوَّن كل مقطع على حدة
  const runs = Array.from(oMath.getElementsByTagNameNS(M_NS, "r")).filter(r => Array.from(r.children).some(c => isM(c, "t")));
  const colors = runs.map(runColor);
  const distinct = new Set(colors);
  const uniform = runs.length > 0 && distinct.size === 1 && colors[0] !== null;
  const anyColor = colors.some(c => c !== null);
  let body = seq(oMath, { amp: false, perRun: anyColor && !uniform });
  if (uniform) body = `\\textcolor{#${colors[0]}}{${body}}`;
  return body
    .replace(/\s+/g, " ")
    .replace(/\s*([{}^_&])\s*/g, "$1")
    .replace(/\\\\\s*/g, "\\\\ ")
    .replace(/\s+\\(end|right)/g, " \\$1")
    .trim();
}
