import React from "react";
import { createRoot } from "react-dom/client";
import { MathfieldElement } from "mathlive";
import "mathlive/fonts.css";
import "@fontsource/amiri/arabic-400.css";
import "@fontsource/amiri/arabic-700.css";
import "@fontsource/amiri/latin-400.css";
import "@fontsource/amiri/latin-700.css";
import "@fontsource/noto-naskh-arabic/arabic-400.css";
import "@fontsource/noto-naskh-arabic/arabic-700.css";
import "@fontsource/noto-naskh-arabic/latin-400.css";
import "@fontsource/cairo/arabic-400.css";
import "@fontsource/cairo/arabic-700.css";
import "@fontsource/cairo/latin-400.css";
import "@fontsource/cairo/latin-700.css";
import "./styles.css";
import App from "./App";
import { loadJXG } from "./graph";

// الخطوط تُضمَّن عبر Vite (mathlive/fonts.css) بدل التحميل من مسار نسبي غير موجود.
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(console.error);
    // تحميل مكتبة الرسم في الخلفية ليُخزَّن للعمل دون اتصال حتى قبل إدراج أول رسم.
    setTimeout(() => { void loadJXG().catch(() => undefined); }, 4000);
  });
}
