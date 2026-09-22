import { useEffect, useRef, useState } from 'react';
import type { Invoice } from '@invoice-engine/core';
import { encryptJSON, decryptJSON } from '../crypto/aes.js';
import { saveDraft, loadDraft, clearDraft } from '../crypto/storage.js';
import { emptyInvoice } from './emptyInvoice.js';

const SAVE_DEBOUNCE_MS = 800;

export type LockState =
  | { status: 'checking' }
  | { status: 'unlocked' }
  | { status: 'locked' } // an encrypted draft exists on this device; needs a passphrase
  | { status: 'wrong-passphrase' };

export function useInvoiceDraft() {
  const [invoice, setInvoice] = useState<Invoice>(emptyInvoice);
  const [lock, setLock] = useState<LockState>({ status: 'checking' });
  const [protectedSince, setProtectedSince] = useState(false);
  const passphraseRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    loadDraft()
      .then((blob) => setLock(blob ? { status: 'locked' } : { status: 'unlocked' }))
      .catch(() => setLock({ status: 'unlocked' })); // no IndexedDB (e.g. private mode) — degrade to in-memory only
  }, []);

  useEffect(() => {
    if (!protectedSince || !passphraseRef.current) return;
    const timer = setTimeout(() => {
      void encryptJSON(passphraseRef.current!, invoice).then(saveDraft);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [invoice, protectedSince]);

  async function unlock(passphrase: string): Promise<void> {
    const blob = await loadDraft();
    if (!blob) {
      setLock({ status: 'unlocked' });
      return;
    }
    try {
      const decrypted = await decryptJSON<Invoice>(passphrase, blob);
      setInvoice(decrypted);
      passphraseRef.current = passphrase;
      setProtectedSince(true);
      setLock({ status: 'unlocked' });
    } catch {
      setLock({ status: 'wrong-passphrase' });
    }
  }

  async function discardLockedDraft(): Promise<void> {
    await clearDraft();
    setLock({ status: 'unlocked' });
  }

  /** Turns on encrypted autosave from this point forward. Nothing is written
   * to disk before this is called — an unprotected session is in-memory only. */
  function protect(passphrase: string): void {
    passphraseRef.current = passphrase;
    setProtectedSince(true);
  }

  return { invoice, setInvoice, lock, protectedSince, protect, unlock, discardLockedDraft };
}
