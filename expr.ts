/**
 * محلّل تعابير رياضية آمن (بدون eval) لرسم الدوال.
 * يدعم: + - * / ^ ، الأقواس، الضرب الضمني (2x، 3(x+1)، 2pi)، الثوابت pi وe،
 * والدوال: sin cos tan cot sec csc asin acos atan sinh cosh tanh sqrt cbrt abs exp ln log log10 log2 floor ceil round sign.
 * المتغير المسموح: x فقط. يقبل أيضًا بادئة "y=" أو "f(x)=" والرمزين × ÷ − و π والفاصلة العربية للعشري.
 */
export type CompiledExpr = (x: number) => number;

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  cot: v => 1 / Math.tan(v), sec: v => 1 / Math.cos(v), csc: v => 1 / Math.sin(v),
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp,
  ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function normalize(src: string): string {
  return src
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660)) // أرقام هندية
    .replace(/\u066B/g, ".")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .trim()
    .replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, "");
}

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+(?![a-zA-Z]))?/.exec(s.slice(i));
      if (!m) throw new Error(`رقم غير صالح عند الموضع ${i + 1}`);
      out.push({ t: "num", v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      const m = /^[a-zA-Z]+[0-9]*/.exec(s.slice(i))!;
      out.push({ t: "id", v: m[0].toLowerCase() });
      i += m[0].length;
      continue;
    }
    if ("+-*/^(),".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new Error(`رمز غير مدعوم «${c}»`);
  }
  return out;
}

type Node =
  | { k: "num"; v: number }
  | { k: "x" }
  | { k: "neg"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "fn"; f: (v: number) => number; a: Node };

class Parser {
  private p = 0;
  constructor(private toks: Tok[], private allowX: boolean) {}

  parse(): Node {
    if (this.toks.length === 0) throw new Error("التعبير فارغ");
    const n = this.expr();
    if (this.p < this.toks.length) throw new Error("جزء زائد في نهاية التعبير");
    return n;
  }
  private peek() { return this.toks[this.p]; }
  private isOp(v: string) { const t = this.peek(); return !!t && t.t === "op" && t.v === v; }

  private expr(): Node {
    let a = this.term();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.toks[this.p++] as { v: string }).v;
      a = { k: "bin", op, a, b: this.term() };
    }
    return a;
  }
  private term(): Node {
    let a = this.unary();
    for (;;) {
      if (this.isOp("*") || this.isOp("/")) {
        const op = (this.toks[this.p++] as { v: string }).v;
        a = { k: "bin", op, a, b: this.unary() };
      } else {
        const t = this.peek();
        const startsFactor = !!t && (t.t === "num" || t.t === "id" || (t.t === "op" && t.v === "("));
        if (!startsFactor) break;
        a = { k: "bin", op: "*", a, b: this.unary() }; // ضرب ضمني
      }
    }
    return a;
  }
  private unary(): Node {
    if (this.isOp("-")) { this.p++; return { k: "neg", a: this.unary() }; }
    if (this.isOp("+")) { this.p++; return this.unary(); }
    return this.power();
  }
  private power(): Node {
    const base = this.atom();
    if (this.isOp("^")) {
      this.p++;
      return { k: "bin", op: "^", a: base, b: this.unary() }; // ^ يرتبط من اليمين
    }
    return base;
  }
  private atom(): Node {
    const t = this.toks[this.p++];
    if (!t) throw new Error("التعبير ناقص");
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "op" && t.v === "(") {
      const n = this.expr();
      if (!this.isOp(")")) throw new Error("قوس غير مغلق");
      this.p++;
      return n;
    }
    if (t.t === "id") {
      if (t.v === "x") {
        if (!this.allowX) throw new Error("المتغير x غير مسموح هنا");
        return { k: "x" };
      }
      if (own(CONSTS, t.v)) return { k: "num", v: CONSTS[t.v] };
      if (own(FUNCS, t.v)) {
        const f = FUNCS[t.v];
        if (!this.isOp("(")) throw new Error(`الدالة ${t.v} تحتاج قوسين: ${t.v}(…)`);
        this.p++;
        const a = this.expr();
        if (!this.isOp(")")) throw new Error("قوس غير مغلق");
        this.p++;
        return { k: "fn", f, a };
      }
      throw new Error(`اسم غير معروف «${t.v}»`);
    }
    throw new Error(`رمز غير متوقع «${t.v}»`);
  }
}

function evaluate(n: Node, x: number): number {
  switch (n.k) {
    case "num": return n.v;
    case "x": return x;
    case "neg": return -evaluate(n.a, x);
    case "fn": return n.f(evaluate(n.a, x));
    case "bin": {
      const a = evaluate(n.a, x);
      const b = evaluate(n.b, x);
      switch (n.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        default: return Math.pow(a, b);
      }
    }
  }
}

/** يترجم تعبيرًا بالمتغير x إلى دالة. يرمي Error برسالة عربية عند وجود خطأ. */
export function compileExpr(src: string): CompiledExpr {
  const node = new Parser(tokenize(normalize(src)), true).parse();
  return x => evaluate(node, x);
}

/** يحسب تعبيرًا عدديًا ثابتًا (بلا x) مثل sqrt(2)/2 أو 3pi. */
export function evalNumber(src: string): number {
  const node = new Parser(tokenize(normalize(src)), false).parse();
  const v = evaluate(node, 0);
  if (!Number.isFinite(v)) throw new Error("القيمة غير معرّفة");
  return v;
}
