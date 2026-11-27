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
        educationalList: attribute("educationalList", value => typeof value === "string" && listKinds.includes(value)),
        listNumbering: attribute("listNumbering", value => typeof value === "string" && numbering.includes(value))
      }},
      { types: ["listItem"], attributes: { points: attribute("points", validMarks) }},
      { types: ["paragraph"], attributes: {
        solutionRelation: attribute("solutionRelation", value => typeof value === "string" && relations.includes(value))
      }}
    ];
  },
  addKeyboardShortcuts() {
    return {
      "Alt-ArrowDown": () => moveBetweenExamItems(this.editor, 1),
      "Alt-ArrowUp": () => moveBetweenExamItems(this.editor, -1),
      Enter: () => {
        const { selection } = this.editor.state;
        const step = educationalItem(this.editor, "solution");
        if (!selection.empty || !step ||
          selection.$from.parentOffset !== selection.$from.parent.content.size) return false;
        if (step.current.childCount === 1 && !step.current.firstChild?.content.size)
          return this.editor.commands.liftListItem("listItem");
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

export function createExamOutline(questions: number, branches: number): JSONContent {
  const exam = educationalList("exam", questions);
  if (branches > 0) for (const question of exam.content ?? [])
    question.content?.push(educationalList("branches", branches));
  return exam;
}

function moveBetweenExamItems(editor: Editor, direction: -1 | 1) {
  const exam = educationalItem(editor, "exam");
  const current = educationalItem(editor);
  if (!exam || !current) return false;
  const positions: number[] = [];
  exam.list.descendants((node, offset) => {
    if (node.type.name === "listItem") positions.push(exam.listPosition + 1 + offset);
  });
  const target = positions[positions.indexOf(current.position) + direction];
  return target === undefined ? false : editor.commands.setTextSelection(target + 2) &&
    editor.commands.scrollIntoView();
}

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

export function restartEducationalNumbering(editor: Editor) {
  const context = educationalItem(editor);
  if (!context) return;
  const { list, listPosition, position, index } = context;
  const { tr, selection } = editor.state;
  if (index === 0) {
    tr.setNodeAttribute(listPosition, "start", 1);
  } else {
    const boundary = position - listPosition - 1;
    const before = list.copy(list.content.cut(0, boundary));
    const after = list.type.create({ ...list.attrs, start: 1 }, list.content.cut(boundary));
    tr.replaceWith(listPosition, listPosition + list.nodeSize, [before, after]);
    tr.setSelection(TextSelection.near(tr.doc.resolve(selection.from + 2)));
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
    const explanation = schema.nodeFromJSON(educationalParagraph("solution"));
    tr.insert(at, [row, explanation]);
    tr.setSelection(TextSelection.create(tr.doc, at + 1));
  }
  editor.view.dispatch(closeHistory(tr).scrollIntoView());
  editor.commands.focus();
}
