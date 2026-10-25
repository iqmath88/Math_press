import { compileExpr, evalNumber } from "./expr";
import { parsePoints, type GraphItem, type GraphSpec, type ParsedPoint } from "./graphSpec";

let jxgPromise: Promise<any> | null = null;
/** تحميل JSXGraph عند الحاجة فقط ليبقى التطبيق خفيفًا إن لم يوجد رسم في المستند. */
export function loadJXG(): Promise<any> {
  jxgPromise ??= import("jsxgraph").then(m => (m as any).default ?? m);
  return jxgPromise;
}

const FONT = 15;

function pointAttrs(color: string, name: string) {
  return {
    name,
    withLabel: !!name,
    size: 3,
    strokeColor: color,
    fillColor: color,
    fixed: true,
    highlight: false,
    showInfobox: false,
    label: { offset: [7, 7], fontSize: FONT, strokeColor: "#111", highlight: false, display: "internal" }
  };
}

/** يضع نقاطًا ظاهرة للأسماء المعطاة فقط (النقاط بلا اسم تبقى مخفية). */
function labelledPoints(board: any, pts: ParsedPoint[], color: string) {
  for (const p of pts) {
    if (p.name) board.create("point", [p.x, p.y], pointAttrs(color, p.name));
  }
}

function hiddenPoint(board: any, p: ParsedPoint) {
  return board.create("point", [p.x, p.y], { visible: false, fixed: true, name: "", withLabel: false, highlight: false });
}

function lineAttrs(color: string, dashed: boolean) {
  return { strokeColor: color, strokeWidth: 2, dash: dashed ? 2 : 0, fixed: true, highlight: false, showInfobox: false };
}

/** يرسم عناصر المواصفات على لوحة JSXGraph. يعيد قائمة بأخطاء العناصر التي تعذّر رسمها. */
export function drawItems(board: any, spec: GraphSpec): string[] {
  const errors: string[] = [];
  for (const item of spec.items as GraphItem[]) {
    try {
      drawItem(board, spec, item);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "تعذر رسم عنصر");
    }
  }
  return errors;
}

function drawItem(board: any, spec: GraphSpec, item: GraphItem) {
  switch (item.type) {
    case "function": {
      const fn = compileExpr(item.expr);
      const a = item.from.trim() ? evalNumber(item.from) : spec.xmin;
      const b = item.to.trim() ? evalNumber(item.to) : spec.xmax;
      board.create("functiongraph", [(x: number) => fn(x), a, b], {
        ...lineAttrs(item.color, item.dashed), numberPointsHigh: 600
      });
      return;
    }
    case "points": {
      const pts = parsePoints(item.pts);
      for (const p of pts) board.create("point", [p.x, p.y], pointAttrs(item.color, p.name));
      return;
    }
    case "segment": {
      const pts = parsePoints(item.pts);
      board.create("segment", [[pts[0].x, pts[0].y], [pts[1].x, pts[1].y]], lineAttrs(item.color, item.dashed));
      labelledPoints(board, pts, item.color);
      return;
    }
    case "line": {
      const pts = parsePoints(item.pts);
      board.create("line", [[pts[0].x, pts[0].y], [pts[1].x, pts[1].y]], lineAttrs(item.color, item.dashed));
      labelledPoints(board, pts, item.color);
      return;
    }
    case "polygon": {
      const pts = parsePoints(item.pts);
      board.create("polygon", pts.map(p => [p.x, p.y]), {
        fillColor: item.color,
        fillOpacity: item.fill ? 0.14 : 0,
        highlight: false,
        fixed: true,
        hasInnerPoints: false,
        borders: lineAttrs(item.color, false),
        vertices: { visible: false, fixed: true, withLabel: false }
      });
      labelledPoints(board, pts, item.color);
      return;
    }
    case "circle": {
      const [c] = parsePoints(item.pts);
      const r = evalNumber(item.radius);
      board.create("circle", [[c.x, c.y], r], {
        ...lineAttrs(item.color, false),
        fillColor: item.color,
        fillOpacity: item.fill ? 0.14 : 0,
        hasInnerPoints: false,
        center: { visible: false }
      });
      labelledPoints(board, [c], item.color);
      return;
    }
    case "angle": {
      const [a, v, c] = parsePoints(item.pts);
      // JSXGraph يقيس الزاوية عكس عقارب الساعة من الضلع الأول إلى الثاني، فنرتّب الطرفين لتكون الزاوية الأصغر دائمًا.
      const cross = (a.x - v.x) * (c.y - v.y) - (a.y - v.y) * (c.x - v.x);
      const [p1, p2] = cross >= 0 ? [a, c] : [c, a];
      const span = Math.max(spec.xmax - spec.xmin, spec.ymax - spec.ymin);
      board.create("angle", [hiddenPoint(board, p1), hiddenPoint(board, v), hiddenPoint(board, p2)], {
        radius: span * 0.07,
        name: item.label,
        withLabel: !!item.label,
        strokeColor: item.color,
        fillColor: item.color,
        fillOpacity: 0.18,
        fixed: true,
        highlight: false,
        label: { fontSize: FONT, strokeColor: "#111", display: "internal", highlight: false }
      });
      labelledPoints(board, [a, v, c], item.color);
      return;
    }
    case "text": {
      const [p] = parsePoints(item.pts);
      board.create("text", [p.x, p.y, item.text], {
        strokeColor: item.color, fontSize: FONT, fixed: true, highlight: false, display: "internal"
      });
      return;
    }
  }
}

export type GraphHandle = {
  update(spec: GraphSpec): void;
  destroy(): void;
  /** أخطاء آخر رسم (للمعاينة). */
  errors(): string[];
};

let boxCounter = 0;

/** يربط لوحة JSXGraph بعنصر. يعيد الرسم عند تغيّر الحجم أو المواصفات. */
export function mountGraph(box: HTMLElement, initial: GraphSpec, onDrawn?: (errors: string[]) => void): GraphHandle {
  if (!box.id) box.id = `mp-graph-${Date.now().toString(36)}-${boxCounter++}`;
  let spec = initial;
  let board: any = null;
  let destroyed = false;
  let lastErrors: string[] = [];
  let token = 0;

  const free = (JXG: any) => {
    if (board) {
      try { JXG.JSXGraph.freeBoard(board); } catch { /* اللوحة أُزيلت */ }
      board = null;
    }
  };

  const draw = async () => {
    const my = ++token;
    let JXG: any;
    try { JXG = await loadJXG(); } catch { lastErrors = ["تعذر تحميل مكتبة الرسم"]; onDrawn?.(lastErrors); return; }
    if (destroyed || my !== token) return;
    if (box.clientWidth < 8 || box.clientHeight < 8) return; // بانتظار اكتمال التخطيط
    free(JXG);
    box.replaceChildren();
    try {
      board = JXG.JSXGraph.initBoard(box.id, {
        boundingbox: [spec.xmin, spec.ymax, spec.xmax, spec.ymin],
        axis: spec.axes,
        grid: spec.grid,
        keepAspectRatio: false,
        showCopyright: false,
        showNavigation: false,
        showInfobox: false,
        pan: { enabled: false },
        zoom: { enabled: false },
        renderer: "svg"
      });
      lastErrors = drawItems(board, spec);
    } catch (e) {
      lastErrors = [e instanceof Error ? e.message : "تعذر إنشاء الرسم"];
    }
    onDrawn?.(lastErrors);
  };

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { void draw(); }) : null;
  ro?.observe(box);
  void draw();

  return {
    update(next) { spec = next; void draw(); },
    errors: () => lastErrors,
    destroy() {
      destroyed = true;
      ro?.disconnect();
      if (board) loadJXG().then(JXG => free(JXG)).catch(() => undefined);
    }
  };
}
