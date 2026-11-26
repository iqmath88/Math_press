import type { Editor, JSONContent } from "@tiptap/core";
import { useState } from "react";

const templates = {
  question: { label: "سؤال مع مساحة للحل", blocks: [["question", "اكتب السؤال", "question"], ["solution", "الحل"], ["solution", ""], ["solution", ""]] },
  example: { label: "مثال محلول", blocks: [["example", "اكتب نص المثال", "example"], ["solution", "الحل"]] },
  definition: { label: "تعريف", blocks: [["definition", "التعريف"]] },
  rule: { label: "قاعدة رياضية", blocks: [["rule", "القاعدة الرياضية"]] },
  note: { label: "ملاحظة تعليمية", blocks: [["note", "الملاحظة"]] },
  formula: { label: "صندوق قانون", blocks: [["theorem", "القانون"]] },
  exercise: { label: "تمرين", blocks: [["exercise", "اكتب نص التمرين", "exercise"]] },
  choice: { label: "اختيار من متعدد", blocks: [["question", "اختر الإجابة الصحيحة", "question"], ["normal", "أ. …"], ["normal", "ب. …"], ["normal", "ج. …"], ["normal", "د. …"]] }
} as const;

export default function EducationalInsert({ editor, numberStart, onNumberStart }: {
  editor: Editor; numberStart: number; onNumberStart: (value: number) => void;
}) {
  const [start, setStart] = useState(String(numberStart));
  const initial = Number(start);
  const valid = Number.isInteger(initial) && initial >= 1 && initial <= 9999;
  const insert = (id: keyof typeof templates) => {
    const blocks: JSONContent[] = templates[id].blocks.map(([style, text, sequence]) => ({
      type: "paragraph",
      attrs: { educationalStyle: style, educationalSequence: sequence ?? null },
      ...(text ? { content: [{ type: "text", text }] } : {})
    }));
    editor.chain().focus().insertContent(blocks).run();
  };
  const startSolution = () => {
    editor.chain().focus().insertContent({
      type: "orderedList",
      attrs: { dir: "rtl" },
      content: [{
        type: "listItem",
        content: [{ type: "paragraph", attrs: { educationalStyle: "solution" } }]
      }]
    }).run();
  };
  return (
    <section className="rb-group" aria-label="الإدراج التعليمي">
      <div className="rb-line">
        <select aria-label="إدراج قالب تعليمي" value=""
          onChange={e => insert(e.target.value as keyof typeof templates)}>
          <option value="" disabled>إدراج قالب…</option>
          {Object.entries(templates).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button type="button" onClick={startSolution}>خطوات الحل</button>
        <label>رقم البداية <input className="numbering-start" type="number" min={1} max={9999}
          value={start} onChange={e => setStart(e.target.value)} /></label>
        <button type="button" disabled={!valid} onClick={() => onNumberStart(initial)}>إعادة الترقيم</button>
      </div>
    </section>
  );
}
