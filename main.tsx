import React from "react";
import { createRoot } from "react-dom/client";
import { MathfieldElement } from "mathlive";
import "mathlive/fonts.css";
import "mathlive/static.css";
import "@fontsource/amiri/arabic-400.css";
import "@fontsource/amiri/arabic-700.css";
import "@fontsource/amiri/latin-400.css";
import "@fontsource/amiri/latin-700.css";
import "@fontsource/noto-naskh-arabic/arabic-400.css";
import "@fontsource/noto-naskh-arabic/arabic-700.css";
import "@fontsource/noto-naskh-arabic/latin-400.css";
import "@fontsource/noto-naskh-arabic/latin-700.css";
import "@fontsource/cairo/arabic-400.css";
import "@fontsource/cairo/arabic-700.css";
import "@fontsource/cairo/latin-400.css";
import "@fontsource/cairo/latin-700.css";
import "./styles.css";
import App from "./App";
import { loadJXG } from "./graph";
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    const worker = new URL(import.meta.env.BASE_URL + "sw.js", document.baseURI);
    navigator.serviceWorker.register(worker, {updateViaCache:"none"}).then(reg=>reg.update()).catch(console.error);
    setTimeout(() => { void loadJXG().catch(() => undefined); }, 4000);
  });
}
