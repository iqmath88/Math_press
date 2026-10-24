import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// بنية مسطحة: لا يوجد مجلد public، لذلك تُنسخ ملفات PWA من الجذر إلى ناتج البناء.
const pwaFiles = ["sw.js", "manifest.webmanifest"];
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
        res.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : "application/manifest+json");
        res.end(readFileSync(new URL(`./${name}`, import.meta.url)));
      } else next();
    });
  }
});

export default defineConfig({
  publicDir: false,
  plugins: [react(), copyPwaFiles()],
  server: { host: "0.0.0.0" },
  build: { target: "es2022" },
  test: { include: ["*.test.ts"] }
});
