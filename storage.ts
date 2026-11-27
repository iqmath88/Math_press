import type { MathPressDocument } from "./types";
import { parseDocument, protectEducationalDocument } from "./document";

const DB_NAME = "mathpress-local";
const STORE = "documents";
const checkedForMigration = new Set<string>();
const protectedIds = new Set<string>();
const BACKUP_FORMAT = "mathpress-migration-backup";
const backupKey = (id: string) => `\u0000mathpress-backup:${id}`;

type MigrationBackup = { id: string; format: typeof BACKUP_FORMAT; documentId: string; original: unknown };
function isMigrationBackup(value: unknown): value is MigrationBackup {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<MigrationBackup>;
  return entry.format === BACKUP_FORMAT && typeof entry.documentId === "string" && "original" in entry;
}

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
  const protectedDoc = protectedIds.has(doc.id) ? { ...doc, schemaVersion: 4 } : protectEducationalDocument(doc);
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const write = () => store.put({ ...protectedDoc, updatedAt: new Date().toISOString() });
      if (checkedForMigration.has(doc.id) && (protectedDoc.schemaVersion === doc.schemaVersion || protectedIds.has(doc.id))) write();
      else {
        const existing = store.get(doc.id);
        existing.onsuccess = () => {
          const previous = existing.result;
          if (previous?.format === "mathpress" && (previous.schemaVersion === 1 || previous.schemaVersion === 2)) {
            const backup: MigrationBackup = {
              id: backupKey(doc.id), format: BACKUP_FORMAT, documentId: doc.id, original: previous
            };
            // Back up and replace atomically so a quota failure leaves the original intact.
            store.put(backup);
          } else if (previous?.format === "mathpress" && previous.schemaVersion === 3 &&
            protectedDoc.schemaVersion === 4 && protectEducationalDocument(previous).schemaVersion === 4) {
            const prior = store.get(backupKey(doc.id));
            prior.onsuccess = () => {
              if (!prior.result) store.put({ id: backupKey(doc.id), format: BACKUP_FORMAT, documentId: doc.id, original: previous });
            };
          }
          write();
        };
      }
      tx.oncomplete = () => {
        checkedForMigration.add(doc.id);
        if (protectedDoc.schemaVersion === 4) protectedIds.add(doc.id);
        resolve();
      };
      tx.onerror = () => reject(tx.error ?? new Error("تعذر حفظ المستند"));
      tx.onabort = () => reject(tx.error ?? new Error("تم إلغاء الحفظ"));
    });
  } finally {
    db.close();
  }
}

/** يقرأ المستندات والنسخ قبل الترقية دون تعديل السجلات أثناء القراءة. */
export async function loadLibrary(): Promise<{ documents: MathPressDocument[]; backups: Map<string, unknown> }> {
  const db = await openDb();
  try {
    const raw = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error);
    });
    const backups = new Map<string, unknown>();
    const documents: MathPressDocument[] = [];
    for (const record of raw) {
      if (isMigrationBackup(record)) {
        backups.set(record.documentId, record.original);
      } else {
        const document = parseDocument(record);
        if (document) documents.push(document);
      }
    }
    documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { documents, backups };
  } finally {
    db.close();
  }
}

export async function loadDocuments(): Promise<MathPressDocument[]> {
  return (await loadLibrary()).documents;
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.delete(id);
      store.delete(backupKey(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("تعذر حذف المستند"));
    });
  } finally {
    db.close();
  }
}
