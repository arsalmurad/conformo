import { checkPaymentLink } from '../hardening/paymentLink.js';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/** Not part of the EN 16931 model — no BT/BG covers "a URL to pay online",
 * only structured payment MEANS (IBAN, a means code) — so this is UI-only
 * state (see BillingPanel's project total for the same pattern), rendered
 * on the PDF but never in the invoice XML. Validated with
 * hardening/paymentLink.ts: HTTPS-only, no javascript:, no localhost or
 * private-network host, no embedded credentials. */
export function PaymentLinkField({ value, onChange }: Props) {
  const check = checkPaymentLink(value);
  return (
    <label className={`field ${!check.valid ? 'field-invalid' : ''}`}>
      <span className="field-label">Payment link (optional — e.g. a Stripe/PayPal checkout URL)</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://buy.stripe.com/…" />
      {!check.valid && <p className="field-hint">This link {check.reason}.</p>}
    </label>
  );
}
