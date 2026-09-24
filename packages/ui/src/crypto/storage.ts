/**
 * Stores exactly one encrypted blob (the current draft invoice) in
 * IndexedDB. Only ciphertext, salt and iteration count are persisted —
 * never the passphrase or a derived key (see aes.ts). IndexedDB rather than
 * localStorage because the encrypted blob can outgrow localStorage's ~5MB
 * quota once logos/attachments land, and because it's what the PWA's
 * offline story is built on anyway.
 */
import type { EncryptedBlob } from './aes.js';

const DB_NAME = 'conformo';
const DB_VERSION = 1;
const STORE = 'drafts';
const DRAFT_KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDraft(blob: EncryptedBlob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, DRAFT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadDraft(): Promise<EncryptedBlob | undefined> {
  const db = await openDb();
  const result = await new Promise<EncryptedBlob | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(DRAFT_KEY);
    req.onsuccess = () => resolve(req.result as EncryptedBlob | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function clearDraft(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(DRAFT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
