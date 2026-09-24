import type { Party } from '@verinvoice/core';

/** A saved, reusable seller/buyer entity — the "profiles" hard requirement
 * from the project's own conventions. Wraps the same `Party` shape the core model
 * uses, so a profile drops straight into `Invoice.seller`/`.buyer` with no
 * translation layer. */
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
