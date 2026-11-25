import { useEffect, useState } from "react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/core";
import { replaceMatches, searchKey, updateSearch } from "./DocumentSearch";

export default function SearchPanel({ editor, close }: { editor: Editor; close: () => void }) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [includeLatex, setIncludeLatex] = useState(false);
  const [search, setSearch] = useState(() => searchKey.getState(editor.state));
  const [index, setIndex] = useState(-1);
  const matches = search?.matches ?? [];
  const canReplace = matches.some(match => !match.latex);
  const active = index >= 0 && index < matches.length ? index : -1;

  useEffect(() => {
    const refresh = () => setSearch(searchKey.getState(editor.state));
    editor.on("transaction", refresh);
    return () => {
      editor.off("transaction", refresh);
      if (!editor.isDestroyed) updateSearch(editor, { query: "", includeLatex: false });
    };
  }, [editor]);

  useEffect(() => {
    setIndex(-1);
    updateSearch(editor, { query, includeLatex });
  }, [editor, query, includeLatex]);

  const move = (step: number) => {
    if (!matches.length) return;
    const next = active === -1 ? (step < 0 ? matches.length - 1 : 0) : (active + step + matches.length) % matches.length;
    const result = matches[next];
    const { doc } = editor.state;
    const selection = result.latex
      ? NodeSelection.create(doc, result.from)
      : TextSelection.create(doc, result.from, result.to);
    editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView());
    setIndex(next);
  };

  return (
    <section className="search-panel no-print" aria-label="بحث واستبدال"
      onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
      <label>بحث <input autoFocus dir="auto" value={query} onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); move(e.shiftKey ? -1 : 1); } }} /></label>
      <button type="button" disabled={!matches.length} onClick={() => move(-1)}>السابق</button>
      <button type="button" disabled={!matches.length} onClick={() => move(1)}>التالي</button>
      <output aria-live="polite">{active >= 0 ? `${active + 1} / ` : ""}{matches.length} نتيجة</output>
      <label className="check"><input type="checkbox" checked={includeLatex} onChange={e => setIncludeLatex(e.target.checked)} /> مصادر LaTeX (بحث فقط)</label>
      <label>استبدال بـ <input dir="auto" value={replacement} onChange={e => setReplacement(e.target.value)} /></label>
      <button type="button" disabled={active < 0 || !!matches[active]?.latex} onClick={() => { replaceMatches(editor, [matches[active]], replacement); setIndex(-1); }}>استبدال</button>
      <button type="button" disabled={!canReplace} onClick={() => { replaceMatches(editor, matches, replacement); setIndex(-1); }}>استبدال الكل</button>
      <button type="button" onClick={close}>إغلاق</button>
    </section>
  );
}
