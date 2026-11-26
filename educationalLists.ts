import { Extension, type Editor, type JSONContent } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";

export const relations = ["=", "≈", "<", ">", "≤", "≥"];
const listKinds = ["solution", "exam", "branches", "subbranches", "choices"];
const numbering = ["decimal", "arabic", "none"];
const validMarks = (value: unknown) => typeof value === "string" && /^\d{1,3}(\.\d{1,2})?$/.test(value);

function attribute(name: string, valid: (value: unknown) => boolean) {
  const key = `data-${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
  return {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const value = element.getAttribute(key);
      return valid(value) ? value : null;
    },
    renderHTML: (attrs: Record<string, unknown>) => valid(attrs[name]) ? { [key]: attrs[name] } : {}
  };
}

export const EducationalLists = Extension.create({
  name: "educationalLists",
  addGlobalAttributes() {
    return [
      { types: ["orderedList"], attributes: {
        educationalList: attribute("educationalList", value => listKinds.includes(String(value))),
        listNumbering: attribute("listNumbering", value => numbering.includes(String(value)))
      }},
      { types: ["listItem"], attributes: { points: attribute("points", validMarks) }},
      { types: ["paragraph"], attributes: {
        solutionRelation: attribute("solutionRelation", value => relations.includes(String(value)))
      }}
    ];
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { selection } = this.editor.state;
        if (!selection.empty || !educationalItem(this.editor, "solution") ||
          selection.$from.parentOffset !== selection.$from.parent.content.size) return false;
        return insertEducationalItem(this.editor, "solution");
      }
    };
  }
});

export const educationalParagraph = (style: string, text?: string): JSONContent => ({
  type: "paragraph",
  attrs: { educationalStyle: style },
  ...(text ? { content: [{ type: "text", text }] } : {})
});

const item = (kind: string): JSONContent => ({
  type: "listItem",
  content: [educationalParagraph(kind === "solution" ? "solution" : kind === "exam" ? "question" : "normal")]
});

export const educationalList = (kind: string, count = 1): JSONContent => ({
  type: "orderedList", attrs: { dir: "rtl", educationalList: kind },
  content: Array.from({ length: count }, () => item(kind))
});

export function educationalItem(editor: Editor, kind?: string) {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth >= 2; depth--) {
    const current = $from.node(depth);
    const list = $from.node(depth - 1);
    if (current.type.name === "listItem" && list.attrs.educationalList &&
      (!kind || list.attrs.educationalList === kind)) {
      return { current, list, index: $from.index(depth - 1), position: $from.before(depth),
        listPosition: $from.before(depth - 1) };
    }
  }
  return null;
}

export function insertEducationalItem(editor: Editor, kind?: string) {
  const context = educationalItem(editor, kind);
  if (!context) return false;
  const { tr, schema } = editor.state;
  const at = context.position + context.current.nodeSize;
  tr.insert(at, schema.nodeFromJSON(item(context.list.attrs.educationalList)));
  tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
  editor.view.dispatch(closeHistory(tr).scrollIntoView());
  editor.commands.focus();
  return true;
}

export function changeEducationalItem(editor: Editor, action: "up" | "down" | "delete") {
  const context = educationalItem(editor);
  if (!context) return;
  const { current, list, index, position, listPosition } = context;
  const { tr } = editor.state;
  if (action === "delete") {
    if (list.childCount === 1) tr.delete(listPosition, listPosition + list.nodeSize);
    else tr.delete(position, position + current.nodeSize);
  } else {
    const other = list.maybeChild(index + (action === "up" ? -1 : 1));
    if (!other) return;
    const start = action === "up" ? position - other.nodeSize : position;
    const content = action === "up" ? [current, other] : [other, current];
    tr.replaceWith(start, start + current.nodeSize + other.nodeSize, Fragment.fromArray(content));
    const moved = start + (action === "up" ? 0 : other.nodeSize);
    tr.setSelection(TextSelection.near(tr.doc.resolve(moved + editor.state.selection.from - position)));
  }
  editor.view.dispatch(closeHistory(tr).scrollIntoView());
  editor.commands.focus();
}

export function insertSolutionRelation(editor: Editor, relation: string) {
  const context = educationalItem(editor, "solution");
  if (!context || !relations.includes(relation)) return;
  const { selection, tr, schema } = editor.state;
  if (selection.$from.parent.attrs.solutionRelation) {
    tr.setNodeAttribute(selection.$from.before(), "solutionRelation", relation);
  } else {
    const field = { type: "mathInline", attrs: { latex: "" } };
    const row = schema.nodeFromJSON({
      type: "paragraph", attrs: { solutionRelation: relation },
      content: [field, field]
    });
    const at = context.position + 1 + context.current.content.size;
    tr.insert(at, row);
    tr.setSelection(TextSelection.create(tr.doc, at + 1));
  }
  editor.view.dispatch(closeHistory(tr).scrollIntoView());
  editor.commands.focus();
}
