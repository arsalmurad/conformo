/**
 * Payment links are HTTPS-only and reject javascript:, localhost and
 * embedded credentials. A payment link (a Stripe/PayPal/etc.
 * checkout URL) is the one field on an invoice a buyer is actively invited to
 * click — so it's exactly the field a malicious "invoice" would weaponize:
 * `javascript:` for script execution if it's ever rendered clickable rather
 * than as text, `http://` for a downgrade a phisher can MITM, `localhost` /
 * loopback / private-range hosts to probe the CLICKING USER's own machine or
 * internal network (SSRF-shaped, aimed at whoever opens the invoice), and
 * `https://user:pass@host/...` userinfo to smuggle credentials into a URL a
 * buyer's accounting software might log or forward verbatim.
 *
 * Not part of the EN 16931 model: no BT/BG covers "a URL to pay online" (the
 * model has payment MEANS — IBAN, a means code — not a checkout link), so
 * this lives as UI-only state the same way BillingPanel's project total
 * does, surfaced on the rendered PDF but never in the invoice XML itself.
 */
export interface PaymentLinkCheck {
  valid: boolean;
  reason?: string;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function isPrivateOrLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(host) || host.endsWith(".localhost")) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local
  }
  return false;
}

export function checkPaymentLink(raw: string): PaymentLinkCheck {
  const value = raw.trim();
  if (!value) return { valid: true };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { valid: false, reason: "isn't a valid URL" };
  }

  if (url.protocol !== "https:") {
    return { valid: false, reason: `must be https:// (was ${url.protocol.replace(":", "")})` };
  }
  if (url.username || url.password) {
    return { valid: false, reason: "must not contain a username or password" };
  }
  if (isPrivateOrLoopback(url.hostname)) {
    return { valid: false, reason: "must not point at localhost or a private network address" };
  }
  return { valid: true };
}
