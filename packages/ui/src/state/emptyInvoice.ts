import type { Invoice } from '@conformo/core';
import { standardRate } from '../countries.js';

/** A brand-new invoice needs no passphrase, no account and no wait: the editor starts fully usable and empty.
 * The first line is standard-rated at the seller country's standard rate: category S with 0 % breaks BR-S-05. */
export function emptyInvoice(sellerCountry = '', buyerCountry = ''): Invoice {
  const today = new Date().toISOString().slice(0, 10);
  return {
    number: '',
    issueDate: today,
    currency: 'EUR',
    seller: { name: '', country: sellerCountry },
    buyer: { name: '', country: buyerCountry },
    payment: { meansCode: '58' },
    lines: [{ name: '', quantity: 1, unitPriceMinor: 0, taxCategory: 'S', taxRate: standardRate(sellerCountry) ?? 0 }],
  };
}
