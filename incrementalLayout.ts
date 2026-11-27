import type { Node as PMNode } from "@tiptap/pm/model";
import type { PageRange } from "./pageLayoutModel";
import { paginateForPrint } from "./PrintPagination";

type Segment = {
  start: number;
  final: boolean;
  nodes: PMNode[];
  blocks: HTMLElement[];
};
type Cached = Segment & {
  sheets: HTMLElement[];
  ranges: (PageRange | null)[];
  overflow: boolean;
};
type Options = { headerText: string; footerText: string; showPageNumbers: boolean };
const same = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((value, index) => value === b[index]);

function segments(doc: PMNode, source: HTMLElement): Segment[] {
  const blocks = [...source.children].filter((node): node is HTMLElement =>
    node instanceof HTMLElement && !node.matches(".pg-break,.ProseMirror-gapcursor"));
  if (blocks.length !== doc.childCount) return [];
  const result: Segment[] = [];
  let part: Segment = { start: 0, final: false, nodes: [], blocks: [] };
  for (let index = 0; index < blocks.length; index++) {
    const node = doc.child(index);
    if (node.type.name === "pageBreak") {
      if (!part.blocks.length) return [];
      result.push(part);
      part = { start: index + 1, final: false, nodes: [], blocks: [] };
    } else {
      part.nodes.push(node);
      part.blocks.push(blocks[index]);
    }
  }
  if (!part.blocks.length || (result.length && part.blocks.every(block =>
    block.matches("p:has(> .ProseMirror-trailingBreak:only-child)") && !block.textContent?.trim()))) return [];
  part.final = true;
  result.push(part);
  return result;
}

// A full render can seed reuse only where the shared print engine actually
// respected the explicit boundaries. A missing/straddling range stays uncached.
function seedCache(parts: Segment[], sheets: HTMLElement[], ranges: (PageRange | null)[]) {
  const cache = new Map<number, Cached>();
  let page = 0;
  for (const part of parts) {
    const first = page;
    if (ranges[first]?.start.block !== part.start || ranges[first]?.start.offset !== 0) return new Map<number, Cached>();
    const end = part.start + part.blocks.length;
    while (page < ranges.length) {
      const range = ranges[page];
      if (!range) return new Map<number, Cached>();
      if (range.start.block >= end) break;
      if (range.end.block > end || (range.end.block === end && range.end.offset !== 0)) return new Map<number, Cached>();
      page++;
    }
    const segmentSheets = sheets.slice(first, page);
    cache.set(part.start, { ...part, sheets: segmentSheets, ranges: ranges.slice(first, page),
      overflow: segmentSheets.some(sheet => sheet.classList.contains("print-sheet-overflow")) });
  }
  return page === sheets.length ? cache : new Map<number, Cached>();
}

export function createIncrementalLayout() {
  let cache = new Map<number, Cached>();
  let previousOptions: Options | undefined;
  let previousCount = 0;
  return async (doc: PMNode, source: HTMLElement, target: HTMLElement, options: Options,
    signal: AbortSignal, invalidateAll: boolean, invalidated: ReadonlySet<HTMLElement>) => {
    const started = performance.now();
    const parts = segments(doc, source);
    const reuse = !invalidateAll && previousOptions === options;
    const stage = document.createElement("div");
    stage.className = "mp-editor print-pages live-lab-stage";
    stage.inert = true;
    target.after(stage);
    let next = new Map<number, Cached>();
    const byFirstBlock = reuse ? new Map([...cache.values()].map(part => [part.blocks[0], part])) : new Map<HTMLElement, Cached>();
    const shifts: { sheets: HTMLElement[]; delta: number }[] = [];
    const sheets: HTMLElement[] = [];
    const ranges: (PageRange | null)[] = [];
    let overflow = false;
    let rebuilt = 0;
    let slice = performance.now();
    const full = !reuse || !parts.length || !cache.size;
    const append = (part: Cached) => {
      sheets.push(...part.sheets);
      ranges.push(...part.ranges);
      overflow ||= part.overflow;
    };
    try {
      for (const part of full ? [null] : parts) {
        if (signal.aborted) return;
        if (part) {
          const cached = byFirstBlock.get(part.blocks[0]);
          if (cached && cached.final === part.final && same(cached.nodes, part.nodes)
            && same(cached.blocks, part.blocks) && !part.blocks.some(block => invalidated.has(block))) {
            const delta = part.start - cached.start;
            const moved = delta === 0 ? cached : {
              ...cached, start: part.start,
              ranges: cached.ranges.map(range => range && ({
                start: { ...range.start, block: range.start.block + delta },
                end: { ...range.end, block: range.end.block + delta }
              }))
            };
            if (delta) shifts.push({ sheets: cached.sheets, delta });
            next.set(part.start, moved);
            append(moved);
            continue;
          }
        }
        const output = paginateForPrint(source, stage, { ...options,
          sourceWindow: part ? { blocks: part.blocks, start: part.start, final: part.final } : undefined });
        const children = [...stage.children] as HTMLElement[];
        rebuilt += children.length;
        // Buffer rebuilt sheets until the current generation commits.
        const entry = { ...(part ?? { start: 0, final: true, nodes: [], blocks: [] }),
          sheets: children, ranges: output.ranges, overflow: output.overflow };
        if (part) next.set(part.start, entry);
        append(entry);
        const holder = document.createElement("div");
        holder.append(...children);
        if (performance.now() - slice >= 12) {
          await new Promise<void>(resolve => setTimeout(resolve, 0));
          slice = performance.now();
        }
      }
      if (signal.aborted) return;
      for (const { sheets: moved, delta } of shifts) for (const sheet of moved)
        for (const block of sheet.querySelectorAll<HTMLElement>(".print-sheet-content > [data-page-source]"))
          block.dataset.pageSource = String(Number(block.dataset.pageSource) + delta);
      const wanted = new Set(sheets);
      for (const child of [...target.children]) if (!wanted.has(child as HTMLElement)) child.remove();
      sheets.forEach((sheet, index) => {
        if (target.children[index] !== sheet) target.insertBefore(sheet, target.children[index] ?? null);
        const number = String(index + 1);
        const alreadyNumbered = sheet.dataset.printPage === number && sheet.dataset.totalPages === String(sheets.length);
        if (alreadyNumbered && reuse && previousCount === sheets.length) return;
        sheet.dataset.printPage = number;
        sheet.dataset.totalPages = String(sheets.length);
        const label = sheet.querySelector(".pg-footer-num");
        if (label) {
          const text = options.showPageNumbers ? `صفحة ${index + 1} من ${sheets.length}` : "";
          if (label.textContent !== text) label.textContent = text;
        }
      });
      if (full) next = seedCache(parts, sheets, ranges);
      cache = next;
      previousOptions = options;
      previousCount = sheets.length;
      return { ranges, overflow, rebuilt, elapsed: performance.now() - started };
    } finally { stage.remove(); }
  };
}
