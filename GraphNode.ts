import { Node, mergeAttributes } from "@tiptap/core";
import { mountGraph } from "./graph";
import { graphAspect, sanitizeSpec, type GraphSpec } from "./graphSpec";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    graph: { insertGraph: (spec: GraphSpec) => ReturnType };
  }
}

/** يُرسَل من عقدة الرسم إلى واجهة React لفتح نافذة التعديل. */
export const EDIT_GRAPH_EVENT = "mathpress:edit-graph";
export type EditGraphDetail = { pos: number };

export const GraphNode = Node.create({
  name: "graph",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      spec: {
        default: null,
        parseHTML: el => {
          try { return JSON.parse(el.getAttribute("data-spec") ?? "null"); } catch { return null; }
        },
        renderHTML: attrs => ({ "data-spec": JSON.stringify(attrs.spec ?? null) })
      }
    };
  },

  parseHTML() {
    return [{ tag: "div[data-graph]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-graph": "", class: "graph-node" }), "[رسم بياني]"];
  },

  renderText() {
    return "[رسم بياني]";
  },

  addCommands() {
    return {
      insertGraph: spec => ({ commands }) => commands.insertContent({ type: "graph", attrs: { spec } })
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node;
      const dom = document.createElement("div");
      dom.className = "graph-node";
      dom.contentEditable = "false";

      const box = document.createElement("div");
      box.className = "graph-box";
      const caption = document.createElement("div");
      caption.className = "graph-caption";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "graph-edit no-print";
      edit.textContent = "تعديل الرسم";
      dom.append(box, caption, edit);

      const initial = sanitizeSpec(node.attrs.spec);
      const style = (spec: GraphSpec) => {
        box.style.width = `${spec.widthPct}%`;
        box.style.aspectRatio = String(graphAspect(spec));
        caption.textContent = spec.caption;
        caption.hidden = !spec.caption;
      };
      style(initial);
      const handle = mountGraph(box, initial);

      const requestEdit = () => {
        const pos = getPos();
        if (typeof pos !== "number") return;
        editor.view.dom.dispatchEvent(new CustomEvent<EditGraphDetail>(EDIT_GRAPH_EVENT, { detail: { pos } }));
      };
      edit.addEventListener("click", ev => { ev.preventDefault(); requestEdit(); });
      dom.addEventListener("dblclick", requestEdit);

      return {
        dom,
        update: updated => {
          if (updated.type !== current.type) return false;
          current = updated;
          const spec = sanitizeSpec(updated.attrs.spec);
          style(spec);
          handle.update(spec);
          return true;
        },
        stopEvent: event => event.target === edit,
        ignoreMutation: () => true,
        destroy: () => handle.destroy()
      };
    };
  }
});
