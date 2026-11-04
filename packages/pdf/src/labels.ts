/**
 * The words printed on the invoice page, per language. Presentation only: the embedded XML never contains any of
 * these, so switching the page language can never change what the invoice means or whether it validates.
 *
 * Dates and amounts are formatted by locale.ts from the buyer's country, independently of this choice: a German
 * seller can print German labels on an invoice to a French buyer and the dates still read the way the buyer writes
 * them.
 *
 * The four money labels (subtotal, total, paid, amountDue) are also read back off the rendered page by
 * packages/parse/src/pdf/visibleTotals.ts (the visible-totals fraud check), which keeps its own copy so @conformo/parse
 * needs no dependency on this package. test/pdf-labels.test.ts fails if the two copies drift. Each of those labels must
 * be followed directly by the amount on the page, and no label may end where another language's label continues with
 * an amount (e.g. English "Total" vs French "Total TTC" is fine because "TTC" is not a number).
 */
export type PdfLanguage = 'en' | 'de' | 'fr';

export const PDF_LANGUAGES = ['en', 'de', 'fr'] as const satisfies readonly PdfLanguage[];

export interface PdfLabels {
  title: string;
  issued: string;
  due: string;
  from: string;
  billTo: string;
  /** Prefix for a party's VAT identifier, e.g. "VAT DE123456789". */
  vatId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  subtotal: string;
  /** One VAT breakdown row, e.g. "VAT 19%". */
  vatRow: (rate: number) => string;
  total: string;
  paid: string;
  amountDue: string;
  payment: string;
  bankTransfer: (iban: string) => string;
  reference: string;
  payOnline: string;
  footer: string;
}

/** Formats a VAT rate the way the language writes percentages: "19%" in English, "19 %" in German and French. */
function percent(rate: number, spaced: boolean): string {
  return spaced ? `${rate} %` : `${rate}%`;
}

export const PDF_LABELS: Record<PdfLanguage, PdfLabels> = {
  en: {
    title: 'INVOICE',
    issued: 'Issued',
    due: 'Due',
    from: 'From',
    billTo: 'Bill to',
    vatId: 'VAT',
    description: 'DESCRIPTION',
    quantity: 'QTY',
    unitPrice: 'UNIT PRICE',
    amount: 'AMOUNT',
    subtotal: 'Subtotal',
    vatRow: (rate) => `VAT ${percent(rate, false)}`,
    total: 'Total',
    paid: 'Paid',
    amountDue: 'Amount due',
    payment: 'PAYMENT',
    bankTransfer: (iban) => `Bank transfer to IBAN ${iban}`,
    reference: 'Reference',
    payOnline: 'Pay online:',
    footer: 'This PDF contains a Factur-X / EN 16931 electronic invoice embedded as XML.',
  },
  de: {
    title: 'RECHNUNG',
    issued: 'Rechnungsdatum',
    due: 'Fällig am',
    from: 'Rechnungssteller',
    billTo: 'Rechnungsempfänger',
    vatId: 'USt-IdNr.',
    description: 'BESCHREIBUNG',
    quantity: 'MENGE',
    unitPrice: 'EINZELPREIS',
    amount: 'BETRAG',
    subtotal: 'Nettobetrag',
    vatRow: (rate) => `USt. ${percent(rate, true)}`,
    total: 'Gesamtbetrag',
    paid: 'Bereits bezahlt',
    amountDue: 'Zahlbetrag',
    payment: 'ZAHLUNG',
    bankTransfer: (iban) => `Überweisung auf IBAN ${iban}`,
    reference: 'Verwendungszweck',
    payOnline: 'Online bezahlen:',
    footer: 'Dieses PDF enthält eine elektronische Rechnung nach Factur-X / EN 16931 als eingebettete XML-Datei.',
  },
  fr: {
    title: 'FACTURE',
    issued: 'Date',
    due: 'Échéance',
    from: 'Émetteur',
    billTo: 'Destinataire',
    vatId: 'N° TVA',
    description: 'DÉSIGNATION',
    quantity: 'QTÉ',
    unitPrice: 'PRIX UNIT. HT',
    amount: 'MONTANT HT',
    subtotal: 'Total HT',
    vatRow: (rate) => `TVA ${percent(rate, true)}`,
    total: 'Total TTC',
    paid: 'Déjà payé',
    amountDue: 'Net à payer',
    payment: 'PAIEMENT',
    bankTransfer: (iban) => `Virement sur l'IBAN ${iban}`,
    reference: 'Référence',
    payOnline: 'Payer en ligne :',
    footer: 'Ce PDF contient une facture électronique Factur-X / EN 16931 intégrée au format XML.',
  },
};

export function isPdfLanguage(v: unknown): v is PdfLanguage {
  return typeof v === 'string' && (PDF_LANGUAGES as readonly string[]).includes(v);
}
