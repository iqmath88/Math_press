import {applyFurniture,pageNumber,type PageFurniture} from "./pageFurniture";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { computeBreaks, type PageItem, type PaginationResult } from "./paginate";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pagination: {
      /** يعيد قياس الصفحات (بعد تغيير الهوامش أو الاتجاه أو نصوص الرأس والتذييل). */
      repaginate: () => ReturnType;
    };
  }
}

const PX_PER_MM = 96 / 25.4;

export type PageLayout = {
  pageHeightMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  headerText: string;
  showPageNumbers: boolean;
  furniture?: PageFurniture;
};

type PaginationState = { revision: number; deco: DecorationSet; sig: string };
type Meta =
  | { result: PaginationResult; positions: number[]; sig: string; footer: string; layout: PageLayout }
  | { refresh: true };

export const paginationKey = new PluginKey<PaginationState>("mathpress-pagination");

function el(tag: string, className: string, height?: number): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (height !== undefined) node.style.height = `${height}px`;
  return node;
}

/** فاصل الصفحة: فراغ نهاية الصفحة + تذييلها + (على الشاشة فقط) فجوة + رأس الصفحة التالية. */
function buildBreak(
  page: number, total: number, filler: number, footer: string, layout: PageLayout, last: boolean
) {
  const mb = layout.marginBottomMm * PX_PER_MM;
  const mt = layout.marginTopMm * PX_PER_MM;
  const root = el("div", last ? "pg-break pg-last" : "pg-break");
  root.contentEditable = "false";
  const f = el("div", "pg-filler");
  f.style.setProperty("--f", `${filler}px`);
  root.appendChild(f);

  const foot = el("div", "pg-footer", mb);
  applyFurniture(foot,footer,layout.furniture?.footerEnd,layout.furniture?.rule,layout.furniture?.footerCenter,layout.furniture?.preset);
  const right = el("span", "pg-footer-num");
  right.textContent = layout.showPageNumbers ? pageNumber(page,total,layout.furniture) : "";
  foot.append(right);
  root.appendChild(foot);

  if (!last) {
    root.appendChild(el("div", "pg-gap"));
    const head = el("div", "pg-header", mt);
    applyFurniture(head,layout.headerText,layout.furniture?.headerEnd,layout.furniture?.rule,layout.furniture?.headerCenter,layout.furniture?.preset);
    root.appendChild(head);
  }
  return root;
}

function layoutKey(l: PageLayout) {
  return `${l.pageHeightMm}:${l.marginTopMm}:${l.marginBottomMm}:${l.headerText}:${l.showPageNumbers ? 1 : 0}:${l.furniture ? JSON.stringify(l.furniture) : ""}`;
}

function buildDecorations(doc: PMNode, meta: Extract<Meta, { result: PaginationResult }>) {
  const { result, positions, footer, layout } = meta;
  const total = result.pages;
  const lk = layoutKey(layout);
  const decos: Decoration[] = [];
  let page = 1;
  result.breaks.forEach((b, i) => {
    const pos = positions[b.index];
    const pageNo = page;
    decos.push(
      Decoration.widget(pos, () => buildBreak(pageNo, total, b.filler, footer, layout, false), {
        side: -1,
        key: `pb:${i}:${pageNo}:${Math.round(b.filler)}:${total}:${footer}:${lk}`,
        ignoreSelection: true,
        stopEvent: () => true
      })
    );
    page++;
  });
  const endPage = Math.max(page, total);
  decos.push(
    Decoration.widget(doc.content.size, () => buildBreak(endPage, total, result.lastFiller, footer, layout, true), {
      side: 1,
      key: `pb:last:${endPage}:${Math.round(result.lastFiller)}:${total}:${footer}:${lk}`,
      ignoreSelection: true,
      stopEvent: () => true
    })
  );
  return DecorationSet.create(doc, decos);
}

export const Pagination = Extension.create({
  name: "pagination",

  addStorage() {
    return {
      footerText: "",
      layout: {
        pageHeightMm: 297,
        marginTopMm: 20,
        marginBottomMm: 20,
        headerText: "",
        showPageNumbers: true
      } as PageLayout,
      pages: 1,
      pageStarts: [] as number[],
      onPages: null as ((pages: number) => void) | null
    };
  },

  addCommands() {
    return {
      repaginate: () => ({ tr, dispatch }) => {
        if (dispatch) dispatch(tr.setMeta(paginationKey, { refresh: true }));
        return true;
      }
    };
  },

  addProseMirrorPlugins() {
    const ext = this;

    const measure = (view: EditorView, measurements: WeakMap<HTMLElement, { node: PMNode; item: PageItem }>) => {
      if (!view.dom.isConnected) return;
      const layout: PageLayout = { ...ext.storage.layout };
      const usable = (layout.pageHeightMm - layout.marginTopMm - layout.marginBottomMm) * PX_PER_MM;
      const { doc } = view.state;
      const zoom = Number(getComputedStyle(view.dom).getPropertyValue("--editor-zoom")) || 1;
      const items: PageItem[] = [];
      const positions: number[] = [];
      doc.forEach((node, offset) => {
        const dom = view.nodeDOM(offset);
        const isBreak = node.type.name === "pageBreak";
        positions.push(offset);
        if (!(dom instanceof HTMLElement)) {
          items.push({ height: 0, breakAfter: isBreak });
          return;
        }
        const previous = measurements.get(dom);
        if (previous?.node === node) {
          items.push(previous.item);
          return;
        }
        const height = isBreak ? 0 : dom.getBoundingClientRect().height / zoom;
        const placement = dom.matches("[data-educational-style], [data-paragraph-format], [data-education-block]") ? getComputedStyle(dom) : null;
        const item = {
          height, breakAfter: isBreak,
          breakBefore: placement?.getPropertyValue("--break-before").trim() === "1",
          keepWithNext: placement?.getPropertyValue("--keep-with-next").trim() === "1"
        };
        measurements.set(dom, { node, item });
        items.push(item);
      });
      const result = computeBreaks(items, usable);
      const footer = String(ext.storage.footerText ?? "");
      const sig = JSON.stringify([
        result.breaks.map(b => [b.index, Math.round(b.filler)]),
        result.pages,
        Math.round(result.lastFiller),
        footer,
        layoutKey(layout)
      ]);
      const current = paginationKey.getState(view.state);
      ext.storage.pages = result.pages;
      ext.storage.pageStarts = result.breaks.map(b => positions[b.index]);
      if (current?.sig === sig) {
        const mapped = current.deco.find();
        if (mapped.length === result.breaks.length + 1 &&
            mapped.every((widget,index)=>widget.from ===
              (index < result.breaks.length ? positions[result.breaks[index].index] : doc.content.size))) return;
      }
      view.dispatch(view.state.tr.setMeta(paginationKey, { result, positions, sig, footer, layout }).setMeta("addToHistory", false));
      ext.storage.onPages?.(result.pages);
    };

    return [
      new Plugin<PaginationState>({
        key: paginationKey,
        state: {
          init: () => ({ deco: DecorationSet.empty, sig: "", revision: 0 }),
          apply(tr, value) {
            const meta = tr.getMeta(paginationKey) as Meta | undefined;
            if (meta && "result" in meta) return { ...value, deco: buildDecorations(tr.doc, meta), sig: meta.sig };
            if (meta && "refresh" in meta) return { ...value, sig: "", revision: value.revision + 1 };
            if (tr.docChanged) return { ...value, deco: value.deco.map(tr.mapping, tr.doc) };
            return value;
          }
        },
        props: {
          decorations: state => paginationKey.getState(state)?.deco ?? DecorationSet.empty
        },
        view(editorView) {
          let raf = 0;
          let destroyed = false;
          let observedDoc: PMNode | null = null;
          let observedBlocks = new Set<HTMLElement>();
          let measurements = new WeakMap<HTMLElement, { node: PMNode; item: PageItem }>();
          const schedule = () => {
            if (raf || destroyed) return;
            raf = requestAnimationFrame(() => {
              raf = 0;
              observe();
              measure(editorView, measurements);
            });
          };
          const refresh = () => {
            measurements = new WeakMap();
            schedule();
          };
          const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(entries => {
            for (const entry of entries) measurements.delete(entry.target as HTMLElement);
            schedule();
          }) : null;
          const observe = () => {
            if (!ro || observedDoc === editorView.state.doc) return;
            observedDoc = editorView.state.doc;
            const next = new Set<HTMLElement>();
            observedDoc.forEach((_node, offset) => {
              const dom = editorView.nodeDOM(offset);
              if (!(dom instanceof HTMLElement)) return;
              next.add(dom);
              if (!observedBlocks.has(dom)) ro.observe(dom);
            });
            for (const dom of observedBlocks) if (!next.has(dom)) ro.unobserve(dom);
            observedBlocks = next;
          };
          if (typeof document !== "undefined" && document.fonts?.ready) void document.fonts.ready.then(refresh);
          schedule();
          return {
            update(view, previous) {
              const state = view.state;
              const revision = paginationKey.getState(state)?.revision;
              if (revision !== paginationKey.getState(previous)?.revision) refresh();
              else if (state.doc !== previous.doc) schedule();
            },
            destroy() {
              destroyed = true;
              if (raf) cancelAnimationFrame(raf);
              ro?.disconnect();
            }
          };
        }
      })
    ];
  }
});
