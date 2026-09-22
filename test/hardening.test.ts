import { describe, it, expect } from "vitest";
import { stripHtml } from "../packages/ui/src/hardening/sanitize.js";
import { checkPaymentLink } from "../packages/ui/src/hardening/paymentLink.js";
import { checkLogoFile } from "../packages/ui/src/hardening/logo.js";

describe("stripHtml(): defends against a pasted rich-text payload", () => {
  it("removes tags entirely, including an event-handler attribute payload", () => {
    expect(stripHtml('<img src=x onerror="alert(1)">Hello')).toBe("Hello");
  });

  it("removes a script tag and its content marker, leaving only real text", () => {
    expect(stripHtml("Before<script>evil()</script>After")).toBe("Beforeevil()After");
  });

  it("decodes the entities a paste from a word processor commonly carries", () => {
    expect(stripHtml("Ben &amp; Jerry&#39;s &lt;3")).toBe("Ben & Jerry's <3");
  });

  it("leaves plain text completely untouched", () => {
    expect(stripHtml("Net 30 days, thank you for your business.")).toBe("Net 30 days, thank you for your business.");
  });
});

describe("checkPaymentLink(): the exact attack shapes named in the project's own conventions", () => {
  it("accepts a real HTTPS checkout link", () => {
    expect(checkPaymentLink("https://buy.stripe.com/test_abc123").valid).toBe(true);
  });

  it("accepts an empty value — the field is optional", () => {
    expect(checkPaymentLink("").valid).toBe(true);
  });

  it("rejects javascript:", () => {
    const r = checkPaymentLink("javascript:alert(document.cookie)");
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/https/);
  });

  it("rejects plain http://, not just javascript:", () => {
    expect(checkPaymentLink("http://example.com/pay").valid).toBe(false);
  });

  it("rejects localhost", () => {
    expect(checkPaymentLink("https://localhost:4000/pay").valid).toBe(false);
  });

  it("rejects a loopback IP", () => {
    expect(checkPaymentLink("https://127.0.0.1/pay").valid).toBe(false);
  });

  it("rejects a private-network address (SSRF-shaped)", () => {
    expect(checkPaymentLink("https://192.168.1.5/pay").valid).toBe(false);
  });

  it("rejects embedded credentials", () => {
    const r = checkPaymentLink("https://admin:hunter2@example.com/pay");
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/username|password/);
  });

  it("rejects a value that isn't a URL at all", () => {
    expect(checkPaymentLink("not a url").valid).toBe(false);
  });
});

function fileFromBytes(bytes: number[], name = "logo"): File {
  return new File([new Uint8Array(bytes)], name);
}

describe("checkLogoFile(): reads actual file contents, not the name or reported type", () => {
  it("accepts a real PNG signature", async () => {
    const r = await checkLogoFile(fileFromBytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]));
    expect(r.valid).toBe(true);
    expect(r.kind).toBe("png");
  });

  it("accepts a real JPEG signature", async () => {
    const r = await checkLogoFile(fileFromBytes([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]));
    expect(r.valid).toBe(true);
    expect(r.kind).toBe("jpeg");
  });

  it("accepts a real WebP signature (RIFF....WEBP)", async () => {
    const bytes = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
    const r = await checkLogoFile(fileFromBytes(bytes));
    expect(r.valid).toBe(true);
    expect(r.kind).toBe("webp");
  });

  it("rejects an SVG even when named logo.png — the whole point of sniffing bytes", async () => {
    const svg = new TextEncoder().encode('<?xml version="1.0"?><svg onload="alert(1)"></svg>');
    const r = await checkLogoFile(new File([svg], "logo.png", { type: "image/png" }));
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/SVG/);
  });

  it("rejects a file over 2 MB", async () => {
    const bytes = new Uint8Array(2 * 1024 * 1024 + 1);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const r = await checkLogoFile(new File([bytes], "big.png"));
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/2 MB/);
  });

  it("rejects a file whose bytes match none of the three signatures", async () => {
    const r = await checkLogoFile(fileFromBytes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    expect(r.valid).toBe(false);
  });
});
