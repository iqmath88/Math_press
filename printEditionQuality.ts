export const PRINT_RESOLUTIONS = [150, 216, 300, 450, 600];
export const DEFAULT_PRINT_DPI = 300;

export function pagePixels(widthMm: number, heightMm: number, dpi: number) {
  return {
    width: Math.round(widthMm * dpi / 25.4),
    height: Math.round(heightMm * dpi / 25.4),
  };
}

export function canvasPixelLimit(device: Pick<Navigator, "userAgent" | "maxTouchPoints">) {
  const appleTablet = /iPad|iPhone|iPod/.test(device.userAgent) ||
    (/Macintosh/.test(device.userAgent) && device.maxTouchPoints > 1);
  return appleTablet ? 16_000_000 : 40_000_000;
}
