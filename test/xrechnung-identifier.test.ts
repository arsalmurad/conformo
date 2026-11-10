import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { buildCII, buildUBL } from "@conformo/formats";
import { validate, KOSIT_XRECHNUNG_IDS, isUnknownXrechnungId } from "@conformo/validate";
import { explainRule } from "@conformo/toolkit";
import type { Invoice } from "@conformo/core";
import publicSector from "../fixtures/xrechnung-public-sector.json" with { type: "json" };

// The KoSIT validator picks its scenario by exact text equality on BT-24 (scenarios.xml). An identifier that names
// XRechnung but is not one of its known identifiers matches no scenario, and the file is rejected there.
const base = publicSector as unknown as Invoice;
const credit = { ...base, typeCode: "381" } as Invoice;
const std = KOSIT_XRECHNUNG_IDS.standard;
const bad = [
  "urn:xoev-de:kosit:standard:xrechnung_3.0",
  "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0",
  "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3",
  `${std} `,
  ` ${std}`,
  std.toUpperCase(),
];
const docs = {
  cii: (id: string) => buildCII(base, { profile: "xrechnung", customizationId: id }),
  "ubl-invoice": (id: string) => buildUBL(base, { profile: "xrechnung", customizationId: id }),
  "ubl-creditnote": (id: string) => buildUBL(credit, { profile: "xrechnung", customizationId: id }),
};

describe("XRechnung identifier (BT-24) is matched like the KoSIT validator does", () => {
  for (const [syntax, make] of Object.entries(docs)) {
    it(`${syntax}: the exact identifier is valid, with no identifier notice`, async () => {
      const r = await validate(make(std));
      expect(r.valid).toBe(true);
      expect(r.notices.map((n) => n.code)).not.toContain("XRECHNUNG-ID-UNKNOWN");
    });

    for (const id of bad) {
      it(`${syntax}: ${JSON.stringify(id)} is invalid, and the rule sets still ran`, async () => {
        const r = await validate(make(id));
        expect(r.valid).toBe(false);
        const n = r.notices.find((x) => x.code === "XRECHNUNG-ID-UNKNOWN");
        expect(n?.severity).toBe("error");
        expect(n?.message).toContain(std);
        expect(n?.message).toMatch(/KoSIT/);
        expect(r.ruleSets.length).toBeGreaterThanOrEqual(2);
        expect(r.results.filter((x) => x.severity === "error" || x.severity === "fatal")).toEqual([]);
      });
    }
  }

  it("the extension identifier is fine on CII and UBL Invoice, but KoSIT has no extension scenario for a CreditNote", async () => {
    const ext = KOSIT_XRECHNUNG_IDS.extension;
    expect((await validate(docs.cii(ext))).notices.map((n) => n.code)).not.toContain("XRECHNUNG-ID-UNKNOWN");
    expect((await validate(docs["ubl-invoice"](ext))).notices.map((n) => n.code)).not.toContain("XRECHNUNG-ID-UNKNOWN");
    expect((await validate(docs["ubl-creditnote"](ext))).valid).toBe(false);
  });

  it("does not touch plain EN 16931, Peppol, Factur-X or unrelated identifiers", () => {
    for (const id of [
      "urn:cen.eu:en16931:2017",
      "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0",
      "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended",
      "urn:factur-x.eu:1p0:minimum",
      "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931",
      "urn:example:foo",
      "",
    ]) {
      expect(isUnknownXrechnungId("cii", id), id).toBe(false);
    }
    expect(isUnknownXrechnungId("cii", undefined)).toBe(false);
  });

  it("uses the identifiers of the pinned KoSIT configuration", () => {
    const f = new URL("../tools/artefacts/kosit-xrechnung-config/scenarios.xml", import.meta.url);
    if (!existsSync(f)) return; // present after `npm run artefacts:fetch -- --group java`
    const xml = readFileSync(f, "utf-8");
    for (const id of Object.values(KOSIT_XRECHNUNG_IDS)) expect(xml).toContain(`'${id}'`);
  });

  it("explains the notice and BR-DE-21, which lives in both XRechnung rule sets", () => {
    const e = explainRule("XRECHNUNG-ID-UNKNOWN");
    expect(e.found).toBe(true);
    expect(e.plainLanguage?.fix).toContain(std);
    const d = explainRule("BR-DE-21");
    expect(d.plainLanguage).toBeDefined();
    expect(d.official.map((o) => o.ruleSet).sort()).toEqual(["xrechnung-cii", "xrechnung-ubl"]);
    expect(d.official[0]!.text).toContain("Specification identifier");
  });
});
