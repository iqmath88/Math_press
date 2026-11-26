import type { Editor, JSONContent } from "@tiptap/core";
import { useState } from "react";
import { type EducationalStyle } from "./educationalStyles";
import { changeEducationalItem, educationalItem, educationalList, insertEducationalItem, insertSolutionRelation, relations, restartEducationalNumbering } from "./educationalLists";

const templates = {
  question: { label: "سؤال مع مساحة للحل", blocks: [["question", "اكتب السؤال", "question"], ["solution", "الحل"], ["solution", ""], ["solution", ""]] },
  example: { label: "مثال محلول", blocks: [["example", "اكتب نص المثال", "example"], ["solution", "الحل"]] },
  definition: { label: "تعريف", blocks: [["definition", "التعريف"]] },
  rule: { label: "قاعدة رياضية", blocks: [["rule", "القاعدة الرياضية"]] },
  note: { label: "ملاحظة تعليمية", blocks: [["note", "الملاحظة"]] },
  theorem: { label: "نظرية", blocks: [["theorem", "اكتب نص النظرية"]] },
  warning: { label: "تنبيه", blocks: [["warning", "اكتب نص التنبيه"]] },
  homework: { label: "واجب", blocks: [["homework", "اكتب نص الواجب"]] },
  formula: { label: "صندوق قانون", blocks: [["theorem", "القانون"]] },
  exercise: { label: "تمرين", blocks: [["exercise", "اكتب نص التمرين", "exercise"]] },
  choice: { label: "اختيار من متعدد", blocks: [["question", "اختر الإجابة الصحيحة", "question"], ["normal", "أ. …"], ["normal", "ب. …"], ["normal", "ج. …"], ["normal", "د. …"]] }
} as const;

export default function EducationalInsert({ editor, styles, numberStart, onNumberStart }: {
  editor: Editor; styles: EducationalStyle[]; numberStart: number; onNumberStart: (value: number) => void;
}) {
  const [start, setStart] = useState(String(numberStart));
  const initial = Number(start);
  const valid = Number.isInteger(initial) && initial >= 1 && initial <= 9999;
  const templateBlocks = (styleId: string, text?: string, sequence?: string): JSONContent[] => {
    const style = styles.find(candidate => candidate.id === styleId);
    const title = style?.templateTitle;
    const body: JSONContent = {
      type: "paragraph",
      attrs: { educationalStyle: styleId, educationalSequence: title ? null : sequence ?? null },
      ...(text ? { content: [{ type: "text", text }] } : {})
    };
    if (!title) return [body];
    return [{
      type: "paragraph",
      attrs: {
        educationalStyle: styleId, templateHeading: true,
        educationalSequence: style.templateNumbered ? sequence ?? "template" : null
      },
      content: [{ type: "text", text: title }]
    }, body];
  };
  const insert = (id: keyof typeof templates) => {
    const blocks = templates[id].blocks.flatMap(([style, text, sequence]) => templateBlocks(style, text, sequence));
    editor.chain().focus().insertContent(blocks).run();
  };
  const context = educationalItem(editor);
  const solution = educationalItem(editor, "solution");
  const insertList = (kind: string, count = 1) => {
    const list = educationalList(kind, count);
    if (context && ["branches", "subbranches", "choices"].includes(kind)) {
      const at = context.position + 1 + context.current.content.size;
      editor.chain().focus().insertContentAt(at, list).run();
      return;
    }
    if (kind === "exam" && educationalItem(editor, "exam")) {
      insertEducationalItem(editor, "exam");
      return;
    }
    editor.chain().focus().insertContent(list).run();
  };
  const setList = (name: string, value: string | number | null) => {
    if (!context) return;
    editor.view.dispatch(editor.state.tr.setNodeAttribute(context.listPosition, name, value));
    editor.commands.focus();
  };
  return (
    <section className="rb-group" aria-label="الإدراج التعليمي">
      <div className="rb-line">
        <select aria-label="إدراج قالب تعليمي" value=""
          onChange={e => {
            const value = e.target.value;
            if (value.startsWith("style:")) {
              editor.chain().focus().insertContent(templateBlocks(value.slice(6))).run();
            } else if (Object.hasOwn(templates, value)) insert(value as keyof typeof templates);
          }}>
          <option value="" disabled>إدراج قالب…</option>
          {Object.entries(templates).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
          <optgroup label="أنماط محفوظة">
            {styles.filter(style => style.id.startsWith("custom-")).map(style =>
              <option key={style.id} value={`style:${style.id}`}>{style.name}</option>)}
          </optgroup>
        </select>
        <button type="button" onClick={() => insertList("solution")}>خطوات الحل</button>
        <button type="button" onClick={() => insertList("exam")}>سؤال امتحاني</button>
        {context && <>
          <button type="button" onClick={() => insertEducationalItem(editor)}>إضافة بند</button>
          <button type="button" onClick={() => changeEducationalItem(editor, "up")}>نقل لأعلى</button>
          <button type="button" onClick={() => changeEducationalItem(editor, "down")}>نقل لأسفل</button>
          <button type="button" onClick={() => changeEducationalItem(editor, "delete")}>حذف البند</button>
          <select aria-label="نمط ترقيم القائمة" value={context.list.attrs.listNumbering ?? ""}
            onChange={e => setList("listNumbering", e.target.value || null)}>
            <option value="">تلقائي</option><option value="decimal">رقمي</option>
            <option value="arabic">أ، ب، ج</option><option value="none">بدون ترقيم</option>
          </select>
        </>}
        {solution && <>
          <button type="button" onClick={() => {
            const next = educationalList("solution");
            next.attrs = { ...next.attrs, listNumbering: solution.list.attrs.listNumbering, start: solution.list.attrs.start };
            editor.chain().focus().insertContentAt(solution.listPosition + solution.list.nodeSize, next).run();
          }}>حل جديد بالتنسيق نفسه</button>
          <select aria-label="محاذاة علاقة رياضية" value=""
          onChange={e => insertSolutionRelation(editor, e.target.value)}>
          <option value="" disabled>محاذاة العلاقة…</option>
          {relations.map(relation => <option key={relation}>{relation}</option>)}
          </select>
        </>}
        {context && !solution && <>
          <button type="button" onClick={() => insertList(context.list.attrs.educationalList === "exam" ? "branches" : "subbranches", 3)}>إضافة فروع</button>
          <button type="button" onClick={() => insertList("choices", 4)}>خيارات متعددة</button>
          <label>الدرجة <input key={context.position} aria-label="درجة البند" className="numbering-start"
            type="number" min="0" max="999" step="0.01" defaultValue={context.current.attrs.points ?? ""}
            onBlur={e => {
              if (e.target.validity.valid && editor.state.doc.nodeAt(context.position) === context.current)
                editor.view.dispatch(editor.state.tr.setNodeAttribute(context.position, "points", e.target.value || null));
            }} /></label>
          <button type="button" onClick={() => restartEducationalNumbering(editor)}>استئناف الترقيم من ١</button>
        </>}
        <label>رقم البداية <input className="numbering-start" type="number" min={1} max={9999}
          value={start} onChange={e => setStart(e.target.value)} /></label>
        <button type="button" disabled={!valid} onClick={() => context ? setList("start", initial) : onNumberStart(initial)}>إعادة الترقيم</button>
      </div>
    </section>
  );
}
