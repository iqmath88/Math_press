import { useEffect, useRef, useState, type RefObject } from "react";

type Bar = { x: number; y: number; width: number; height: number; kind: string };

export default function PageThumbnail({ paper, page, revision }: {
  paper: RefObject<HTMLElement>; page: number; revision: object;
}) {
  const frame = useRef<SVGSVGElement>(null);
  const [visible, setVisible] = useState(false);
  const [bars, setBars] = useState<Bar[]>([]);

  useEffect(() => {
    const node = frame.current;
    if (!node || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: node.closest(".page-navigation")
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => {
      const source = paper.current?.querySelector(".editor-source .mp-editor");
      if (!source) return;
      const marker = page > 1 ? source.querySelector(`[data-editor-page-start="${page}"]`) : null;
      if (page > 1 && !marker) { setBars([]); return; }
      const bounds = source.getBoundingClientRect();
      const start = marker?.getBoundingClientRect().bottom ?? bounds.top;
      const width = Math.max(1, bounds.width);
      const height = width * 1.42;
      const result: Bar[] = [];
      let block = marker?.nextElementSibling ?? source.firstElementChild;
      while (block && !block.matches(".pg-break") && result.length < 24) {
        const rect = block.getBoundingClientRect();
        if (rect.height > 0) result.push({
          x: Math.max(5, (rect.left - bounds.left) * 90 / width), y: 6 + (rect.top - start) * 100 / height,
          width: Math.min(82, rect.width * 82 / width), height: Math.max(1.4, Math.min(14, rect.height * 100 / height)),
          kind: block.matches("table,.tableWrapper,.graph-node,.math-block") ? "figure" : "text"
        });
        block = block.nextElementSibling;
      }
      setBars(result);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [paper, page, revision, visible]);

  return <svg ref={frame} viewBox="0 0 90 105" className="page-thumbnail" data-rendered={visible || undefined} aria-hidden="true">
    {bars.map((bar, index) => <rect key={index} x={bar.x} y={bar.y} width={bar.width}
      height={bar.height} rx={1} className={`thumbnail-${bar.kind}`}/>)}
  </svg>;
}
