import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Document from "@tiptap/extension-document";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { MathBlock, MathInline } from "./MathNodes";
import { Pagination } from "./Pagination";
import { GraphNode } from "./GraphNode";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    direction: { setDirection: (dir: "rtl" | "ltr") => ReturnType };
    fontSize: { setFontSize: (size: string) => ReturnType; unsetFontSize: () => ReturnType };
    pageBreak: { insertPageBreak: () => ReturnType };
    columns: { insertColumns: () => ReturnType; deleteColumns: () => ReturnType };
  }
}

/** اتجاه الكتلة (RTL/LTR) لكل فقرة أو عنوان أو قائمة. */
const Direction = Extension.create({
  name: "direction",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading", "bulletList", "orderedList", "blockquote"],
      attributes: {
        dir: {
          default: null,
          parseHTML: el => el.getAttribute("dir"),
          renderHTML: attrs => (attrs.dir ? { dir: attrs.dir as string } : {})
        }
      }
    }];
  },
  addCommands() {
    return {
      setDirection: dir => ({ chain }) =>
        chain()
          .updateAttributes("paragraph", { dir })
          .updateAttributes("heading", { dir })
          .updateAttributes("bulletList", { dir })
          .updateAttributes("orderedList", { dir })
          .updateAttributes("blockquote", { dir })
          .run()
    };
  }
});

/** حجم الخط بوحدة النقطة (pt). */
const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: el => (el as HTMLElement).style.fontSize?.replace("pt", "") || null,
          renderHTML: attrs => (attrs.fontSize ? { style: `font-size:${attrs.fontSize}pt` } : {})
        }
      }
    }];
  },
  addCommands() {
    return {
      setFontSize: size => ({ chain }) => chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run()
    };
  }
});

/** صورة بعرض قابل للتحكم (نسبة مئوية). */
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: el => (el as HTMLElement).style.width || null,
        renderHTML: attrs => (attrs.width ? { style: `width:${attrs.width}` } : {})
      }
    };
  }
});

/** فاصل صفحة يدوي. */
const PageBreak = Node.create({
  name: "pageBreak",
  group: "layoutBlock",
  atom: true,
  selectable: true,
  draggable: true,
  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-page-break": "", class: "page-break-marker" }), ["span", "فاصل صفحة"]];
  },
  addCommands() {
    return { insertPageBreak: () => ({ commands }) => commands.insertContent({ type: "pageBreak" }) };
  }
});

/** المستند يقبل كتل المحتوى وكتل التخطيط (عمودان، فاصل صفحة) في المستوى الأعلى فقط. */
const LayoutDocument = Document.extend({ content: "(block|layoutBlock)+" });

/** عمود واحد داخل كتلة الأعمدة. */
const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,
  defining: true,
  parseHTML() {
    return [{ tag: "div[data-column]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-column": "", class: "col" }), 0];
  }
});

/** كتلة بعمودين متجاورين (مناسبة لأوراق العمل: مسائل قصيرة متشابهة). لا تُقسَّم بين صفحتين. */
const Columns = Node.create({
  name: "columns",
  group: "layoutBlock",
  content: "column column",
  isolating: true,
  defining: true,
  parseHTML() {
    return [{ tag: "div[data-columns]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-columns": "", class: "columns-block" }), 0];
  },
  addCommands() {
    const emptyColumn = { type: "column", content: [{ type: "paragraph" }] };
    return {
      insertColumns: () => ({ commands }) =>
        commands.insertContent({ type: "columns", content: [emptyColumn, emptyColumn] }),
      deleteColumns: () => ({ state, tr, dispatch }) => {
        const { $from } = state.selection;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === "columns") {
            if (dispatch) dispatch(tr.delete($from.before(d), $from.after(d)));
            return true;
          }
        }
        return false;
      }
    };
  }
});

/** يضمن وجود فقرة بعد آخر كتلة غير نصية (معادلة، صورة، جدول...) ليتمكن المستخدم من متابعة الكتابة. */
const TRAP_TYPES = ["mathBlock", "image", "pageBreak", "horizontalRule", "table", "graph", "columns"];
const TrailingParagraph = Extension.create({
  name: "trailingParagraph",
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey("mathpress-trailing-paragraph"),
      appendTransaction: (_trs, _old, state) => {
        const last = state.doc.lastChild;
        if (!last || !TRAP_TYPES.includes(last.type.name)) return null;
        return state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create());
      }
    })];
  }
});

export function buildExtensions() {
  return [
    StarterKit.configure({ document: false, heading: { levels: [1, 2, 3] }, codeBlock: false }),
    LayoutDocument,
    Underline,
    Subscript,
    Superscript,
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Direction,
    ResizableImage.configure({ inline: false, allowBase64: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder: "ابدأ الكتابة هنا…" }),
    MathInline,
    MathBlock,
    GraphNode,
    Columns,
    Column,
    PageBreak,
    TrailingParagraph,
    // extend() ينشئ نسخة جديدة؛ فيملك كل محرر تخزينه الخاص (إعدادات الصفحة وعدد الصفحات) ولا تتسرب بين المستندات.
    Pagination.extend({})
  ];
}
