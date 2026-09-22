/**
 * The counter backing `LocalNumberingProvider`. A separate IndexedDB
 * database from crypto/storage.ts's encrypted draft on purpose: the counter
 * isn't sensitive (it's just "how many invoices has this series issued"),
 * so it doesn't need a passphrase, and keeping it in its own database means
 * its schema can never collide with the draft store's version upgrades.
 *
 * Atomicity is what makes numbering "gapless" rather than just "usually
 * sequential": the read-increment-write below happens inside ONE IndexedDB
 * transaction, which the browser serializes against every other transaction
 * on the same object store — two concurrent calls to `next()` for the same
 * series cannot both observe the same starting value.
 */
const DB_NAME = 'invoice-engine-numbering';
const DB_VERSION = 1;
const STORE = 'counters';

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

/** Returns the next integer for `seriesId`, starting at 1, incrementing by
 * exactly 1 every call, forever. */
export async function nextCounterValue(seriesId: string): Promise<number> {
  const db = await openDb();
  const value = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(seriesId);
    getReq.onsuccess = () => {
      const next = ((getReq.result as number | undefined) ?? 0) + 1;
      store.put(next, seriesId);
      tx.oncomplete = () => resolve(next);
    };
    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return value;
}

/** Read-only peek, for the UI to show "next number will be #N" without
 * consuming it — consuming happens only via nextCounterValue. */
export async function peekCounterValue(seriesId: string): Promise<number> {
  const db = await openDb();
  const value = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(seriesId);
    req.onsuccess = () => resolve(((req.result as number | undefined) ?? 0) + 1);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
}
