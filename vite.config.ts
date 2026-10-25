import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// بنية مسطحة: لا يوجد مجلد public، لذلك تُنسخ ملفات PWA من الجذر إلى ناتج البناء.
const pwaFiles = ["sw.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
const mime = (name: string) =>
  name.endsWith(".js") ? "text/javascript" : name.endsWith(".png") ? "image/png" : "application/manifest+json";

const copyPwaFiles = () => ({
  name: "copy-pwa-files",
  generateBundle(this: any) {
    for (const f of pwaFiles) {
      this.emitFile({ type: "asset", fileName: f, source: readFileSync(new URL(`./${f}`, import.meta.url)) });
    }
  },
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      const name = (req.url ?? "").split("?")[0].slice(1);
      if (pwaFiles.includes(name)) {
        res.setHeader("Content-Type", mime(name));
        res.end(readFileSync(new URL(`./${name}`, import.meta.url)));
      } else next();
    });
  }
});

export default defineConfig({
  publicDir: false,
  plugins: [react(), copyPwaFiles()],
  server: { host: "0.0.0.0" },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  test: { include: ["*.test.{ts,tsx}"] }
});
