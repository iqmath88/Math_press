import { Node, mergeAttributes, type Editor } from "@tiptap/core";
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
          field.focus();
        };
        // Once MathLive accepts focus, a retry must never reclaim it after Escape or history.
        field.addEventListener("focus", stop, { once: true });
        focusField();
        return true;
      };
      return { ArrowLeft: () => enter(false), ArrowRight: () => enter(true) };
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
        editButton.setAttribute("aria-label", "تعديل المعادلة");
        editButton.textContent = "ƒ";
        const controls = document.createElement("span");
        controls.className = "math-controls no-print";
        const exitButton = document.createElement("button");
        exitButton.type = "button";
        exitButton.textContent = "العودة إلى النص";
        controls.append(editButton, exitButton);
        dom.append(mf, controls);
        const updateFormat = () => {
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

        const openSource = () => {
          if (!editor.isEditable || dom.closest("[inert]")) return;
          const pos = nodePos();
          if (pos !== null) editor.view.dom.dispatchEvent(new CustomEvent(EDIT_MATH_EVENT, { detail: { pos } }));
        };
        const returnToText = (before = false) => {
          const pos = nodePos();
          if (pos === null || editor.isDestroyed || dom.closest("[inert]")) return false;
          const { view } = editor;
          const boundary = pos + (before ? 0 : current.nodeSize);
          const selection = TextSelection.near(view.state.doc.resolve(boundary), before ? -1 : 1);
          view.dispatch(view.state.tr.setSelection(selection).setMeta("addToHistory", false).scrollIntoView());
          view.focus();
          return true;
        };
        controls.addEventListener("mousedown", ev => ev.preventDefault());
        mf.addEventListener("pointerdown", () => {
          if (document.activeElement !== mf && editor.isEditable && !dom.closest("[inert]")) mf.focus();
        }, true);
        let horizontalArrow: string | undefined;
        editButton.addEventListener("click", openSource);
        exitButton.addEventListener("click", () => returnToText());
        mf.addEventListener(RETURN_TO_TEXT, () => returnToText());
        mf.addEventListener("keydown", ev => {
          horizontalArrow = !ev.shiftKey && (ev.key === "ArrowLeft" || ev.key === "ArrowRight") ? ev.key : undefined;
          if (horizontalArrow) setTimeout(() => { horizontalArrow = undefined; }, 0);
          if (ev.isComposing) return;
          if (ev.key === "Escape" && returnToText()) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
          } else if (ev.altKey && ev.key === "Enter") {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            openSource();
          }
        }, true);

        mf.addEventListener("input", () => {
          const pos = nodePos();
          if (pos === null) return;
          const latex = mf.value;
          if (latex === current.attrs.latex) return;
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, latex })
          );
        });

        mf.addEventListener("keydown", ev => {
          const key = (ev as KeyboardEvent).key;
          if ((key === "Backspace" || key === "Delete") && mf.value === "") {
            ev.preventDefault();
            const pos = nodePos();
            if (pos !== null) {
              editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run();
            }
          }
        });

        // عند الخروج من الحقل بالأسهم يعود المؤشر إلى النص قبل المعادلة أو بعدها.
        mf.addEventListener("move-out", ev => {
          const dir = (ev as CustomEvent<{ direction?: string }>).detail?.direction;
          if (!dir) return;
          const rtl = inline && dom.parentElement && getComputedStyle(dom.parentElement).direction === "rtl";
          const before = horizontalArrow
            ? (horizontalArrow === "ArrowLeft") !== !!rtl
            : dir === "backward" || dir === "upward";
          if (returnToText(before)) ev.preventDefault();
        });

        if (focusNext.delete(editor)) {
          requestAnimationFrame(() => {
            if (!dom.isConnected || !editor.view.hasFocus() || dom.closest("[inert]")) return;
            mf.focus();
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
            current = updated;
            updateFormat();
            const latex = updated.attrs.latex as string;
            if (mf.value !== latex) mf.value = latex;
            return true;
          },
          stopEvent: () => true,
          ignoreMutation: () => true
        };
      };
    }
  });
}

export const MathInline = createMathNode("mathInline");
export const MathBlock = createMathNode("mathBlock");
