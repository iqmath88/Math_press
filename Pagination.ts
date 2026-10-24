import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { computeBreaks, type PageItem, type PaginationResult } from "./paginate";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pagination: {
      /** يعيد قياس الصفحات (مثلًا بعد تغيير نص التذييل). */
      repaginate: () => ReturnType;
    };
  }
}

const PX_PER_MM = 96 / 25.4;

type PaginationState = { deco: DecorationSet; sig: string };
type Meta = { result: PaginationResult; positions: number[]; sig: string; footer: string } | { refresh: true };

export const paginationKey = new PluginKey<PaginationState>("mathpress-pagination");

function el(tag: string, className: string, height?: number): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (height !== undefined) node.style.height = `${height}px`;
  return node;
}

/** فاصل الصفحة: فراغ الصفحة المنتهية + تذييلها + (على الشاشة فقط) فجوة + هامش أعلى الصفحة التالية. */
function buildBreak(page: number, total: number, filler: number, footer: string, mb: number, mt: number, last: boolean) {
  const root = el("div", last ? "pg-break pg-last" : "pg-break");
  root.contentEditable = "false";
  const f = el("div", "pg-filler");
  f.style.setProperty("--f", `${filler}px`);
  root.appendChild(f);

  const foot = el("div", "pg-footer", mb);
  const left = el("span", "pg-footer-text");
  left.textContent = footer;
  const right = el("span", "pg-footer-num");
  right.textContent = `صفحة ${page} من ${total}`;
  foot.append(left, right);
  root.appendChild(foot);

  if (!last) {
    root.appendChild(el("div", "pg-gap"));
    root.appendChild(el("div", "pg-header", mt));
  }
  return root;
}

function buildDecorations(doc: PMNode, meta: Extract<Meta, { result: PaginationResult }>, mt: number, mb: number) {
  const { result, positions, footer } = meta;
  const total = result.pages;
  const decos: Decoration[] = [];
  let page = 1;
  // الصفحات التي تمتدها كتلة ضخمة تُحتسب في العدد الكلي فقط.
  result.breaks.forEach((b, i) => {
    const pos = positions[b.index];
    const pageNo = page;
    decos.push(
      Decoration.widget(pos, () => buildBreak(pageNo, total, b.filler, footer, mb, mt, false), {
        side: -1,
        key: `pb:${i}:${pageNo}:${Math.round(b.filler)}:${total}:${footer}`,
        ignoreSelection: true,
        stopEvent: () => true
      })
    );
    page++;
  });
  const endPage = Math.max(page, total);
  decos.push(
    Decoration.widget(doc.content.size, () => buildBreak(endPage, total, result.lastFiller, footer, mb, mt, true), {
      side: 1,
      key: `pb:last:${endPage}:${Math.round(result.lastFiller)}:${total}:${footer}`,
      ignoreSelection: true,
      stopEvent: () => true
    })
  );
  return DecorationSet.create(doc, decos);
}

export const Pagination = Extension.create({
  name: "pagination",

  addOptions() {
    return { pageHeightMm: 297, marginTopMm: 20, marginBottomMm: 20 };
  },

  addStorage() {
    return {
      footerText: "",
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
    const mt = () => ext.options.marginTopMm * PX_PER_MM;
    const mb = () => ext.options.marginBottomMm * PX_PER_MM;
    const usable = () => (ext.options.pageHeightMm - ext.options.marginTopMm - ext.options.marginBottomMm) * PX_PER_MM;

    const measure = (view: EditorView) => {
      if (!view.dom.isConnected) return;
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
      const result = computeBreaks(items, usable());
      const footer = String(ext.storage.footerText ?? "");
      const sig = JSON.stringify([
        result.breaks.map(b => [positions[b.index], Math.round(b.filler)]),
        result.pages,
        Math.round(result.lastFiller),
        footer
      ]);
      const current = paginationKey.getState(view.state);
      ext.storage.pages = result.pages;
      if (current && current.sig === sig) return;
      view.dispatch(view.state.tr.setMeta(paginationKey, { result, positions, sig, footer }).setMeta("addToHistory", false));
      ext.storage.onPages?.(result.pages);
    };

    return [
      new Plugin<PaginationState>({
        key: paginationKey,
        state: {
          init: () => ({ deco: DecorationSet.empty, sig: "" }),
          apply(tr, value) {
            const meta = tr.getMeta(paginationKey) as Meta | undefined;
            if (meta && "result" in meta) {
              return { deco: buildDecorations(tr.doc, meta, mt(), mb()), sig: meta.sig };
            }
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
