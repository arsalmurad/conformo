import { leitwegWrongCheckDigits } from '@conformo/formats';
import { child, descend, parseXml, text } from '@conformo/parse';
import type { Notice } from '@conformo/validate';

/** BT-10 as written in the document, or undefined when absent or the XML cannot be read. */
function buyerReferenceOf(xml: string): string | undefined {
  try {
    const root = parseXml(xml);
    const value = root.name === 'CrossIndustryInvoice'
      ? text(descend(child(root, 'SupplyChainTradeTransaction'), 'ApplicableHeaderTradeAgreement', 'BuyerReference'))
      : text(child(root, 'BuyerReference'));
    return value?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * A Conformo check, not a rule of the KoSIT validator: when BT-10 has the shape of a Leitweg-ID but its check digits
 * (ISO/IEC 7064 MOD 97-10, Leitweg-ID Formatspezifikation) are wrong, say so and give the digits it should have.
 * KoSIT and Mustang do not check them. A warning: it never changes `valid`. Nothing is said when BT-10 is not shaped like a Leitweg-ID.
 */
export function leitwegNotices(xml: string): Notice[] {
  const ref = buyerReferenceOf(xml);
  const wrong = ref ? leitwegWrongCheckDigits(ref) : undefined;
  if (!ref || !wrong) return [];
  return [{
    severity: 'warning', code: 'LEITWEG-CHECK-DIGITS',
    message: `BT-10 "${ref}" has the shape of a Leitweg-ID, but its check digits are wrong: they should be ${wrong.expected}, not ${wrong.given}. ` +
      'This is a check by Conformo, not a rule of the KoSIT validator (which does not check them), so the verdict is unchanged. ' +
      'If BT-10 is not a Leitweg-ID, ignore this notice.',
  }];
}
