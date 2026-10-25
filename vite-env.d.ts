/// <reference types="vite/client" />

// حزمة jsxgraph تعرّف أنواعها كنطاق عام لا كوحدة، فنصرّح بالوحدة هنا.
declare module "jsxgraph" {
  const JXG: any;
  export default JXG;
}
