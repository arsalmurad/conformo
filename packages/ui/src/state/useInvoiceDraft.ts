import { useEffect, useRef, useState } from 'react';
import type { Invoice } from '@conformo/core';
import { encryptJSON, decryptJSON } from '../crypto/aes.js';
import { saveDraft, loadDraft, clearDraft } from '../crypto/storage.js';
import { emptyInvoice } from './emptyInvoice.js';
import type { PartyProfile } from '../profiles/types.js';

const SAVE_DEBOUNCE_MS = 800;

export type LockState =
  | { status: 'checking' }
  | { status: 'unlocked' }
  | { status: 'locked' } // an encrypted draft exists on this device; needs a passphrase
  | { status: 'wrong-passphrase' };

/** What's actually encrypted together on disk. Profiles live in the same
 * blob as the current invoice, under the same passphrase — one "protect"
 * gesture covers both, rather than asking for a second passphrase just for
 * the address book. */
interface PersistedState {
  invoice: Invoice;
  profiles: PartyProfile[];
}

/** Before profiles existed, the encrypted blob WAS the invoice directly, not
 * `{ invoice, profiles }`. Decrypting an old draft with the new code would
 * otherwise set `invoice` state to `undefined` and crash the whole app on a
 * blank screen the moment it tries to read `invoice.number` — confirmed by
 * actually doing that against a real pre-profiles draft, not theorized.
 * Every future shape change to this persisted state needs the same kind of
 * tolerant read, not just an additive field. */
function migrate(decrypted: PersistedState | Invoice): PersistedState {
  if (decrypted && typeof decrypted === 'object' && 'invoice' in decrypted) {
    return { invoice: decrypted.invoice, profiles: decrypted.profiles ?? [] };
  }
  return { invoice: decrypted as Invoice, profiles: [] };
}

export function useInvoiceDraft() {
  const [invoice, setInvoice] = useState<Invoice>(emptyInvoice);
  const [profiles, setProfiles] = useState<PartyProfile[]>([]);
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
      void encryptJSON(passphraseRef.current!, { invoice, profiles } satisfies PersistedState).then(saveDraft);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [invoice, profiles, protectedSince]);

  async function unlock(passphrase: string): Promise<void> {
    const blob = await loadDraft();
    if (!blob) {
      setLock({ status: 'unlocked' });
      return;
    }
    try {
      const decrypted = await decryptJSON<PersistedState | Invoice>(passphrase, blob);
      const { invoice: decryptedInvoice, profiles: decryptedProfiles } = migrate(decrypted);
      setInvoice(decryptedInvoice);
      setProfiles(decryptedProfiles);
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

  function saveProfile(profile: PartyProfile): void {
    setProfiles((prev) => {
      const i = prev.findIndex((p) => p.id === profile.id);
      if (i === -1) return [...prev, profile];
      return prev.map((p, idx) => (idx === i ? profile : p));
    });
  }

  function deleteProfile(id: string): void {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  }

  return {
    invoice,
    setInvoice,
    profiles,
    saveProfile,
    deleteProfile,
    lock,
    protectedSince,
    protect,
    unlock,
    discardLockedDraft,
  };
}
