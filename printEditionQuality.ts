export const PRINT_RESOLUTIONS = [150, 216, 300, 450, 600];
export const DEFAULT_PRINT_DPI = 300;

export function pagePixels(widthMm: number, heightMm: number, dpi: number) {
  return {
    width: Math.round(widthMm * dpi / 25.4),
    height: Math.round(heightMm * dpi / 25.4),
  };
}

export function canvasPixelLimit(device: Pick<Navigator, "userAgent" | "maxTouchPoints"> & { deviceMemory?: number }) {
  const appleTablet = /iPad|iPhone|iPod/.test(device.userAgent) ||
    (/Macintosh/.test(device.userAgent) && device.maxTouchPoints > 1);
  if (device.deviceMemory && device.deviceMemory <= 2) return 4_000_000;
  if (device.deviceMemory && device.deviceMemory <= 4) return 8_000_000;
  return appleTablet ? 16_000_000 : 40_000_000;
}

export function printTileEdge(width: number, height: number, dpi: number, limit: number) {
  if (dpi <= 300 && width * height <= Math.min(limit, 9_000_000)) return Math.max(width, height);
  if (limit <= 4_000_000) return 512;
  return limit <= 16_000_000 ? 1024 : 2048;
}

export function* printTiles(width: number, height: number, edge: number) {
  const bleed = 8;
  for (let top = 0; top < height; top += edge) {
    for (let left = 0; left < width; left += edge) {
      const right = Math.min(width, left + edge);
      const bottom = Math.min(height, top + edge);
      const x = Math.max(0, left - bleed);
      const y = Math.max(0, top - bleed);
      yield {
        left, top, right, bottom, x, y,
        width: Math.min(width, right + bleed) - x,
        height: Math.min(height, bottom + bleed) - y,
      };
    }
  }
}
