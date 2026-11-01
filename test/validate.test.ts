import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildCII, buildUBL, buildXRechnungCII, buildXRechnungUBL } from "@conformo/formats";
import { validate, ValidationInputError } from "@conformo/validate";
import type { Invoice } from "@conformo/core";
import sample from "../fixtures/sample-invoice.json" with { type: "json" };

const validCii = buildCII(sample as unknown as Invoice);
const brokenCii = readFileSync(new URL("../fixtures/negative/broken-invoice.xml", import.meta.url), "utf-8");

describe("validate(): the sample invoice", () => {
  it("passes EN 16931 cleanly", async () => {
    const result = await validate(validCii);
    expect(result.valid).toBe(true);
    expect(result.results.filter((r) => r.severity === "error" || r.severity === "fatal")).toEqual([]);
  });

  it("also passes the French CTC (BR-FR Flux 2) layer", async () => {
    const result = await validate(validCii, { country: "FR" });
    expect(result.valid).toBe(true);
  });

  it("rejects a non-invoice document rather than silently validating nothing", async () => {
    await expect(validate("<Order/>")).rejects.toThrow(/Unsupported document/);
    await expect(validate("<Invoice/>")).rejects.toThrow(/UBL 2.1/);
    await expect(validate("not xml")).rejects.toThrow(ValidationInputError);
  });

  it("reports exactly which rule sets and which XSD ran", async () => {
    const result = await validate(validCii);
    expect(result.detected).toMatchObject({ syntax: "cii", profile: "en16931" });
    expect(result.ruleSets.map((r) => r.id)).toEqual(["en16931-cii"]);
    expect(result.ruleSets[0]!.source).toMatch(/CEN eInvoicing-EN16931/);
    expect(result.xsd).toMatchObject({ ran: true, valid: true, schema: "UN/CEFACT CII D16B" });
  });
});

describe("validate(): a deliberately broken invoice", () => {
  it("flags at least 10 distinct rules, each with a location, a message, and — where we have one — a plain-language explanation", async () => {
    const result = await validate(brokenCii);
    expect(result.valid).toBe(false);

    const failures = result.results.filter((r) => r.severity === "error" || r.severity === "fatal");
    const distinctRuleIds = new Set(failures.map((f) => f.ruleId));
    expect(distinctRuleIds.size).toBeGreaterThanOrEqual(10);

    for (const f of failures) {
      expect(f.xpath.length).toBeGreaterThan(0);
      expect(f.message.length).toBeGreaterThan(0);
    }

    // The core mandatory-field rules this fixture is built to trip must all
    // be caught, with a plain-language translation attached to each.
    const byId = new Map(failures.map((f) => [f.ruleId, f]));
    for (const id of ["BR-01", "BR-02", "BR-03", "BR-04", "BR-05", "BR-06", "BR-07", "BR-08", "BR-10", "BR-CO-26", "BR-Z-10"]) {
      const f = byId.get(id);
      expect(f, `expected ${id} to fire`).toBeDefined();
      expect(f!.plainLanguage, `expected a plain-language message for ${id}`).toBeDefined();
      expect(f!.plainLanguage!.summary.length).toBeGreaterThan(0);
      expect(f!.plainLanguage!.why.length).toBeGreaterThan(0);
      expect(f!.plainLanguage!.fix.length).toBeGreaterThan(0);
    }

    // Printed so a human reviewing this test can see the real output, not
    // just a pass/fail.
    console.log(`\n${distinctRuleIds.size} distinct rules fired on the broken fixture:\n`);
    for (const id of [...distinctRuleIds].sort()) {
      const f = byId.get(id)!;
      console.log(`[${f.ruleId}] (${f.severity}) ${f.fields.join(", ") || "—"}`);
      console.log(`  official: ${f.message}`);
      if (f.plainLanguage) {
        console.log(`  what it means: ${f.plainLanguage.summary}`);
        console.log(`  why: ${f.plainLanguage.why}`);
        console.log(`  fix: ${f.plainLanguage.fix}`);
      }
    }
  });

  // No rule should ever reach a user as raw Schematron. The official
  // Factur-X CII Schematron puts each rule's human id as a "[BR-XX]-" prefix
  // directly on the message text (see svrl.ts's own comment on why); that
  // prefix is redundant with `ruleId` (already reported separately) and
  // reads as a raw machine sentence otherwise. This fixture alone fires 20+
  // distinct rules, which is enough surface to prove the stripping is
  // unconditional, not tuned to one rule.
  it("never leaves a raw [BR-XX]- bracket in a rule's message text", async () => {
    const result = await validate(brokenCii);
    expect(result.results.length).toBeGreaterThan(10);
    for (const r of result.results) {
      expect(r.message).not.toMatch(/^\[BR-/);
    }
  });
});

describe("validate(): UBL, XRechnung and Peppol from the document itself", () => {
  const xr = fixture("xrechnung-public-sector.json");
  const peppol = fixture("peppol-belgium-full.json");
  const credit = fixture("credit-note.json");

  it("validates UBL EN 16931 (Invoice) and a UBL CreditNote, with XSD", async () => {
    const inv = await validate(buildUBL(sample as unknown as Invoice));
    expect(inv.valid).toBe(true);
    expect(inv.detected.syntax).toBe("ubl-invoice");
    expect(inv.ruleSets.map((r) => r.id)).toEqual(["en16931-ubl"]);
    expect(inv.xsd).toMatchObject({ ran: true, valid: true, schema: "UBL 2.1 Invoice" });

    const cn = await validate(buildUBL(credit));
    expect(cn.valid, JSON.stringify(cn.results.filter((r) => r.severity === "error"))).toBe(true);
    expect(cn.detected.syntax).toBe("ubl-creditnote");
    expect(cn.xsd.schema).toBe("UBL 2.1 CreditNote");
  });

  it("runs EN 16931 + the KoSIT XRechnung rules on an XRechnung, in both syntaxes", async () => {
    const ubl = await validate(buildXRechnungUBL(xr));
    expect(ubl.detected.profile).toBe("xrechnung");
    expect(ubl.ruleSets.map((r) => r.id)).toEqual(["en16931-ubl", "xrechnung-ubl"]);
    expect(ubl.valid, JSON.stringify(ubl.results.filter((r) => r.severity === "error"))).toBe(true);
    const cii = await validate(buildXRechnungCII(xr));
    expect(cii.ruleSets.map((r) => r.id)).toEqual(["en16931-cii", "xrechnung-cii"]);
    expect(cii.valid, JSON.stringify(cii.results.filter((r) => r.severity === "error"))).toBe(true);
  });

  it("fires a KoSIT rule when an XRechnung lacks what Germany requires", async () => {
    const xml = buildUBL(xr, { profile: "xrechnung" }).replace(/<cbc:BuyerReference>[^<]*<\/cbc:BuyerReference>/, "");
    const r = await validate(xml);
    expect(r.valid).toBe(false);
    expect(r.results.some((x) => x.ruleId === "BR-DE-15" && x.ruleSet === "xrechnung-ubl")).toBe(true);
  });

  it("runs EN 16931 + Peppol BIS Billing 3.0 on a Peppol document", async () => {
    const r = await validate(buildUBL(peppol, { profile: "peppol" }));
    expect(r.detected.profile).toBe("peppol");
    expect(r.ruleSets.map((x) => x.id)).toEqual(["en16931-ubl", "peppol-ubl"]);
    expect(r.valid, JSON.stringify(r.results.filter((x) => x.severity === "error"))).toBe(true);
  });

  it("reports an XSD failure as invalid even when the Schematron is silent", async () => {
    const xml = buildUBL(sample as unknown as Invoice).replace("<cbc:IssueDate>", "<cbc:Bogus>x</cbc:Bogus><cbc:IssueDate>");
    const r = await validate(xml);
    expect(r.xsd).toMatchObject({ ran: true, valid: false });
    expect(r.valid).toBe(false);
  });

  it("says plainly that MINIMUM and BASIC WL are not accepted for German B2B", async () => {
    const xml = validCii.replace("urn:cen.eu:en16931:2017", "urn:factur-x.eu:1p0:minimum");
    const r = await validate(xml, { country: "DE", xsd: false });
    expect(r.ruleSets).toEqual([]);
    expect(r.notices.map((n) => n.code)).toContain("NOT-EN16931");
    expect(r.valid).toBe(false);
  });
});

function fixture(name: string): Invoice {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf-8")) as Invoice;
}
