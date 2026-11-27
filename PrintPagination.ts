import type { MathfieldElement } from "mathlive";

type Boundary = { node: Node; offset: number };

function paragraphBoundaries(paragraph: HTMLElement, offsets?: number[]): Boundary[] {
  const boundaries: Boundary[] = [{ node: paragraph, offset: 0 }];
  const advance = (length: number) => {
    if (offsets) offsets.push(offsets[offsets.length - 1] + length);
  };
  const visit = (parent: Node) => {
    parent.childNodes.forEach((child, index) => {
      if (child instanceof Text) {
        let offset = 0;
        for (const character of child.data) {
          offset += character.length;
          boundaries.push({ node: child, offset });
          if (offsets) advance(character.length);
        }
      } else if (child instanceof HTMLElement && !child.matches("br, [contenteditable=false], img")) {
        visit(child);
      } else {
        boundaries.push({ node: parent, offset: index + 1 });
        if (offsets) advance(1);
      }
    });
  };
  visit(paragraph);
  boundaries[boundaries.length - 1] = { node: paragraph, offset: paragraph.childNodes.length };
  return boundaries;
}

// Range rectangles track wrapped lines, including lines with different font sizes.
function hasTwoLines(paragraph: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  const css = getComputedStyle(paragraph);
  const lineHeight = parseFloat(css.lineHeight) || parseFloat(css.fontSize) * 1.2;
  let top = Infinity;
  let bottom = -Infinity;
  for (const rect of range.getClientRects()) {
    if (!rect.height || !rect.width) continue;
    const middle = (rect.top + rect.bottom) / 2;
    top = Math.min(top, middle);
    bottom = Math.max(bottom, middle);
    if (bottom - top >= lineHeight * 0.65) return true;
  }
  return false;
}

function isolateGraphIds(clone: HTMLElement) {
  for (const svg of clone.querySelectorAll(".graph-box svg")) {
    const prefix = `print-${crypto.randomUUID()}-`;
    const ids = new Map<string, string>();
    for (const element of [svg, ...svg.querySelectorAll("[id]")]) {
      if (!element.id) continue;
      ids.set(element.id, prefix + element.id);
      element.id = prefix + element.id;
    }
    for (const element of [svg, ...svg.querySelectorAll("*")]) {
      for (const attribute of element.attributes) {
        const value = attribute.value.replace(/url\(#([^)]*)\)/g, (reference, id) =>
          ids.has(id) ? `url(#${ids.get(id)})` : reference);
        const id = attribute.localName === "href" && value.startsWith("#") ? ids.get(value.slice(1)) : undefined;
        attribute.value = id ? `#${id}` : value;
      }
    }
  }
}

function printableClone(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  const originalFields = source.querySelectorAll<MathfieldElement>("math-field");
  clone.querySelectorAll("math-field").forEach((field, index) => {
    field.textContent = originalFields[index].value;
    field.setAttribute("read-only", "");
  });
  clone.querySelectorAll(".no-print, .ProseMirror-separator").forEach(node => node.remove());
  return clone;
}

export function paginateForPrint(
  source: HTMLElement, target: HTMLElement,
  { headerText, footerText, selectedBlock, selectedOffset }: { headerText: string; footerText: string; selectedBlock?: Element | null; selectedOffset?: number }
) {
  const sheets: HTMLElement[] = [];
  let body: HTMLElement;
  let limit = 0;
  let pendingBreak = false;
  let overflow = false;
  const newSheet = () => {
    const sheet = document.createElement("section");
    sheet.className = "print-sheet";
    // Measurements on this sheet must not invalidate layout inside every previous sheet.
    sheet.style.contain = "layout";
    const header = document.createElement("header");
    header.className = "paper-header";
    header.textContent = headerText;
    body = document.createElement("div");
    body.className = "print-sheet-content";
    sheet.append(header, body);
    target.append(sheet);
    sheets.push(sheet);
    limit = body.getBoundingClientRect().bottom;
  };
  const fits = (block: HTMLElement) =>
    block.getBoundingClientRect().bottom <= limit + 0.01;
  const place = (block: HTMLElement) => {
    body.append(block);
    if (fits(block)) return;
    if (body.childElementCount > 1) {
      newSheet();
      body.append(block);
    }
    if (!fits(block)) {
      // Keep indivisible content visible even when it exceeds the printable area.
      body.closest(".print-sheet")?.classList.add("print-sheet-overflow");
      overflow = true;
    }
  };

  const placeParagraph = (paragraph: HTMLElement) => {
    body.append(paragraph);
    if (fits(paragraph)) return;
    const css = getComputedStyle(paragraph);
    const protectLines = Number(css.widows) >= 2 || Number(css.orphans) >= 2;
    if (css.breakInside === "avoid" && body.childElementCount > 1 &&
      paragraph.getBoundingClientRect().height <= body.getBoundingClientRect().height + 0.01) {
      newSheet();
      body.append(paragraph);
      return;
    }
    paragraph.remove();
    const offsets = selectedOffset !== undefined && paragraph.hasAttribute("data-studio-print-anchor") ? [0] : undefined;
    const boundaries = paragraphBoundaries(paragraph, offsets);
    if (boundaries.length < 3) {
      place(paragraph);
      return;
    }
    const range = document.createRange();
    for (let start = 0, last = boundaries.length - 1; start < last;) {
      const fragment = paragraph.cloneNode(false) as HTMLElement;
      if (start) fragment.removeAttribute("data-educational-sequence");
      if (offsets) fragment.removeAttribute("data-studio-print-anchor");
      body.append(fragment);
      const show = (from: number, end: number) => {
        range.setStart(boundaries[from].node, boundaries[from].offset);
        range.setEnd(boundaries[end].node, boundaries[end].offset);
        let contents: Node = range.cloneContents();
        let ancestor = range.commonAncestorContainer;
        if (ancestor instanceof Text) ancestor = ancestor.parentNode!;
        while (ancestor !== paragraph) {
          const wrapper = ancestor.cloneNode(false);
          wrapper.appendChild(contents);
          contents = wrapper;
          ancestor = ancestor.parentNode!;
        }
        fragment.replaceChildren(contents);
      };
      const probe = (end: number) => {
        show(start, end);
        return fits(fragment);
      };
      // Most continuations fit on the next sheet. Skip repeated prefix probes
      // for modest remainders, while bounding work for very long paragraphs.
      const mark = (end: number) => {
        if (offsets && selectedOffset !== undefined && selectedOffset >= offsets[start] &&
          (selectedOffset < offsets[end] || end === last)) fragment.setAttribute("data-studio-print-anchor", "");
      };
      if (start > 0 && last - start <= 4096 && probe(last)) {
        mark(last);
        break;
      }
      let low = start;
      let high = Math.min(last, start + 128);
      while (probe(high)) {
        low = high;
        if (high === last) break;
        high = Math.min(last, start + (high - start) * 2);
      }
      if (low === last) {
        mark(last);
        break;
      }
      while (high - low > 1) {
        const middle = (low + high) >>> 1;
        if (probe(middle)) low = middle;
        else high = middle;
      }
      if (low === start) {
        fragment.remove();
        if (body.childElementCount) {
          newSheet();
          continue;
        }
        // An inline atom can be larger than a whole page.
        probe(start + 1);
        mark(start + 1);
        place(fragment);
        start++;
      } else {
        if (protectLines) {
          const continuationHasTwoLines = (from: number) => {
            for (let count = 128;; count *= 2) {
              const end = Math.min(last, from + count);
              show(from, end);
              if (hasTwoLines(fragment)) return true;
              if (end === last) return false;
            }
          };
          if (!continuationHasTwoLines(low)) {
            // Find room for at least two lines on the continuation.
            let left = start;
            let right = low;
            while (right - left > 1) {
              const middle = (left + right) >>> 1;
              if (continuationHasTwoLines(middle)) left = middle;
              else right = middle;
            }
            if (left > start) low = left;
          }
        }
        // Prefer a word boundary so the two pieces join naturally when read.
        let end = low;
        const wordLimit = Math.max(start + 1, low - 24);
        while (end > wordLimit) {
          const boundary = boundaries[end];
          if (boundary.node instanceof Text && /\s/u.test(boundary.node.data[boundary.offset - 1])) break;
          end--;
        }
        if (end === wordLimit) end = low;
        probe(end);
        if (protectLines && body.childElementCount > 1 && !hasTwoLines(fragment)) {
          fragment.remove();
          newSheet();
          continue;
        }
        mark(end);
        start = end;
      }
      if (start < last) newSheet();
    }
  };

  const placeTable = (table: HTMLTableElement) => {
    const rows = [...table.rows];
    const headerCount = rows.findIndex(row => !row.cells.length || [...row.cells].some(cell => cell.tagName !== "TH"));
    const headerRows = headerCount > 0 ? rows.slice(0, headerCount) : [];
    const headers = headerRows.some((row, index) =>
      [...row.cells].some(cell => !cell.rowSpan || index + cell.rowSpan > headerCount)
    ) ? [] : headerRows;
    let fragment: HTMLTableElement;
    let rowBody: HTMLTableSectionElement;
    const startTable = () => {
      fragment = table.cloneNode(false) as HTMLTableElement;
      table.querySelectorAll(":scope > colgroup").forEach(cols => fragment.append(cols.cloneNode(true)));
      if (headers.length) fragment.createTHead().append(...headers.map(row => row.cloneNode(true)));
      rowBody = fragment.createTBody();
      body.append(fragment);
    };
    startTable();
    for (let i = headers.length; i < rows.length;) {
      // A rowspan and all rows it touches belong to the same fragment.
      let end = i + 1;
      for (let row = i; row < end; row++) {
        for (const cell of rows[row].cells) {
          end = Math.max(end, Math.min(rows.length, row + (cell.rowSpan || rows.length)));
        }
      }
      const group = rows.slice(i, end);
      rowBody!.append(...group);
      if (!fits(fragment!)) {
        const previousRows = rowBody!.rows.length > group.length;
        if (previousRows || body.childElementCount > 1) {
          group.forEach(row => row.remove());
          if (!previousRows) fragment!.remove();
          newSheet();
          startTable();
          rowBody!.append(...group);
        }
        if (!fits(fragment!)) place(fragment!);
      }
      i = end;
    }
  };

  const placeList = (list: HTMLOListElement | HTMLUListElement) => {
    let fragment = list.cloneNode(false) as HTMLElement;
    body.append(fragment);
    for (const [index, item] of [...list.children].entries()) {
      fragment.append(item);
      if (fits(fragment)) continue;
      const hasPreviousItems = fragment.childElementCount > 1;
      if (hasPreviousItems || body.childElementCount > 1) {
        if (!hasPreviousItems) fragment.remove();
        newSheet();
        fragment = list.cloneNode(false) as HTMLElement;
        if (fragment instanceof HTMLOListElement && list instanceof HTMLOListElement)
          fragment.start = list.start + index;
        fragment.append(item);
      }
      if (list instanceof HTMLOListElement && list.dataset.educationalList &&
        item instanceof HTMLLIElement && item.childElementCount > 1 && !fits(fragment)) {
        const groups = [...item.children].flatMap((child, index) => {
          // Keep the question prompt and the first branch together when they fit.
          if (index === 1 && child instanceof HTMLOListElement && child.dataset.educationalList && child.children.length) {
            return [...child.children].map((branch, branchIndex) => {
              const nested = child.cloneNode(false) as HTMLOListElement;
              nested.start = child.start + branchIndex;
              nested.append(branch);
              return nested;
            });
          }
          return [child];
        });
        item.replaceChildren();
        let current = item;
        for (const group of groups) {
          current.append(group);
          if (fits(fragment)) continue;
          if (current.childElementCount === 1) {
            place(fragment);
            continue;
          }
          newSheet();
          fragment = list.cloneNode(false) as HTMLOListElement;
          (fragment as HTMLOListElement).start = list.start + index;
          current = item.cloneNode(false) as HTMLLIElement;
          current.removeAttribute("data-points");
          current.classList.add("educational-continuation");
          current.append(group);
          fragment.append(current);
          body.append(fragment);
          if (!fits(fragment)) place(fragment);
        }
        if (!fits(fragment)) place(fragment);
      } else {
        place(fragment);
      }
    }
  };

  target.replaceChildren();
  newSheet();
  const blocks = [...source.children].filter((child): child is HTMLElement =>
    child instanceof HTMLElement && !child.matches(".pg-break, .ProseMirror-gapcursor"));
  for (const [index, child] of blocks.entries()) {
    if (child.matches(".page-break-marker")) {
      pendingBreak = !!body!.childElementCount;
      continue;
    }
    if (index > 0 && index === blocks.length - 1 && child.tagName === "P"
      && child.matches(":has(> .ProseMirror-trailingBreak:only-child)") && !child.textContent?.trim()) continue;
    const placement = child.matches("[data-educational-style], [data-paragraph-format]") ? getComputedStyle(child) : null;
    if (body!.childElementCount && (pendingBreak || placement?.getPropertyValue("--break-before").trim() === "1")) newSheet();
    pendingBreak = false;
    const block = printableClone(child);
    if (selectedBlock && child.contains(selectedBlock)) {
      const indexes: number[] = [];
      for (let node = selectedBlock; node !== child; node = node.parentElement!)
        indexes.unshift([...node.parentElement!.children].filter(sibling => !sibling.matches(".no-print, .ProseMirror-separator")).indexOf(node));
      // The clone drops editor-only nodes. Mark the matching content element when present.
      let anchor: Element = block;
      for (const index of indexes) {
        const next: Element | undefined = [...anchor.children].filter(node => !node.matches(".no-print, .ProseMirror-separator"))[index];
        if (!next) break;
        anchor = next;
      }
      anchor.setAttribute("data-studio-print-anchor", "");
    }
    const next = blocks[index + 1];
    if (body!.childElementCount && placement?.getPropertyValue("--keep-with-next").trim() === "1"
      && next && !next.matches(".page-break-marker")) {
      const zoom = body!.getBoundingClientRect().height / body!.offsetHeight || 1;
      const needed = child.getBoundingClientRect().height + next.getBoundingClientRect().height;
      if (needed <= body!.clientHeight * zoom && body!.lastElementChild!.getBoundingClientRect().bottom + needed > limit) newSheet();
    }
    if (block.tagName === "P") placeParagraph(block);
    else if (block instanceof HTMLTableElement) placeTable(block);
    else if (block instanceof HTMLOListElement || block instanceof HTMLUListElement) placeList(block);
    else place(block);
  }
  for (const sheet of sheets) {
    sheet.style.removeProperty("contain");
    const footer = document.createElement("footer");
    footer.className = "pg-footer";
    const text = document.createElement("span");
    text.textContent = footerText;
    const num = document.createElement("span");
    num.className = "pg-footer-num";
    footer.append(text, num);
    sheet.append(footer);
  }
  isolateGraphIds(target);
  return { pages: sheets.length, overflow };
}
