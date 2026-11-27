import type { JSONContent } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";

function countWords(node: Node) {
  return node.textBetween(0, node.content.size, " ").match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)?.length ?? 0;
}

/** ProseMirror retains the same immutable node for each unchanged top-level block. */
export function createEditorSnapshot() {
  const blocks = new WeakMap<Node, { json: JSONContent; words: number }>();
  let previous: Node | undefined;
  let snapshot: { content: JSONContent; words: number };

  return (doc: Node) => {
    if (doc === previous) return snapshot;
    const content: JSONContent[] = [];
    let words = 0;
    doc.forEach(block => {
      let entry = blocks.get(block);
      if (!entry) {
        entry = { json: block.toJSON(), words: countWords(block) };
        blocks.set(block, entry);
      }
      content.push(entry.json);
      words += entry.words;
    });
    const json: JSONContent = { type: doc.type.name };
    if (Object.keys(doc.attrs).length) json.attrs = doc.attrs;
    if (content.length) json.content = content;
    if (doc.marks.length) json.marks = doc.marks.map(mark => mark.toJSON());
    snapshot = { content: json, words };
    previous = doc;
    return snapshot;
  };
}
