import { publishingBoxFields } from "./document";
import type { JSONContent } from "@tiptap/core";

const types = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const vectorTags = new Set("svg g path rect circle ellipse line polyline polygon text tspan title desc".split(" "));
const vectorAttrs = new Set("xmlns viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points transform fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray opacity font-size font-family font-weight text-anchor dominant-baseline".split(" "));
const ns = "http://www.w3.org/2000/svg";
export const assetReference = /^mathpress-asset:[\da-f-]{36}$/i;

export function sanitizeVector(text: string) {
  const document = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = document.documentElement;
  if (root.localName !== "svg" || root.namespaceURI !== ns || document.doctype || document.querySelector("parsererror"))
    throw new Error("ملف SVG غير صالح.");
  for (const element of [root, ...root.querySelectorAll("*")]) {
    if (!vectorTags.has(element.localName) || element.namespaceURI !== ns) {
      element.remove();
      continue;
    }
    for (const attr of [...element.attributes]) {
      if (!vectorAttrs.has(attr.name) || /url\s*\(|javascript:|data:|https?:/i.test(attr.value) && attr.name !== "xmlns")
        element.removeAttributeNode(attr);
    }
  }
  return new XMLSerializer().serializeToString(root);
}

function openAssets() {
  return new Promise<IDBDatabase>((resolve,reject) => {
    const request = indexedDB.open("mathpress-assets",1);
    request.onupgradeneeded = () => { request.result.createObjectStore("images"); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeImage(file: Blob) {
  const name = file instanceof File ? file.name : "";
  const extension = name.split(".").pop()?.toLowerCase();
  const inferred = extension === "jpg" || extension === "jpeg" ? "image/jpeg"
    : extension === "svg" ? "image/svg+xml" : extension ? `image/${extension}` : "";
  const type = file.type && file.type !== "application/octet-stream" ? file.type : inferred;
  if (!types.has(type) || file.size > 20 * 1024 * 1024) throw new Error("اختر صورة PNG أو JPEG أو WebP أو SVG بحجم لا يزيد على 20 ميغابايت.");
  const original = type === "image/svg+xml" ? new Blob([sanitizeVector(await file.text())],{type})
    : file instanceof File ? new Blob([await file.arrayBuffer()],{type}) : file.slice(0,file.size,type);
  const url = URL.createObjectURL(original);
  try {
    await new Promise<void>((resolve,reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("تعذر قراءة الصورة."));
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
  const record = {type, bytes: await original.arrayBuffer()};
  const id = "mathpress-asset:" + crypto.randomUUID();
  const db = await openAssets();
  try {
    await new Promise<void>((resolve,reject) => {
      const tx = db.transaction("images","readwrite");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.objectStore("images").put(record,id);
    });
  } finally { db.close(); }
  return id;
}

export async function readImage(id: string) {
  const db = await openAssets();
  try {
    return await new Promise<Blob>((resolve,reject) => {
      const req = db.transaction("images").objectStore("images").get(id);
      req.onsuccess = () => {
        const value = req.result;
        if (value instanceof Blob) resolve(value);
        else if (value?.bytes instanceof ArrayBuffer && types.has(value.type)) resolve(new Blob([value.bytes],{type:value.type}));
        else reject(new Error("أصل الصورة غير موجود في التخزين المحلي."));
      };
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

function dataUrl(blob: Blob) {
  return new Promise<string>((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function portableImages(node: JSONContent, cache = new Map<string,Promise<string>>()): Promise<JSONContent> {
  let attrs = node.attrs;
  if (node.type === "image" && typeof attrs?.src === "string" && assetReference.test(attrs.src)) {
    const id = attrs.src;
    if (!cache.has(id)) cache.set(id,readImage(id).then(dataUrl));
    attrs = {...attrs,src:await cache.get(id)!};
  }
  if ((node.type === "image" || node.type === "educationBlock") && attrs) {
    attrs = {...attrs};
    for (const key of node.type === "image" ? ["widthMm","rotation","opacity","border","align","crop","caption"] : publishingBoxFields) {
      if (attrs[key] == null) delete attrs[key];
    }
  }
  return {...node,...(attrs ? {attrs} : {}),...(node.content ? {content:await Promise.all(node.content.map(child => portableImages(child,cache)))} : {})};
}

export async function localizeImages(node: JSONContent): Promise<JSONContent> {
  let attrs = node.attrs;
  if (node.type === "image" && typeof attrs?.src === "string" && assetReference.test(attrs.src)) {
    throw new Error("النسخة الاحتياطية تشير إلى أصل محلي غير مضمن. احتُفظ بالمستند المفتوح.");
  }
  if (node.type === "image" && typeof attrs?.src === "string" && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/i.test(attrs.src)) {
    attrs = {...attrs,src:await storeImage(await (await fetch(attrs.src)).blob())};
  }
  return {...node,...(attrs ? {attrs} : {}),...(node.content ? {content:await Promise.all(node.content.map(localizeImages))} : {})};
}
