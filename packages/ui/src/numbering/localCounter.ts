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
const DB_NAME = 'conformo-numbering';
const DB_VERSION = 2;
const STORE = 'counters';
const ISSUED = 'issued';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      if (!req.result.objectStoreNames.contains(ISSUED)) req.result.createObjectStore(ISSUED);
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

/** "Continue my numbering from my old tool": the next nextCounterValue() call returns `next`. Only moves forward or
 * sets a fresh series; the gapless guarantee is about never handing out a number twice, and a user who says their
 * old tool already issued up to 142 is telling us exactly which numbers are taken. */
export async function setNextCounterValue(seriesId: string, next: number): Promise<void> {
  if (!Number.isSafeInteger(next) || next < 1) throw new RangeError('the next number must be a whole number of at least 1');
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(next - 1, seriesId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Numbers of invoices downloaded on this device, so a hand-typed number that repeats one gets a warning. */
export async function recordIssuedNumber(number: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ISSUED, 'readwrite');
    tx.objectStore(ISSUED).put(Date.now(), number);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function wasIssued(number: string): Promise<boolean> {
  const db = await openDb();
  const found = await new Promise<boolean>((resolve, reject) => {
    const req = db.transaction(ISSUED, 'readonly').objectStore(ISSUED).get(number);
    req.onsuccess = () => resolve(req.result !== undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return found;
}
