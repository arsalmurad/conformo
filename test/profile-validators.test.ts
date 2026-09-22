import { describe, it, expect } from "vitest";
import { checkIban } from "../packages/ui/src/profiles/iban.js";
import { checkVatFormat } from "../packages/ui/src/profiles/vat.js";

describe("checkIban(): ISO 13616 MOD-97-10 checksum", () => {
  it("accepts this project's own fixture IBAN", () => {
    expect(checkIban("FR7630006000011234567890189").valid).toBe(true);
  });

  it("accepts the reference IBANs from the IBAN spec's own worked examples", () => {
    expect(checkIban("DE89370400440532013000").valid).toBe(true);
    expect(checkIban("GB29NWBK60161331926819").valid).toBe(true);
  });

  it("rejects a single mistyped digit — the actual checksum fails, not a shape check", () => {
    const result = checkIban("FR7630006000011234567890188"); // last digit 9 -> 8
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/check-digit/);
  });

  it("rejects the wrong length for a known country", () => {
    const result = checkIban("FR76300060000112345678901"); // FR is 27 chars, this is 26
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/27 characters/);
  });

  it("rejects something that isn't IBAN-shaped at all", () => {
    expect(checkIban("not an iban").valid).toBe(false);
  });

  it("is tolerant of spaces and lowercase, as banks display IBANs", () => {
    expect(checkIban("fr76 3000 6000 0112 3456 7890 189").valid).toBe(true);
  });
});

describe("checkVatFormat(): EU VAT number format per country prefix", () => {
  it("accepts this project's own fixture VAT numbers", () => {
    expect(checkVatFormat("FR32123456789").valid).toBe(true);
    expect(checkVatFormat("DE123456789").valid).toBe(true);
  });

  it("rejects a French VAT number with the wrong digit count", () => {
    expect(checkVatFormat("FR123").valid).toBe(false);
  });

  it("rejects a German VAT number with the wrong digit count", () => {
    expect(checkVatFormat("DE12345").valid).toBe(false);
  });

  it("uses EL, not GR, for Greece — the one EU country whose VAT prefix differs from its ISO country code", () => {
    expect(checkVatFormat("EL123456789").valid).toBe(true);
    expect(checkVatFormat("GR123456789").valid).toBe(true); // unknown prefix: not claimed wrong, just unchecked
  });

  it("doesn't fail closed for a country it has no pattern for", () => {
    expect(checkVatFormat("US123456789").valid).toBe(true);
  });
});
