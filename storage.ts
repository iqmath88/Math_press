import type { MathPressDocument } from "./types";
import { parseDocument } from "./document";

const DB_NAME = "mathpress-local";
const STORE = "documents";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("تعذر فتح التخزين المحلي"));
  });
}

export async function saveDocument(doc: MathPressDocument): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ ...doc, updatedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("تعذر حفظ المستند"));
      tx.onabort = () => reject(tx.error ?? new Error("تم إلغاء الحفظ"));
    });
  } finally {
    db.close();
  }
}

/** يحمّل المستندات المحفوظة ويرقّي مستندات النسخة 1 تلقائيًا (دون الكتابة فوقها حتى تُعدَّل). */
export async function loadDocuments(): Promise<MathPressDocument[]> {
  const db = await openDb();
  try {
    const raw = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error);
    });
    return raw
      .map(parseDocument)
      .filter((d): d is MathPressDocument => d !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    db.close();
  }
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("تعذر حذف المستند"));
    });
  } finally {
    db.close();
  }
}
