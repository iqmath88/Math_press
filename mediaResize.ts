import type { NodeViewRendererProps } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection } from "@tiptap/pm/state";

export function mediaResizeHandle(
  { editor, getPos, node }: NodeViewRendererProps,
  figure: HTMLElement,
  media: () => HTMLElement | SVGElement | null,
) {
  const handle = document.createElement("span");
  handle.className = "studio-resize-handle no-print";
  handle.setAttribute("aria-hidden", "true");
  let drag: { pointer: number; x: number; scale: number; direction: number; width: number; position: number } | null = null;

  const stopEvent = (event: Event) => event.target === handle;
  handle.addEventListener("pointerdown", event => {
    const position = getPos();
    const item = media();
    const selection = editor.state.selection;
    if (event.button !== 0 || position === undefined || !item || !figure.offsetWidth ||
        !(selection instanceof NodeSelection) || selection.from !== position) return;
    const scale = figure.getBoundingClientRect().width / figure.offsetWidth;
    if (!scale) return;
    drag = {
      pointer: event.pointerId,
      x: event.clientX,
      width: item instanceof HTMLElement ? item.offsetWidth : item.getBoundingClientRect().width / scale,
      scale,
      direction: getComputedStyle(figure).direction === "rtl" ? -1 : 1,
      position,
    };
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointerup", event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const start = drag;
    drag = null;
    const delta = event.clientX - start.x;
    const { state, view } = editor;
    const position = getPos();
    if (Math.abs(delta) < 3 || position !== start.position ||
        !(state.selection instanceof NodeSelection) || state.selection.from !== position ||
        state.selection.node.type !== node.type) return;
    const width = Math.round((start.width + delta * start.direction / start.scale) * 25.4 / 96);
    const widthMm = Math.min(250, Math.max(15, width));
    if (widthMm === state.selection.node.attrs.widthMm) return;
    const transaction = state.tr.setNodeMarkup(position, undefined, { ...state.selection.node.attrs, widthMm });
    view.dispatch(closeHistory(transaction.setSelection(NodeSelection.create(transaction.doc, position))));
  });
  handle.addEventListener("lostpointercapture", () => { drag = null; });
  return { handle, stopEvent };
}
