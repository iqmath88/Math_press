/** منطق تقسيم الصفحات الصرف (بلا DOM) ليسهل اختباره. كل القيم بالبكسل. */
export type PageItem = { height: number; breakAfter?: boolean };
export type PageBreak = { index: number; filler: number };
export type PaginationResult = { breaks: PageBreak[]; pages: number; lastFiller: number };

const EPS = 0.5;

/**
 * items: ارتفاع كل كتلة من المستوى الأعلى بالترتيب.
 * usable: الارتفاع المتاح للمحتوى في الصفحة الواحدة (بعد طرح الهوامش).
 * يعيد مواضع فواصل الصفحات (قبل الكتلة index) ومقدار الفراغ المتبقي في الصفحة المنتهية.
 * الكتلة الأطول من صفحة كاملة لا تُقسَّم: تبدأ في أعلى صفحة وتمتد إلى ما بعدها.
 */
export function computeBreaks(items: PageItem[], usable: number): PaginationResult {
  const breaks: PageBreak[] = [];
  if (!(usable > 0)) return { breaks, pages: 1, lastFiller: 0 };
  let y = 0;
  let pages = 1;
  let forceNext = false;
  for (let i = 0; i < items.length; i++) {
    const h = Math.max(0, items[i].height);
    if (i > 0 && (forceNext || (y > 0 && y + h > usable + EPS))) {
      breaks.push({ index: i, filler: Math.max(0, usable - y) });
      pages++;
      y = 0;
    }
    forceNext = false;
    if (h > usable + EPS) {
      const extra = Math.floor(h / usable);
      pages += extra;
      y = h - extra * usable;
    } else {
      y += h;
    }
    forceNext = !!items[i].breakAfter;
  }
  return { breaks, pages, lastFiller: Math.max(0, usable - y) };
}
