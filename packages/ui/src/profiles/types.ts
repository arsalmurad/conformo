import type { Party } from '@conformo/core';

/** A saved, reusable seller/buyer entity. Wraps the same `Party` shape the
 * core model uses, so a profile drops straight into
 * `Invoice.seller`/`.buyer` with no translation layer. */
export interface PartyProfile {
  id: string;
  /** A label for the picker, e.g. "Northwind Studio SARL" — not itself part
   * of the EN 16931 model, just how the user finds it again. */
  label: string;
  party: Party;
}

export function newProfileId(): string {
  return crypto.randomUUID();
}
