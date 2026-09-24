/** 'tax' and 'totals' (see fieldMap.ts's Section type) have no input of
 * their own to blur — they're computed from the invoice lines, never typed
 * directly — so they piggyback on the lines section having been touched.
 * One function so InvoiceEditor's per-field display and the summary's issue
 * count can never disagree about what's currently visible. */
export function touchKeyFor(key: string): string {
  return key === 'tax' || key === 'totals' ? 'lines' : key;
}
