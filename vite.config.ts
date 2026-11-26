import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Plugin } from "vite";
const pwaFiles = ["manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url));
const copyPwaFiles = (): Plugin => ({
  name: "mathpress-pwa", enforce: "post",
  generateBundle: {
    order: "post",
    handler(_, bundle) {
      for (const f of pwaFiles) this.emitFile({type:"asset",fileName:f,source:read(f)});
      const assets = [...new Set(["index.html", ...Object.keys(bundle), ...pwaFiles])].filter(f=> !f.endsWith(".map") && f!=="sw.js").sort();
      const hash = createHash("sha256");
      for (const name of Object.keys(bundle).sort()) {
        const entry = bundle[name]; hash.update(name); hash.update(entry.type === "chunk" ? entry.code : entry.source);
      }
      for (const f of pwaFiles) hash.update(read(f));
      hash.update(read("sw.js"));
      const worker = read("sw.js").toString().replace('"__BUILD_ID__"', JSON.stringify(hash.digest("hex").slice(0,16))).replace('/*__PRECACHE__*/[]',JSON.stringify(assets));
      this.emitFile({type:"asset",fileName:"sw.js",source:worker});
    }
  },
  configureServer(server) {
    server.middlewares.use((req,res,next)=>{
      const name=(req.url??"").split("?")[0].split("/").pop()??"";
      if(!pwaFiles.includes(name)) return next();
      res.setHeader("Content-Type",name.endsWith(".png")?"image/png":"application/manifest+json"); res.end(read(name));
    });
  }
});
export default defineConfig({
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(JSON.parse(read("package.json").toString()).version) },
  base: "./", publicDir:false, resolve:{extensions:[".mjs",".ts",".tsx",".js",".jsx",".json"]}, plugins:[react(),copyPwaFiles()],
  server:{host:"0.0.0.0"}, build:{target:"es2022",chunkSizeWarningLimit:1500},
  test:{include:["*.test.{ts,tsx,js}"], maxWorkers: 2, testTimeout: 15_000, hookTimeout: 25_000}
});
