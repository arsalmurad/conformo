import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validate, groupResults, groupHeading, describePlaces, describeLocation, getPlainLanguageMessage } from "@conformo/validate";
import { parseSvrl } from "../packages/validate/src/svrl.js";
import { syntaxMessage } from "../packages/validate/src/messages/syntax.js";

// fixtures/negative/currency-id-on-amounts.xml is our own sample invoice (CII) with a currencyID attribute added to
// every amount except TaxTotalAmount: 15 amounts on 3 invoice lines and the document level. Synthetic; not anybody's file.
const xml = readFileSync(new URL("../fixtures/negative/currency-id-on-amounts.xml", import.meta.url), "utf-8");

describe("CII-DT-031: currencyID on amounts", () => {
  it("fires once per amount, never on TaxTotalAmount, and the invoice is invalid", async () => {
    const r = await validate(xml);
    const hits = r.results.filter((x) => x.ruleId === "CII-DT-031");
    expect(hits).toHaveLength(15);
    expect(hits.some((x) => x.element === "TaxTotalAmount")).toBe(false);
    expect(hits.every((x) => x.severity === "fatal")).toBe(true);
    expect(r.valid).toBe(false);
    expect(r.results.every((x) => x.ruleId === "CII-DT-031")).toBe(true);
  });

  it("the message is the publisher's sentence without its id artefacts, with a plain-language explanation", async () => {
    const r = await validate(xml);
    const hit = r.results.find((x) => x.ruleId === "CII-DT-031")!;
    expect(hit.message).toBe("currencyID should not be present");
    expect(hit.plainLanguage?.summary).toMatch(/currencyID attribute/);
    expect(hit.plainLanguage?.fix).toMatch(/Keep currencyID only on TaxTotalAmount/);
  });

  it("each hit has a readable element, path, line and BT ids (xpath stays as it was)", async () => {
    const r = await validate(xml);
    const hits = r.results.filter((x) => x.ruleId === "CII-DT-031");
    const lineAmount = hits.find((x) => x.element === "LineTotalAmount" && x.line === 2)!;
    expect(lineAmount.path).toBe("line 2 > SpecifiedTradeSettlementLineMonetarySummation > LineTotalAmount");
    expect(lineAmount.fields).toEqual(["BT-131"]);
    const header = hits.find((x) => x.element === "LineTotalAmount" && x.line === undefined)!;
    expect(header.path).toBe("SpecifiedTradeSettlementHeaderMonetarySummation > LineTotalAmount");
    expect(header.fields).toEqual(["BT-106"]);
    expect(header.xpath).toMatch(/^\/\*:CrossIndustryInvoice\[namespace-uri\(\)=/);
  });

  it("groups repeated hits for display and keeps the results array one entry per hit", async () => {
    const r = await validate(xml);
    const groups = groupResults(r.results);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.count).toBe(15);
    const heading = groupHeading(groups[0]!);
    expect(heading).toMatch(/^CII-DT-031, 15 places: /);
    expect(heading).toContain("ChargeAmount (lines 1, 2, 3)");
    expect(heading).toContain("LineTotalAmount (lines 1, 2, 3)");
    expect(heading).toContain("LineTotalAmount (document level)");
    expect(heading).toContain("GrandTotalAmount");
    expect(r.results).toHaveLength(15);
  });
});

describe("message text artefacts", () => {
  const svrl = (text: string) =>
    `<svrl:schematron-output xmlns:svrl="http://purl.oclc.org/dsdl/svrl"><svrl:failed-assert id="X-1" flag="fatal" location="/a"><svrl:text>${text}</svrl:text></svrl:failed-assert></svrl:schematron-output>`;
  it("strips '[ID] - ', '[ID]-' and '[ID] ' prefixes in one place", () => {
    expect(parseSvrl(svrl("[CII-DT-031] - currencyID should not be present")).results[0]!.message).toBe("currencyID should not be present");
    expect(parseSvrl(svrl("[BR-01]-An Invoice shall have a Specification identifier")).results[0]!.message).toBe("An Invoice shall have a Specification identifier");
    expect(parseSvrl(svrl("[BR-CO-15] Total is wrong")).results[0]!.message).toBe("Total is wrong");
    expect(parseSvrl(svrl("[BR-CO-15] - Total is wrong")).results[0]!.ruleId).toBe("BR-CO-15");
  });
});

describe("plain-language families for the syntax rules", () => {
  it("attributes", () => {
    const m = syntaxMessage("CII-DT-009", "listURI should not be present")!;
    expect(m.summary).toBe('The attribute "listURI" is not allowed on this element.');
    expect(syntaxMessage("CII-DT-045", "@listID should not be present")!.summary).toContain('"listID"');
    expect(syntaxMessage("UBL-DT-08", "Scheme name attribute should not be present")!.summary).toContain('"Scheme name"');
  });
  it("elements", () => {
    const m = syntaxMessage("CII-SR-001", "SpecifiedTransactionID should not be present")!;
    expect(m.summary).toBe('The element "SpecifiedTransactionID" is not used by EN 16931 at this place.');
    expect(syntaxMessage("CII-DT-068", "DateTime shall not be used.")!.fix).toContain("Remove");
  });
  it("UBL elements that have no place in EN 16931", () => {
    const m = syntaxMessage("UBL-CR-001", "A UBL invoice should not include extensions")!;
    expect(m.summary).toBe('The UBL element "extensions" is not part of the EN 16931 data model.');
  });
  it("cardinality", () => {
    expect(syntaxMessage("CII-SR-002", "ID must exist exactly once")!.fix).toMatch(/once/);
    expect(syntaxMessage("UBL-SR-33", "Supporting document description shall occur maximum once")!.summary).toMatch(/Too many/);
  });
  it("anything else keeps the publisher's sentence only, and non-syntax rules are untouched", () => {
    expect(syntaxMessage("CII-SR-463", "Each Specified Trade Allowance Charge (BG-20)(BG-21) shall contain a Charge Indicator.")).toBeUndefined();
    expect(syntaxMessage("BR-01", "ID should not be present")).toBeUndefined();
    expect(getPlainLanguageMessage("CII-DT-009")).toBeUndefined(); // needs the official sentence to build a message
    expect(getPlainLanguageMessage("CII-DT-009", "en", "listURI should not be present")).toBeDefined();
    expect(getPlainLanguageMessage("BR-01")).toBeDefined();
  });
});

describe("describeLocation", () => {
  it("reads both XPath dialects the engines produce", () => {
    const a = describeLocation("/*:Invoice[namespace-uri()='urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'][1]/*:InvoiceLine[namespace-uri()='urn:x'][2]/*:LineExtensionAmount[namespace-uri()='urn:y'][1]")!;
    expect(a).toMatchObject({ element: "LineExtensionAmount", line: 2, fields: ["BT-131"], path: "line 2 > LineExtensionAmount" });
    const b = describeLocation("/Q{urn:a}CrossIndustryInvoice[1]/Q{urn:b}SupplyChainTradeTransaction[1]/Q{urn:b}ApplicableHeaderTradeSettlement[1]/Q{urn:b}SpecifiedTradeSettlementHeaderMonetarySummation[1]/Q{urn:b}GrandTotalAmount[1]")!;
    expect(b).toMatchObject({ element: "GrandTotalAmount", fields: ["BT-112"] });
    expect(b.line).toBeUndefined();
    expect(describeLocation("")).toBeUndefined();
  });
  it("describePlaces limits long lists", () => {
    const g = { ruleId: "X", ruleSet: "s", severity: "error" as const, count: 3, message: "", fields: [], places: ["A", "B", "C"].map((e) => ({ element: e, path: e, xpath: e })) };
    expect(describePlaces(g, 2)).toBe("A, B, and 1 more");
  });
});
