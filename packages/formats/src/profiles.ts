/**
 * Specification identifiers (BT-24) and business process identifiers (BT-23).
 *
 * A profile is an option on a serializer, not a separate serializer. XRechnung and
 * Peppol BIS Billing 3.0 are both CIUS of EN 16931: same semantic model, same syntax
 * bindings, different customization identifier and a few extra mandatory terms.
 */

export type Profile = 'en16931' | 'peppol' | 'xrechnung';

/** BT-24 for each profile. */
export const CUSTOMIZATION_ID: Record<Profile, string> = {
  en16931: 'urn:cen.eu:en16931:2017',
  peppol: 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
  xrechnung: 'urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0',
};

/** BT-23 the Peppol billing process. XRechnung 3.0 uses the same one. */
export const PEPPOL_BILLING_PROCESS = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

/**
 * BT-23 for a profile. For plain EN 16931 the invoice's own value is used (France
 * puts its closed list here: B1, S1, M1, ...). Peppol and XRechnung pin the process
 * and ignore it, because a French "B1" in a Peppol document is simply wrong.
 */
export function businessProcess(profile: Profile, invoiceValue?: string): string | undefined {
  return profile === 'en16931' ? invoiceValue : PEPPOL_BILLING_PROCESS;
}

/**
 * BT-8 is a UNTDID 2005 code in the model and in UBL (3 invoice date, 35 delivery date, 432 paid-to-date).
 * The CII binding uses UNTDID 2475 for the same meaning (5, 29, 72), enforced by BR-CL-06.
 */
export const TAX_POINT_CODE_2005_TO_2475: Record<string, string> = { '3': '5', '35': '29', '432': '72' };
export const TAX_POINT_CODE_2475_TO_2005: Record<string, string> = { '5': '3', '29': '35', '72': '432' };
