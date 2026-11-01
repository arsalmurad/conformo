import type { Strings } from '../i18n/strings.js';

/** The words a person reads for a field key, used in the verdict's links and in technical details. */
export function labelFor(key: string, t: Strings, isB2G: boolean): string {
  const f = t.fields;
  const line = /^lines\.(\d+)\.(.+)$/.exec(key);
  if (line) {
    const sub: Record<string, string> = { name: f.lineName, quantity: f.quantity, unitPriceMinor: f.unitPrice, taxCategory: f.vatType, taxRate: f.vatRate, exemptionReason: f.exemptionReason };
    return `${t.lines.line(Number(line[1]) + 1)}: ${sub[line[2]!] ?? line[2]}`;
  }
  const party = /^(seller|buyer)\.(.+)$/.exec(key);
  if (party) {
    const seller = party[1] === 'seller';
    const sub: Record<string, string> = {
      name: seller ? f.sellerName : f.buyerName, street: f.street, postcode: f.postcode, city: f.city, country: f.country,
      vatId: seller ? f.vatId : f.buyerVatId, taxRegistrationId: f.taxRegistrationId, legalId: f.legalId,
      electronicAddress: seller ? f.sellerEmail : f.buyerEmail, electronicAddressScheme: f.addressScheme,
      'contact.name': f.contactName, 'contact.phone': f.contactPhone, 'contact.email': f.contactEmail,
    };
    return `${seller ? t.sections.seller : t.sections.buyer}: ${sub[party[2]!] ?? party[2]}`;
  }
  const plain: Record<string, string> = {
    number: f.number, issueDate: f.issueDate, dueDate: f.dueDate, currency: f.currency,
    buyerReference: isB2G ? f.leitwegId : f.buyerReference, businessProcess: f.businessProcess,
    'notes.AAB': f.noteAAB, 'notes.PMD': f.notePMD, 'notes.PMT': f.notePMT,
    'payment.iban': f.iban, 'payment.bic': f.bic, paymentTerms: f.paymentTerms,
    totals: t.lines.total, lines: t.sections.lines,
  };
  return plain[key] ?? key;
}
