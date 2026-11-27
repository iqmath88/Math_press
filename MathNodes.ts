import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import type { MathfieldElement } from "mathlive";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    math: {
      insertMathInline: (latex?: string, focus?: boolean) => ReturnType;
      insertMathBlock: (latex?: string, focus?: boolean) => ReturnType;
    };
  }
}

export const EDIT_MATH_EVENT = "mathpress:edit-math";
const RETURN_TO_TEXT = "mathpress:return-to-text";
const textHandoff = new WeakMap<Editor, MathfieldElement>();

// MathLive's programmatic focus can defer focusing its shadow keyboard sink
// while the editor still owns focus. Native focus delegates into the shadow
// root first, so a later MathLive callback cannot mistake the editor for the
// element that originally received focus.
function focusMathfield(editor: Editor, field: MathfieldElement) {
  textHandoff.delete(editor);
  HTMLElement.prototype.focus.call(field, { preventScroll: true });
}

export function returnFromMath(field: MathfieldElement) {
  field.dispatchEvent(new Event(RETURN_TO_TEXT));
}

export function mathFormat(attrs: Record<string, unknown>) {
  return {
    color: typeof attrs.color === "string" && /^#[\da-f]{6}$/i.test(attrs.color) ? attrs.color : null,
    size: typeof attrs.size === "number" && attrs.size >= 8 && attrs.size <= 72 ? attrs.size : null,
    align: attrs.align === "left" || attrs.align === "right" || attrs.align === "center" ? attrs.align : null
  };
}

// يُضبط قبل الإدراج مباشرة ليأخذ حقل المعادلة الجديد التركيز.
const focusNext = new WeakSet<Editor>();

function createMathNode(name: "mathInline" | "mathBlock") {
  const inline = name === "mathInline";
  const dataAttr = inline ? "data-math-inline" : "data-math-block";

  return Node.create({
    name,
    group: inline ? "inline" : "block",
    inline,
    atom: true,
    selectable: true,
    draggable: false,

    addAttributes() {
      return {
        color: { default: null, parseHTML: el => el.getAttribute("data-math-color"),
          renderHTML: attrs => { const { color } = mathFormat(attrs); return color ? { "data-math-color": color } : {}; } },
        size: { default: null, parseHTML: el => Number(el.getAttribute("data-math-size")) || null,
          renderHTML: attrs => { const { size } = mathFormat(attrs); return size ? { "data-math-size": size } : {}; } },
        align: { default: null, parseHTML: el => el.getAttribute("data-math-align"),
          renderHTML: attrs => { const { align } = mathFormat(attrs); return align ? { "data-math-align": align } : {}; } },
        latex: {
          default: "",
          parseHTML: el => el.getAttribute("data-latex") ?? el.textContent ?? "",
          renderHTML: attrs => ({ "data-latex": attrs.latex as string })
        }
      };
    },

    parseHTML() {
      return [{ tag: inline ? "span[data-math-inline]" : "div[data-math-block]" }];
    },

    renderHTML({ node, HTMLAttributes }) {
      return [
        inline ? "span" : "div",
        mergeAttributes(HTMLAttributes, { [dataAttr]: "", class: inline ? "math-inline" : "math-block" }),
        node.attrs.latex as string
      ];
    },

    renderText({ node }) {
      return inline ? `$${node.attrs.latex}$` : `$$${node.attrs.latex}$$`;
    },

    addCommands() {
      const insert = (latex: string, focus: boolean) => ({ commands }: { commands: any }) => {
        if (focus) {
          focusNext.add(this.editor);
          queueMicrotask(() => focusNext.delete(this.editor));
        }
        const ok = commands.insertContent({ type: name, attrs: { latex } });
        if (!ok || !focus) focusNext.delete(this.editor);
        return ok;
      };
      return inline
        ? { insertMathInline: (latex = "", focus = true) => insert(latex, focus) }
        : { insertMathBlock: (latex = "", focus = true) => insert(latex, focus) };
    },

    addKeyboardShortcuts(): Record<string, () => boolean> {
      if (!inline) return {};
      const enter = (right: boolean) => {
        const { view, state } = this.editor;
        const selection = state.selection;
        if (!(selection instanceof TextSelection) || !selection.empty) return false;
        const { $from } = selection;
        const element = $from.depth ? view.nodeDOM($from.before()) : view.dom;
        const rtl = element instanceof Element && getComputedStyle(element).direction === "rtl";
        const forward = right !== !!rtl;
        const neighbor = forward ? $from.nodeAfter : $from.nodeBefore;
        if (neighbor?.type.name !== name) return false;
        const wrapper = view.nodeDOM(forward ? $from.pos : $from.pos - neighbor.nodeSize);
        const field = wrapper instanceof Element ? wrapper.querySelector<MathfieldElement>("math-field") : null;
        if (!field) return false;
        field.position = right ? 0 : field.lastOffset;
        let attempts = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const stop = () => {
          clearTimeout(timer);
          field.removeEventListener("focus", stop);
        };
        const focusField = () => {
          if (document.activeElement === field || !field.isConnected ||
            !view.hasFocus() || !view.state.selection.eq(selection) || attempts === 7) {
            stop();
            return;
          }
          attempts++;
          timer = setTimeout(focusField, 50);
          focusMathfield(this.editor, field);
        };
        // Once MathLive accepts focus, a retry must never reclaim it after Escape or history.
        field.addEventListener("focus", stop, { once: true });
        focusField();
        return true;
      };
      const allowTab = () => {
        textHandoff.delete(this.editor);
        return false;
      };
      return { ArrowLeft: () => enter(false), ArrowRight: () => enter(true), Tab: allowTab, "Shift-Tab": allowTab };
    },

    addNodeView() {
      return ({ node, editor, getPos }) => {
        let current = node;
        const dom = document.createElement(inline ? "span" : "div");
        dom.className = inline ? "math-node math-inline" : "math-node math-block";
        dom.contentEditable = "false";

        const mf = document.createElement("math-field") as MathfieldElement;
        mf.mathVirtualKeyboardPolicy = "auto";
        mf.textContent = node.attrs.latex as string;
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "math-edit no-print";
        editButton.setAttribute("aria-label", "تعديل المعادلة — مصدر LaTeX");
        editButton.title = "تحرير مصدر LaTeX";
        editButton.textContent = "ƒ";
        const controls = document.createElement("span");
        controls.className = "math-controls no-print";
        const exitButton = document.createElement("button");
        exitButton.type = "button";
        exitButton.textContent = "اعتماد والعودة إلى النص";
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.textContent = "إلغاء تعديل المعادلة";
        cancelButton.className = "math-cancel";
        controls.append(editButton, exitButton, cancelButton);
        dom.append(mf, controls);
        const updateFormat = () => {
          dom.dataset.latex = current.attrs.latex;
          const { color, size, align } = mathFormat(current.attrs);
          dom.style.setProperty("--math-color", color ?? "");
          dom.style.setProperty("--math-size", size ? `${size}pt` : "");
          if (!inline) dom.style.textAlign = align ?? "";
        };
        updateFormat();

        const nodePos = () => {
          const p = getPos();
          return typeof p === "number" ? p : null;
        };

        // MathLive owns the draft while this field is being edited. The document
        // changes once on acceptance; cancel restores the committed node value.
        let draftFocus: AbortController | undefined;
        const clearDraftFocus = () => {
          draftFocus?.abort();
          draftFocus = undefined;
        };
        const keepDraft = (target: EventTarget | null) =>
          target instanceof Element && (dom.contains(target) || !!target.closest(".math-tools"));
        const settleDraft = (accept: boolean) => {
          clearDraftFocus();
          const pos = nodePos();
          if (editor.isDestroyed || pos === null || dom.closest("[inert]")) return;
          const latex = current.attrs.latex as string;
          if (mf.value === latex) return;
          if (!accept) {
            mf.value = latex;
            return;
          }
          const { view } = editor;
          view.dispatch(closeHistory(view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, latex: mf.value })));
          view.dispatch(closeHistory(view.state.tr).setMeta("addToHistory", false));
        };

        const openSource = () => {
          if (!editor.isEditable || dom.closest("[inert]")) return;
          settleDraft(true);
          const pos = nodePos();
          if (pos !== null) editor.view.dom.dispatchEvent(new CustomEvent(EDIT_MATH_EVENT, { detail: { pos } }));
        };
        let focusFrame = 0;
        const returnToText = (before = false, leaveRelation = false, accept = true) => {
          const pos = nodePos();
          if (pos === null || editor.isDestroyed || dom.closest("[inert]")) return false;
          cancelAnimationFrame(focusFrame);
          settleDraft(accept);
          const { view } = editor;
          const doc = view.state.doc;
          const resolved = doc.resolve(pos);
          let boundary = pos + (before ? 0 : current.nodeSize);
          if (leaveRelation && resolved.parent.attrs.solutionRelation) {
            const end = resolved.after();
            const next = doc.nodeAt(end);
            if (next?.type.name === "paragraph" && !next.attrs.solutionRelation) boundary = end + 1;
          }
          const direction = before ? -1 : 1;
          const $boundary = doc.resolve(boundary);
          const selection = TextSelection.findFrom($boundary, direction, true)
            ?? TextSelection.near($boundary, direction);
          // Changing editing surfaces ends the MathLive history group. Otherwise
          // immediately adjacent prose can be undone together with the equation.
          view.dispatch(closeHistory(view.state.tr.setSelection(selection).setMeta("addToHistory", false)).scrollIntoView());
          textHandoff.set(editor, mf);
          view.focus();
          return true;
        };
        const listeners = new AbortController();
        const options = { signal: listeners.signal };
        const capture = { ...options, capture: true };
        let arrowTimer: ReturnType<typeof setTimeout> | undefined;
        controls.addEventListener("mousedown", ev => ev.preventDefault(), options);
        mf.addEventListener("pointerdown", () => {
          if (!editor.isEditable || dom.closest("[inert]")) return;
          if (document.activeElement === mf) textHandoff.delete(editor);
          else focusMathfield(editor, mf);
        }, capture);
        mf.addEventListener("focusin", event => {
          if (textHandoff.get(editor) !== mf || event.relatedTarget !== editor.view.dom) return;
          // Undo can move the text selection while the same handoff is active.
          // Keep that current selection if MathLive tries to reclaim focus.
          const state = editor.view.state;
          queueMicrotask(() => {
            if (editor.isDestroyed || textHandoff.get(editor) !== mf || document.activeElement !== mf ||
              state.doc !== editor.state.doc || !state.selection.eq(editor.state.selection)) return;
            editor.view.focus();
          });
        }, capture);
        const focusOtherSide = (backward: boolean) => {
          if (!dom.parentElement?.hasAttribute("data-solution-relation")) return false;
          let sibling = backward ? dom.previousElementSibling : dom.nextElementSibling;
          if (sibling?.classList.contains("ProseMirror-separator"))
            sibling = backward ? sibling.previousElementSibling : sibling.nextElementSibling;
          const other = sibling?.matches(".math-inline") && sibling.querySelector<MathfieldElement>("math-field");
          if (!other) return false;
          settleDraft(true);
          other.position = backward ? other.lastOffset : 0;
          focusMathfield(editor, other);
          return true;
        };
        const beforeInlineMath = (key: string) => {
          const rtl = inline && dom.parentElement && getComputedStyle(dom.parentElement).direction === "rtl";
          return (key === "ArrowLeft") !== !!rtl;
        };
        let horizontalArrow: string | undefined;
        editButton.addEventListener("click", openSource, options);
        exitButton.addEventListener("click", () => returnToText(false, true), options);
        cancelButton.addEventListener("click", () => returnToText(false, true, false), options);
        mf.addEventListener(RETURN_TO_TEXT, () => returnToText(false, true), options);
        mf.addEventListener("keydown", ev => {
          horizontalArrow = !ev.shiftKey && (ev.key === "ArrowLeft" || ev.key === "ArrowRight") ? ev.key : undefined;
          clearTimeout(arrowTimer);
          if (horizontalArrow) arrowTimer = setTimeout(() => { horizontalArrow = undefined; }, 0);
          if (ev.isComposing) return;
          if (horizontalArrow && !ev.altKey && !ev.ctrlKey && !ev.metaKey && mf.selectionIsCollapsed &&
            mf.position === (horizontalArrow === "ArrowLeft" ? 0 : mf.lastOffset)) {
            const before = beforeInlineMath(horizontalArrow);
            if (focusOtherSide(before) || returnToText(before)) {
              ev.preventDefault();
              ev.stopImmediatePropagation();
              return;
            }
          }
          if (ev.key === "Tab" && !ev.altKey && !ev.ctrlKey && !ev.metaKey &&
            mf.position === (ev.shiftKey ? 0 : mf.lastOffset) && focusOtherSide(ev.shiftKey)) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
          } else if (ev.key === "Escape" && returnToText(false, true)) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
          } else if (ev.altKey && ev.key === "Enter") {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            openSource();
          }
        }, capture);

        mf.addEventListener("input", () => {
          if (draftFocus || mf.value === current.attrs.latex) return;
          draftFocus = new AbortController();
          document.addEventListener("focusin", event => {
            if (!keepDraft(event.target)) settleDraft(true);
          }, { signal: draftFocus.signal });
        }, options);
        mf.addEventListener("focusout", event => {
          if (draftFocus && event.relatedTarget && !keepDraft(event.relatedTarget)) settleDraft(true);
        }, options);

        mf.addEventListener("keydown", ev => {
          if ((ev.key !== "Backspace" && ev.key !== "Delete") || ev.isComposing ||
            current.attrs.latex !== "" || mf.value !== "") return;
          const pos = nodePos();
          if (pos === null) return;
          ev.preventDefault();
          editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run();
        }, options);

        // عند الخروج من الحقل بالأسهم يعود المؤشر إلى النص قبل المعادلة أو بعدها.
        mf.addEventListener("move-out", ev => {
          const dir = (ev as CustomEvent<{ direction?: string }>).detail?.direction;
          if (!dir) return;
          const before = horizontalArrow
            ? beforeInlineMath(horizontalArrow)
            : dir === "backward" || dir === "upward";
          if (((dir === "forward" || dir === "backward") && focusOtherSide(before)) ||
            returnToText(before)) ev.preventDefault();
        }, options);

        if (focusNext.delete(editor)) {
          focusFrame = requestAnimationFrame(() => {
            if (!dom.isConnected || !editor.view.hasFocus() || dom.closest("[inert]")) return;
            focusMathfield(editor, mf);
            if (current.attrs.latex.includes("\\placeholder")) {
              mf.position = 0;
              mf.executeCommand("moveToNextPlaceholder");
            }
          });
        }

        return {
          dom,
          update: updated => {
            if (updated.type !== current.type) return false;
            const changed = updated.attrs.latex !== current.attrs.latex;
            current = updated;
            updateFormat();
            if (changed) {
              clearDraftFocus();
              if (mf.value !== updated.attrs.latex) mf.value = updated.attrs.latex;
            }
            return true;
          },
          stopEvent: () => true,
          ignoreMutation: () => true,
          destroy: () => {
            if (textHandoff.get(editor) === mf) textHandoff.delete(editor);
            clearDraftFocus();
            listeners.abort();
            cancelAnimationFrame(focusFrame);
            clearTimeout(arrowTimer);
          }
        };
      };
    }
  });
}

export const MathInline = createMathNode("mathInline");
export const MathBlock = createMathNode("mathBlock");
