// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Editor } from "@tiptap/core";
import { buildExtensions } from "./extensions";
import Toolbar from "./Toolbar";
import { DEFAULT_PAGE } from "./document";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let ed: Editor | null = null;
afterEach(() => { act(() => root?.unmount()); ed?.destroy(); root = null; ed = null; document.body.innerHTML = ""; });

function mount() {
  const host = document.createElement("div"); document.body.appendChild(host);
  const holder = document.createElement("div"); document.body.appendChild(holder);
  ed = new Editor({ element: holder, extensions: buildExtensions(), content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "نص" }] }] } });
  const actions = { onNew: vi.fn(), onLibrary: vi.fn(), onExport: vi.fn(), onOpenFile: vi.fn(), onOpenWord: vi.fn(), onPrint: vi.fn(), onPageSettings: vi.fn(), onQuickPage: vi.fn() };
  root = createRoot(host);
  act(() => root!.render(<Toolbar editor={ed as any} page={DEFAULT_PAGE} actions={actions} onOpenLatex={() => {}} onGraph={() => {}} onError={() => {}} />));
  return { host, actions };
}
const tabs = (h: HTMLElement) => [...h.querySelectorAll('[role="tab"]')].map(t => t.textContent);
const click = (el: Element | null | undefined) => act(() => { (el as HTMLElement).click(); });
const byLabel = (h: HTMLElement, label: string) => h.querySelector(`[aria-label="${label}"]`);

describe("ribbon", () => {
  it("shows four tabs, with home selected and grouped sections", () => {
    const { host } = mount();
    expect(tabs(host)).toEqual(["ملف", "الرئيسية", "إدراج", "الصفحة"]);
    expect(host.querySelectorAll(".rb-group").length).toBeGreaterThanOrEqual(4);
    expect(byLabel(host, "غامق")).not.toBeNull();
    expect(byLabel(host, "معادلة داخل السطر")).toBeNull(); // في تبويب الإدراج فقط
  });

  it("switches tabs and runs file/page actions", () => {
    const { host, actions } = mount();
    click([...host.querySelectorAll('[role="tab"]')][2]);
    expect(byLabel(host, "معادلة داخل السطر")).not.toBeNull();
    expect(byLabel(host, "غامق")).toBeNull();
    click([...host.querySelectorAll('[role="tab"]')][0]);
    click(byLabel(host, "مستند جديد"));
    expect(actions.onNew).toHaveBeenCalled();
    click([...host.querySelectorAll('[role="tab"]')][3]);
    click(byLabel(host, "ورقة أفقية"));
    expect(actions.onQuickPage).toHaveBeenCalledWith({ orientation: "landscape" });
    click(byLabel(host, "طباعة / PDF"));
    expect(actions.onPrint).toHaveBeenCalled();
  });

  it("adds a contextual tab when a table is selected and removes it afterwards", () => {
    const { host } = mount();
    act(() => { ed!.chain().focus("end").insertTable({ rows: 2, cols: 2 }).run(); });
    expect(tabs(host)).toContain("الجدول");
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("الجدول");
    expect(byLabel(host, "إضافة صف بعد")).not.toBeNull();
    act(() => { ed!.commands.setTextSelection(1); });
    expect(tabs(host)).not.toContain("الجدول");
  });

  it("offers Word import in the file tab", () => {
    const { host } = mount();
    click([...host.querySelectorAll('[role="tab"]')][0]);
    expect(host.querySelector('input[type="file"][accept*=".docx"]')).not.toBeNull();
    expect(byLabel(host, "استيراد ملف Word (.docx) بمعادلاته")).not.toBeNull();
  });

  it("collapses and expands the panel", () => {
    const { host } = mount();
    click(byLabel(host, "إخفاء الأدوات"));
    expect(host.querySelector(".rb-panel")).toBeNull();
    click(byLabel(host, "إظهار الأدوات"));
    expect(host.querySelector(".rb-panel")).not.toBeNull();
  });
});
