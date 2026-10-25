import { compileExpr, evalNumber } from "./expr";

export type GraphItem =
  | { id: string; type: "function"; expr: string; color: string; dashed: boolean; from: string; to: string }
  | { id: string; type: "points"; pts: string; color: string }
  | { id: string; type: "segment"; pts: string; color: string; dashed: boolean }
  | { id: string; type: "line"; pts: string; color: string; dashed: boolean }
  | { id: string; type: "polygon"; pts: string; color: string; fill: boolean }
  | { id: string; type: "circle"; pts: string; radius: string; color: string; fill: boolean }
  | { id: string; type: "angle"; pts: string; label: string; color: string }
  | { id: string; type: "text"; pts: string; text: string; color: string };

export type GraphItemType = GraphItem["type"];

export type GraphSpec = {
  xmin: number; xmax: number; ymin: number; ymax: number;
  axes: boolean; grid: boolean; equal: boolean;
  widthPct: number;
  caption: string;
  items: GraphItem[];
};

export const GRAPH_COLORS = ["#1d4ed8", "#c2410c", "#15803d", "#7e22ce", "#be123c", "#111111"];

export const ITEM_LABELS: Record<GraphItemType, string> = {
  function: "دالة y = f(x)",
  points: "نقاط",
  segment: "قطعة مستقيمة",
  line: "مستقيم",
  polygon: "مضلع",
  circle: "دائرة",
  angle: "زاوية",
  text: "نص على الرسم"
};

let counter = 0;
const uid = () => `g${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newItem(type: GraphItemType, colorIndex = 0): GraphItem {
  const color = GRAPH_COLORS[colorIndex % GRAPH_COLORS.length];
  const id = uid();
  switch (type) {
    case "function": return { id, type, expr: "x^2-2", color, dashed: false, from: "", to: "" };
    case "points": return { id, type, pts: "A(1,2) B(-2,1)", color };
    case "segment": return { id, type, pts: "A(0,0) B(3,2)", color, dashed: false };
    case "line": return { id, type, pts: "(0,0) (2,1)", color, dashed: false };
    case "polygon": return { id, type, pts: "A(0,0) B(4,0) C(0,3)", color, fill: true };
    case "circle": return { id, type, pts: "O(0,0)", radius: "2", color, fill: false };
    case "angle": return { id, type, pts: "A(3,0) B(0,0) C(2,2)", label: "45°", color };
    case "text": return { id, type, pts: "(1,1)", text: "نص", color };
  }
}

export function defaultGraphSpec(): GraphSpec {
  return {
    xmin: -5, xmax: 5, ymin: -5, ymax: 5,
    axes: true, grid: true, equal: true,
    widthPct: 60,
    caption: "",
    items: [newItem("function", 0)]
  };
}

export type ParsedPoint = { name: string; x: number; y: number };

/** يقرأ نقاطًا بصيغة «A(0,0) B(4,0) C(sqrt(2),1)» أو «(1,2) (3,4)». يرمي Error برسالة عربية. */
export function parsePoints(src: string): ParsedPoint[] {
  const out: ParsedPoint[] = [];
  let i = 0;
  const s = src;
  while (i < s.length) {
    while (i < s.length && /[\s;،]/.test(s[i])) i++;
    if (i >= s.length) break;
    let name = "";
    while (i < s.length && s[i] !== "(" && !/\s/.test(s[i])) name += s[i++];
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] !== "(") throw new Error(`بعد الاسم «${name}» يجب أن تأتي الإحداثيات بين قوسين، مثل A(1,2)`);
    let depth = 0;
    let body = "";
    let end = -1;
    for (let j = i; j < s.length; j++) {
      if (s[j] === "(") { depth++; if (depth === 1) continue; }
      if (s[j] === ")") { depth--; if (depth === 0) { end = j; break; } }
      body += s[j];
    }
    if (end < 0) throw new Error("قوس غير مغلق في الإحداثيات");
    const parts: string[] = [];
    let d = 0, cur = "";
    for (const ch of body) {
      if (ch === "(") d++;
      if (ch === ")") d--;
      if ((ch === "," || ch === "،") && d === 0) { parts.push(cur); cur = ""; } else cur += ch;
    }
    parts.push(cur);
    if (parts.length !== 2) throw new Error("كل نقطة تحتاج إحداثيين: (x,y)");
    out.push({ name, x: evalNumber(parts[0]), y: evalNumber(parts[1]) });
    i = end + 1;
  }
  return out;
}

/** يتحقق من عنصر ويعيد رسالة خطأ عربية أو null. */
export function validateItem(item: GraphItem): string | null {
  try {
    switch (item.type) {
      case "function": {
        compileExpr(item.expr);
        if (item.from.trim()) evalNumber(item.from);
        if (item.to.trim()) evalNumber(item.to);
        return null;
      }
      case "points": if (parsePoints(item.pts).length < 1) return "أدخل نقطة واحدة على الأقل"; return null;
      case "segment":
      case "line": if (parsePoints(item.pts).length !== 2) return "أدخل نقطتين بالضبط"; return null;
      case "polygon": if (parsePoints(item.pts).length < 3) return "المضلع يحتاج 3 نقاط على الأقل"; return null;
      case "circle": {
        if (parsePoints(item.pts).length !== 1) return "أدخل نقطة المركز فقط";
        if (!(evalNumber(item.radius) > 0)) return "نصف القطر يجب أن يكون موجبًا";
        return null;
      }
      case "angle": if (parsePoints(item.pts).length !== 3) return "الزاوية تحتاج 3 نقاط: الطرف الأول، الرأس، الطرف الثاني"; return null;
      case "text": if (parsePoints(item.pts).length !== 1) return "أدخل موضعًا واحدًا (x,y)"; return null;
    }
  } catch (e) {
    return e instanceof Error ? e.message : "خطأ في الإدخال";
  }
}

export function validateSpec(spec: GraphSpec): string | null {
  if (![spec.xmin, spec.xmax, spec.ymin, spec.ymax].every(Number.isFinite)) return "حدود المحاور يجب أن تكون أرقامًا";
  if (spec.xmax <= spec.xmin) return "الحد الأعلى لـ x يجب أن يكون أكبر من الأدنى";
  if (spec.ymax <= spec.ymin) return "الحد الأعلى لـ y يجب أن يكون أكبر من الأدنى";
  return null;
}

/** نسبة العرض إلى الارتفاع للوحة الرسم. */
export function graphAspect(spec: GraphSpec): number {
  if (!spec.equal) return 4 / 3;
  const a = (spec.xmax - spec.xmin) / (spec.ymax - spec.ymin);
  return Math.min(4, Math.max(0.35, a));
}

/** قراءة آمنة لمواصفات مخزنة (قد تكون ناقصة أو تالفة). */
export function sanitizeSpec(raw: unknown): GraphSpec {
  const d = defaultGraphSpec();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<GraphSpec>;
  const num = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) ? v : fb);
  return {
    xmin: num(r.xmin, d.xmin), xmax: num(r.xmax, d.xmax), ymin: num(r.ymin, d.ymin), ymax: num(r.ymax, d.ymax),
    axes: r.axes !== false, grid: r.grid !== false, equal: r.equal !== false,
    widthPct: Math.min(100, Math.max(20, num(r.widthPct, d.widthPct))),
    caption: typeof r.caption === "string" ? r.caption : "",
    items: Array.isArray(r.items) ? (r.items.filter(i => i && typeof i === "object" && "type" in i) as GraphItem[]) : []
  };
}
