import { Extension } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { Fragment } from "@tiptap/pm/model";
import { Plugin, TextSelection, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { validateLatex } from "mathlive";

const MAX_FORMULA_LENGTH = 2048;
const NON_TEXT = "\uFFFC";

type Match = { from: number; to: number; latex: string; block: boolean };

function completeLatex(latex: string) {
  let braces = 0;
  for (let index = 0; index < latex.length; index++) {
    const char = latex[index];
    if (char === "\\") index++;
    else if (char === "{") braces++;
    else if (char === "}" && --braces < 0) return false;
  }
  return braces === 0 && validateLatex(latex).length === 0;
}

export function delimitedMath(text: string): Match[] {
  const matches: Match[] = [];
  let opening: { at: number; width: number } | undefined;
  for (let at = 0; at < text.length; at++) {
    if (text[at] === NON_TEXT || text[at] === "\n") {
      opening = undefined;
      continue;
    }
    if (text[at] !== "$") continue;
    let slash = at;
    while (slash > 0 && text[slash - 1] === "\\") slash--;
    if ((at - slash) % 2) continue;
    let end = at + 1;
    while (text[end] === "$") end++;
    const width = end - at;
    if (width > 2) opening = undefined;
    else if (opening?.width === width) {
      const latex = text.slice(opening.at + width, at);
      // Amounts and prose between two unrelated dollar signs stay literal.
      const currency = /^[\s\p{Nd}\p{Sc}.,٫٬]+$/u.test(latex) ||
        /^\s*\p{Nd}[\p{Nd}.,٫٬]*\s+[\p{L}\s,.]+$/u.test(latex);
      if (latex.trim() && latex.length <= MAX_FORMULA_LENGTH && !currency && completeLatex(latex)) {
        matches.push({ from: opening.at, to: end, latex: latex.trim(), block: width === 2 });
        opening = undefined;
      } else opening = { at, width };
    } else opening = { at, width };
    at = end - 1;
  }
  return matches;
}

function convert(tr: Transaction, match: Match) {
  const { from, to, latex, block } = match;
  const $from = tr.doc.resolve(from);
  const $to = tr.doc.resolve(to);
  const parent = $from.parent;
  if (!$from.sameParent($to) || !parent.isTextblock || parent.type.spec.code) return;
  const content = parent.content.cut($from.parentOffset, $to.parentOffset);
  let code = false;
  content.forEach(node => { code ||= node.marks.some(mark => mark.type.spec.code); });
  if (code) return;
  if (!block) {
    const node = tr.doc.type.schema.nodes.mathInline.create({ latex });
    tr.replaceWith(from, to, node);
    return from + node.nodeSize;
  }
  if (parent.type.name !== "paragraph") return;
  const container = $from.node($from.depth - 1);
  const index = $from.index($from.depth - 1);
  const math = tr.doc.type.schema.nodes.mathBlock.create({ latex });
  const before = parent.content.cut(0, $from.parentOffset);
  const after = parent.content.cut($to.parentOffset);
  const nodes = before.size ? [parent.copy(before), math, parent.copy(after)] : [math, parent.copy(after)];
  const replacement = Fragment.fromArray(nodes);
  if (!container.canReplace(index, index + 1, replacement)) return;
  const start = $from.before();
  tr.replaceWith(start, $from.after(), replacement);
  return start + (before.size ? before.size + 2 : 0) + math.nodeSize + 1;
}

function finish(view: EditorView, input: Transaction, matches: Match[], caret?: number) {
  if (!matches.length) return false;
  const previous = view.state;
  const raw = previous.apply(input);
  const trial = raw.tr;
  let target: number | undefined;
  // Working backwards leaves each earlier prefix at its original positions, even when splitting a paragraph.
  for (const match of matches.sort((a, b) => b.from - a.from)) {
    const next = convert(trial, match);
    if (caret !== undefined && match.to === caret) target = next;
  }
  if (!trial.docChanged) return false;

  view.dispatch(input);
  const transformation = closeHistory(view.state.tr);
  for (const step of trial.steps) transformation.step(step);
  const pos = target ?? trial.mapping.map(raw.selection.head);
  transformation.setSelection(TextSelection.near(transformation.doc.resolve(pos), 1));
  if (caret !== undefined) transformation.setStoredMarks(raw.storedMarks ?? raw.selection.$head.marks());
  view.dispatch(transformation.scrollIntoView());
  view.dispatch(closeHistory(view.state.tr).setMeta("addToHistory", false));
  return true;
}

export const SmartMathInput = Extension.create<{ enabled: () => boolean }>({
  name: "smartMathInput",
  addOptions: () => ({ enabled: () => true }),
  addProseMirrorPlugins() {
    const enabled = this.options.enabled;
    return [new Plugin({
      props: {
        handleTextInput(view, from, to, text, defaultInput) {
          if (!enabled() || view.composing || !text.endsWith("$")) return false;
          const $from = view.state.doc.resolve(from);
          if (!$from.parent.isTextblock || $from.parent.type.spec.code ||
            !$from.sameParent(view.state.doc.resolve(to))) return false;
          const start = Math.max(0, $from.parentOffset - MAX_FORMULA_LENGTH - 4);
          const prefix = $from.parent.textBetween(start, $from.parentOffset, "", NON_TEXT);
          const match = delimitedMath(prefix + text).at(-1);
          if (!match || match.to !== prefix.length + text.length) return false;
          const base = from - prefix.length;
          const input = defaultInput();
          if (input.getMeta("composition") != null) return false;
          return finish(view, input, [{ ...match, from: base + match.from, to: base + match.to }], base + match.to);
        },
        handlePaste(view, event, slice) {
          if (!enabled() || view.composing || event.clipboardData?.files.length ||
            !event.clipboardData?.getData("text/plain").includes("$")) return false;
          const input = view.state.tr.replaceSelection(slice).setMeta("paste", true).setMeta("uiEvent", "paste");
          const ranges: { from: number; to: number }[] = [];
          input.mapping.maps.forEach(map => map.forEach((_from, _to, from, to) => {
            if (from < to) ranges.push({ from, to });
          }));
          const matches: Match[] = [];
          for (const range of ranges) {
            input.doc.nodesBetween(range.from, range.to, (node, pos) => {
              if (!node.isTextblock) return;
              if (node.type.spec.code) return false;
              const base = Math.max(pos + 1, range.from);
              const end = Math.min(pos + node.nodeSize - 1, range.to);
              if (end > base) matches.push(...delimitedMath(node.textBetween(base - pos - 1, end - pos - 1, "", NON_TEXT))
                .map(match => ({ ...match, from: base + match.from, to: base + match.to })));
              return false;
            });
          }
          return finish(view, input, matches);
        }
      }
    })];
  }
});
