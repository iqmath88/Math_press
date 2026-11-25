import { Extension, type Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type SearchOptions = { query: string; includeLatex: boolean };
export type SearchMatch = { from: number; to: number; latex?: { start: number; end: number } };
type SearchState = SearchOptions & { matches: SearchMatch[]; decorations: DecorationSet };

export const searchKey = new PluginKey<SearchState>("mathpress-search");
const emptySearch: SearchState = {
  query: "", includeLatex: false, matches: [], decorations: DecorationSet.empty
};

export function findDocumentMatches(doc: PMNode, { query, includeLatex }: SearchOptions): SearchMatch[] {
  if (!query) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  const matches: SearchMatch[] = [];

  const find = (text: string, add: (from: number, to: number) => void) => {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) add(match.index, match.index + match[0].length);
  };

  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      let text = "";
      let start = pos + 1;
      const flush = () => {
        find(text, (from, to) => matches.push({ from: start + from, to: start + to }));
        text = "";
      };
      node.forEach((child, offset) => {
        const from = pos + 1 + offset;
        if (child.isText) {
          if (!text) start = from;
          text += child.text ?? "";
          return;
        }
        flush();
        if (includeLatex && child.type.name === "mathInline") {
          find(child.attrs.latex ?? "", (start, end) => {
            matches.push({ from, to: from + child.nodeSize, latex: { start, end } });
          });
        }
      });
      flush();
      return false;
    }
    if (includeLatex && node.type.name === "mathBlock") {
      find(node.attrs.latex ?? "", (start, end) => {
        matches.push({ from: pos, to: pos + node.nodeSize, latex: { start, end } });
      });
    }
  });
  return matches;
}

export const DocumentSearch = Extension.create({
  name: "documentSearch",
  addProseMirrorPlugins() {
    return [new Plugin<SearchState>({
      key: searchKey,
      state: {
        init: () => emptySearch,
        apply(tr, old) {
          const options = tr.getMeta(searchKey) as SearchOptions | undefined;
          if (!options && (!tr.docChanged || !old.query)) return old;
          const search = options ?? old;
          if (!search.query) return emptySearch;
          const matches = findDocumentMatches(tr.doc, search);
          const highlights: Decoration[] = [];
          for (const match of matches) {
            const attrs = { class: "document-search-match" };
            if (match.latex) {
              const previous = highlights[highlights.length - 1];
              if (previous?.from !== match.from || previous.to !== match.to) {
                highlights.push(Decoration.node(match.from, match.to, attrs));
              }
            } else highlights.push(Decoration.inline(match.from, match.to, attrs));
          }
          return { query: search.query, includeLatex: search.includeLatex, matches, decorations: DecorationSet.create(tr.doc, highlights) };
        }
      },
      props: { decorations: state => searchKey.getState(state)?.decorations }
    })];
  }
});

export function updateSearch(editor: Editor, options: SearchOptions) {
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, options).setMeta("addToHistory", false));
}

export function replaceMatches(editor: Editor, matches: readonly SearchMatch[], text: string) {
  if (!matches.length) return;
  const tr = closeHistory(editor.state.tr);
  // LaTeX matches are navigable. Edit their source in the equation editor to validate the whole expression.
  for (const match of [...matches].reverse()) {
    if (!match.latex) tr.insertText(text, match.from, match.to);
  }
  if (tr.docChanged) editor.view.dispatch(tr);
}
