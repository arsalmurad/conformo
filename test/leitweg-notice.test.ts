import { describe, it, expect } from "vitest";
import { buildCII, buildUBL, leitwegWrongCheckDigits } from "@conformo/formats";
import { explainRule, validate as toolkitValidate } from "@conformo/toolkit";
import type { Invoice } from "@conformo/core";
import publicSector from "../fixtures/xrechnung-public-sector.json" with { type: "json" };

const base = publicSector as unknown as Invoice;

describe("Leitweg-ID check-digit notice (a Conformo check, not a KoSIT rule)", () => {
  const withRef = (ref: string, syntax: "cii" | "ubl" = "cii") => {
    const inv = { ...base, buyerReference: ref } as Invoice;
    return syntax === "cii" ? buildCII(inv, { profile: "xrechnung" }) : buildUBL(inv, { profile: "xrechnung" });
  };

  for (const syntax of ["cii", "ubl"] as const) {
    it(`${syntax}: 04011000-1234512-06 gets a notice naming 68, and the verdict is unchanged`, async () => {
      const wrong = await toolkitValidate(withRef("04011000-1234512-06", syntax));
      const n = wrong.notices.find((x) => x.code === "LEITWEG-CHECK-DIGITS");
      expect(n?.severity).toBe("warning");
      expect(n?.message).toContain("68");
      expect(n?.message).toMatch(/not a rule of the KoSIT validator/);
      const ok = await toolkitValidate(withRef("04011000-1234512345-06", syntax));
      expect(wrong.valid).toBe(ok.valid);
      expect(wrong.valid).toBe(true);
      expect(wrong.results.length).toBe(ok.results.length);
    });
  }

  it("says nothing for correct Leitweg-IDs, lower-case letters, or a buyer reference that is no Leitweg-ID", async () => {
    for (const ref of ["04011000-1234512345-06", "991-03730-19", "PO-4711", "2026-0815", "12345"]) {
      expect((await toolkitValidate(withRef(ref))).notices.map((n) => n.code), ref).not.toContain("LEITWEG-CHECK-DIGITS");
    }
  });

  it("uses the same check digits as the invoice checks", () => {
    expect(leitwegWrongCheckDigits("04011000-1234512-06")).toEqual({ given: "06", expected: "68" });
    expect(leitwegWrongCheckDigits("04011000-1234512345-06")).toBeUndefined();
    expect(leitwegWrongCheckDigits("991-03730-19")).toBeUndefined();
    expect(leitwegWrongCheckDigits("PO-4711")).toBeUndefined();
    expect(explainRule("LEITWEG-CHECK-DIGITS").found).toBe(true);
  });
});
