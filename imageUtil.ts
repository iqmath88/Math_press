/** يقرأ صورة كـ data URL ويصغّرها إن كانت أكبر من الحد لتخفيف حجم المستند. */
export async function fileToDataUrl(file: File, maxDim = 1600): Promise<string> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("تعذر قراءة الصورة"));
    reader.readAsDataURL(file);
  });
  if (file.type === "image/svg+xml" || file.type === "image/gif") return original;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("ملف الصورة غير صالح"));
    image.src = original;
  });
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && file.size < 600_000) return original;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return original;
  ctx.fillStyle = "#fff";
  if (file.type !== "image/png") ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return file.type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.9);
}

/** يصغّر صورة data URL إلى بعد أقصى (للخلفيات الكبيرة)، ويُبقي الأصل إن تعذّر الأمر. */
export async function scaleDataUrl(src: string, maxDim = 2000): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("bad image"));
      image.src = src;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1) return src;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL(src.startsWith("data:image/png") ? "image/png" : "image/jpeg", 0.9);
    return out.length < src.length ? out : src;
  } catch {
    return src;
  }
}
