/**
 * Maps a BT-/BG- business-term id to where the editor shows it: either a
 * specific form field (so the error renders right under that input) or a
 * section bucket (for terms — totals, tax breakdown, line items — where the
 * offending row isn't identifiable from the BT id alone; getting there needs
 * parsing the rule's XPath location against the actual line index, which is
 * real work left for a follow-up rather than blocking live validation on).
 */
export type Section = 'lines' | 'tax' | 'totals' | 'payment';
export type FieldTarget = { kind: 'field'; field: string } | { kind: 'section'; section: Section };

const FIELD_BY_BT: Record<string, string> = {
  'BT-1': 'number',
  'BT-2': 'issueDate',
  'BT-3': 'typeCode',
  'BT-5': 'currency',
  'BT-9': 'dueDate',
  'BT-20': 'paymentTerms',
  'BT-24': 'businessProcess',
  'BT-27': 'seller.name',
  'BT-29': 'seller.id',
  'BT-30': 'seller.legalId',
  'BT-31': 'seller.vatId',
  'BT-35': 'seller.street',
  'BT-37': 'seller.city',
  'BT-38': 'seller.postcode',
  'BT-40': 'seller.country',
  'BT-34': 'seller.electronicAddress',
  'BT-44': 'buyer.name',
  'BT-46': 'buyer.id',
  'BT-47': 'buyer.legalId',
  'BT-48': 'buyer.vatId',
  'BT-50': 'buyer.street',
  'BT-52': 'buyer.city',
  'BT-53': 'buyer.postcode',
  'BT-55': 'buyer.country',
  'BT-49': 'buyer.electronicAddress',
};

const SECTION_BY_BT: Record<string, Section> = {
  'BT-84': 'payment',
  'BT-85': 'payment',
  'BT-86': 'payment',
  'BT-81': 'payment',
};

export function targetFor(fields: string[]): FieldTarget {
  for (const bt of fields) {
    const field = FIELD_BY_BT[bt];
    if (field) return { kind: 'field', field };
  }
  for (const bt of fields) {
    const section = SECTION_BY_BT[bt];
    if (section) return { kind: 'section', section };
  }
  if (fields.some((f) => /^BT-(106|107|108|109|110|111|112|113|114|115)$/.test(f))) {
    return { kind: 'section', section: 'totals' };
  }
  if (fields.some((f) => /^B[TG]-(23|116|117|118|119|120|121)$/.test(f))) {
    return { kind: 'section', section: 'tax' };
  }
  return { kind: 'section', section: 'lines' };
}
