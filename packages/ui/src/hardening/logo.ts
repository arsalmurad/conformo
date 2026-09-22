/**
 * "logo uploads limited to PNG/JPEG/WebP under 2 MB with SVG blocked"
 * . SVG is blocked specifically because it's an XML
 * format that can embed `<script>` and event-handler attributes — a "logo"
 * upload is exactly the kind of file a user expects to be inert, and an SVG
 * rendered inline or given a same-origin URL is not. The check reads the
 * file's actual magic bytes rather than trusting `file.type` or the
 * filename extension, both of which the browser derives from — and an
 * attacker fully controls — whatever the OS or the upload dialog reports;
 * neither is evidence of what the bytes actually are.
 */
export interface LogoCheck {
  valid: boolean;
  reason?: string;
  kind?: "png" | "jpeg" | "webp";
}

const MAX_BYTES = 2 * 1024 * 1024;

function matchesSignature(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((b, i) => bytes[i] === b);
}

export async function checkLogoFile(file: File): Promise<LogoCheck> {
  if (file.size > MAX_BYTES) {
    return { valid: false, reason: `is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 2 MB` };
  }
  if (file.size < 12) {
    return { valid: false, reason: "is too small to be a real image file" };
  }

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  // A byte-for-byte look for "is this actually SVG (or any XML/text)",
  // independent of file.type — an attacker can name a .svg file
  // "logo.png" and the browser will still report image/png from the
  // extension in some pickers, but the bytes don't lie.
  const asText = new TextDecoder("utf-8", { fatal: false }).decode(head).trimStart().toLowerCase();
  if (asText.startsWith("<?xml") || asText.startsWith("<svg")) {
    return { valid: false, reason: "is an SVG (or other XML), which isn't accepted for logos" };
  }

  if (matchesSignature(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { valid: true, kind: "png" };
  }
  if (matchesSignature(head, [0xff, 0xd8, 0xff])) {
    return { valid: true, kind: "jpeg" };
  }
  // WebP: "RIFF" .... "WEBP"
  if (matchesSignature(head, [0x52, 0x49, 0x46, 0x46]) && matchesSignature(head.slice(8), [0x57, 0x45, 0x42, 0x50])) {
    return { valid: true, kind: "webp" };
  }

  return { valid: false, reason: "isn't a PNG, JPEG or WebP file (checked the actual file contents, not just its name)" };
}
