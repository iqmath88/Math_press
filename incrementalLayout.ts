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

export function createIncrementalLayout() {
  let cache = new Map<number, Cached>();
  let previousOptions: Options | undefined;
  return async (doc: PMNode, source: HTMLElement, target: HTMLElement, options: Options,
    signal: AbortSignal, invalidateAll: boolean, invalidated: ReadonlySet<HTMLElement>) => {
    const started = performance.now();
    const parts = segments(doc, source);
    const reuse = !invalidateAll && previousOptions === options;
    const stage = document.createElement("div");
    stage.className = "mp-editor print-pages live-lab-stage";
    stage.inert = true;
    target.after(stage);
    const next = new Map<number, Cached>();
    const sheets: HTMLElement[] = [];
    const ranges: (PageRange | null)[] = [];
    let overflow = false;
    let rebuilt = 0;
    let slice = performance.now();
    const append = (part: Cached) => {
      sheets.push(...part.sheets);
      ranges.push(...part.ranges);
      overflow ||= part.overflow;
    };
    try {
      for (const part of parts.length ? parts : [null]) {
        if (signal.aborted) return;
        if (part) {
          const cached = reuse ? cache.get(part.start) : undefined;
          if (cached && cached.final === part.final && same(cached.nodes, part.nodes)
            && same(cached.blocks, part.blocks) && !part.blocks.some(block => invalidated.has(block))) {
            next.set(part.start, cached);
            append(cached);
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
      const wanted = new Set(sheets);
      for (const child of [...target.children]) if (!wanted.has(child as HTMLElement)) child.remove();
      sheets.forEach((sheet, index) => {
        if (target.children[index] !== sheet) target.insertBefore(sheet, target.children[index] ?? null);
        sheet.dataset.printPage = String(index + 1);
        const label = sheet.querySelector(".pg-footer-num");
        if (label) {
          const text = options.showPageNumbers ? `صفحة ${index + 1} من ${sheets.length}` : "";
          if (label.textContent !== text) label.textContent = text;
        }
      });
      cache = next;
      previousOptions = options;
      return { ranges, overflow, rebuilt, elapsed: performance.now() - started };
    } finally { stage.remove(); }
  };
}
