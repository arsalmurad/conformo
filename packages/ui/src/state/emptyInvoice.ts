import type { Invoice } from '@invoice-engine/core';

/** A brand-new invoice needs no passphrase, no account and no wait — the
 * hard requirement is a downloaded PDF within 10 seconds of opening the app,
 * so the editor starts fully usable and empty, not gated behind setup. */
export function emptyInvoice(): Invoice {
  const today = new Date().toISOString().slice(0, 10);
  return {
    number: '',
    issueDate: today,
    currency: 'EUR',
    seller: { name: '', country: '' },
    buyer: { name: '', country: '' },
    payment: { meansCode: '58' },
    lines: [{ name: '', quantity: 1, unitPriceMinor: 0, taxCategory: 'S', taxRate: 0 }],
  };
}
