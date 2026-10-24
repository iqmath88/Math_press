import { Node, mergeAttributes } from "@tiptap/core";
import type { MathfieldElement } from "mathlive";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    math: {
      insertMathInline: (latex?: string, focus?: boolean) => ReturnType;
      insertMathBlock: (latex?: string, focus?: boolean) => ReturnType;
    };
  }
}

// يُضبط قبل الإدراج مباشرة ليأخذ حقل المعادلة الجديد التركيز.
let focusNext = false;

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
        focusNext = focus;
        const ok = commands.insertContent({ type: name, attrs: { latex } });
        if (!ok) focusNext = false;
        return ok;
      };
      return inline
        ? { insertMathInline: (latex = "", focus = true) => insert(latex, focus) }
        : { insertMathBlock: (latex = "", focus = true) => insert(latex, focus) };
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
        dom.appendChild(mf);

        const nodePos = () => {
          const p = getPos();
          return typeof p === "number" ? p : null;
        };

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
          const pos = nodePos();
          if (pos === null || !dir) return;
          const backward = dir === "backward" || dir === "upward";
          ev.preventDefault();
          editor.chain().focus(backward ? pos : pos + current.nodeSize).run();
        });

        if (focusNext) {
          focusNext = false;
          setTimeout(() => mf.focus(), 0);
        }

        return {
          dom,
          update: updated => {
            if (updated.type !== current.type) return false;
            current = updated;
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
