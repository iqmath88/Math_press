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
};

type PaginationState = { deco: DecorationSet; sig: string };
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
  const left = el("span", "pg-footer-text");
  left.textContent = footer;
  const right = el("span", "pg-footer-num");
  right.textContent = layout.showPageNumbers ? `صفحة ${page} من ${total}` : "";
  foot.append(left, right);
  root.appendChild(foot);

  if (!last) {
    root.appendChild(el("div", "pg-gap"));
    const head = el("div", "pg-header", mt);
    const text = el("span", "pg-header-text");
    text.textContent = layout.headerText;
    head.appendChild(text);
    root.appendChild(head);
  }
  return root;
}

function layoutKey(l: PageLayout) {
  return `${l.pageHeightMm}:${l.marginTopMm}:${l.marginBottomMm}:${l.headerText}:${l.showPageNumbers ? 1 : 0}`;
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

    const measure = (view: EditorView) => {
      if (!view.dom.isConnected) return;
      const layout: PageLayout = { ...ext.storage.layout };
      const usable = (layout.pageHeightMm - layout.marginTopMm - layout.marginBottomMm) * PX_PER_MM;
      const { doc } = view.state;
      const items: PageItem[] = [];
      const positions: number[] = [];
      doc.forEach((node, offset) => {
        const dom = view.nodeDOM(offset) as HTMLElement | null;
        const isBreak = node.type.name === "pageBreak";
        const height = isBreak || !dom ? 0 : dom.getBoundingClientRect().height;
        items.push({ height, breakAfter: isBreak });
        positions.push(offset);
      });
      const result = computeBreaks(items, usable);
      const footer = String(ext.storage.footerText ?? "");
      const sig = JSON.stringify([
        result.breaks.map(b => [positions[b.index], Math.round(b.filler)]),
        result.pages,
        Math.round(result.lastFiller),
        footer,
        layoutKey(layout)
      ]);
      const current = paginationKey.getState(view.state);
      ext.storage.pages = result.pages;
      if (current && current.sig === sig) return;
      view.dispatch(view.state.tr.setMeta(paginationKey, { result, positions, sig, footer, layout }).setMeta("addToHistory", false));
      ext.storage.onPages?.(result.pages);
    };

    return [
      new Plugin<PaginationState>({
        key: paginationKey,
        state: {
          init: () => ({ deco: DecorationSet.empty, sig: "" }),
          apply(tr, value) {
            const meta = tr.getMeta(paginationKey) as Meta | undefined;
            if (meta && "result" in meta) return { deco: buildDecorations(tr.doc, meta), sig: meta.sig };
            if (meta && "refresh" in meta) return { ...value, sig: "" };
            if (tr.docChanged) return { deco: value.deco.map(tr.mapping, tr.doc), sig: "" };
            return value;
          }
        },
        props: {
          decorations: state => paginationKey.getState(state)?.deco ?? DecorationSet.empty
        },
        view(editorView) {
          let raf = 0;
          const schedule = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
              raf = 0;
              measure(editorView);
            });
          };
          const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
          const observe = () => {
            if (!ro) return;
            ro.disconnect();
            editorView.state.doc.forEach((_node, offset) => {
              const dom = editorView.nodeDOM(offset);
              if (dom instanceof HTMLElement) ro.observe(dom);
            });
          };
          if (typeof document !== "undefined" && document.fonts?.ready) void document.fonts.ready.then(schedule);
          observe();
          schedule();
          return {
            update() {
              observe();
              schedule();
            },
            destroy() {
              if (raf) cancelAnimationFrame(raf);
              ro?.disconnect();
            }
          };
        }
      })
    ];
  }
});
