import { describe, it, expect } from "vitest";
import { explainRule, validate } from "@conformo/toolkit";

// Synthetic Factur-X MINIMUM and BASIC WL documents. Conformo runs no Schematron for these profiles, only the XSD, so
// the verdict is the XSD result. A schema failure used to leave `valid: false` with nothing in results or notices.
const NS = 'xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"';
const VAT = "<ram:ApplicableTradeTax><ram:CalculatedAmount>451.89</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>2465.50</ram:BasisAmount><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>19</ram:RateApplicablePercent></ram:ApplicableTradeTax>";
const LINE = "<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument><ram:LineID>1</ram:LineID></ram:AssociatedDocumentLineDocument></ram:IncludedSupplyChainTradeLineItem>";

function doc(profile: "minimum" | "basicwl", opts: { vat?: boolean; line?: boolean } = {}): string {
  const id = `urn:factur-x.eu:1p0:${profile}`;
  const vat = opts.vat ?? profile === "basicwl";
  return `<?xml version="1.0" encoding="UTF-8"?><rsm:CrossIndustryInvoice ${NS}><rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${id}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext><rsm:ExchangedDocument><ram:ID>2026-0815</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">20260914</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument><rsm:SupplyChainTradeTransaction>${opts.line ? LINE : ""}<ram:ApplicableHeaderTradeAgreement><ram:BuyerReference>04011000-1234512345-06</ram:BuyerReference><ram:SellerTradeParty><ram:Name>Ingenieurbuero Beispiel</ram:Name><ram:PostalTradeAddress><ram:CountryID>DE</ram:CountryID></ram:PostalTradeAddress><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">DE111222333</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTradeParty><ram:BuyerTradeParty><ram:Name>Landesamt fuer Beispielwesen</ram:Name></ram:BuyerTradeParty></ram:ApplicableHeaderTradeAgreement><ram:ApplicableHeaderTradeDelivery/><ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>${vat ? VAT : ""}<ram:SpecifiedTradeSettlementHeaderMonetarySummation>${profile === "basicwl" ? "<ram:LineTotalAmount>2465.50</ram:LineTotalAmount>" : ""}<ram:TaxBasisTotalAmount>2465.50</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">451.89</ram:TaxTotalAmount><ram:GrandTotalAmount>2917.39</ram:GrandTotalAmount><ram:DuePayableAmount>2917.39</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>`;
}

describe("Factur-X MINIMUM and BASIC WL: XSD only, said plainly, and never an unexplained false", () => {
  for (const profile of ["minimum", "basicwl"] as const) {
    it(`${profile}: a document that passes the XSD is valid, with a notice that only the XSD ran`, async () => {
      const r = await validate(doc(profile));
      expect(r.xsd).toMatchObject({ ran: true, valid: true });
      expect(r.ruleSets).toEqual([]);
      expect(r.valid).toBe(true);
      const n = r.notices.find((x) => x.code === "PROFILE-XSD-ONLY");
      expect(n?.severity).toBe("info");
      expect(n?.message).toMatch(/No official Schematron was run/);
      expect(n?.message).toMatch(/only the XML schema \(XSD\) was checked/);
      expect(r.notices.map((x) => x.code)).not.toContain("XSD-INVALID");
    });
  }

  it("minimum: a line item breaks the schema, and the false verdict carries an error entry that says why", async () => {
    const r = await validate(doc("minimum", { line: true }));
    expect(r.xsd.valid).toBe(false);
    expect(r.valid).toBe(false);
    const n = r.notices.find((x) => x.code === "XSD-INVALID");
    expect(n?.severity).toBe("error");
    expect(n?.message).toContain("IncludedSupplyChainTradeLineItem");
    expect(r.notices.map((x) => x.code)).toContain("PROFILE-XSD-ONLY");
    expect(r.summary?.text).toMatch(/the XML schema check failed; 1 Conformo check failed \(XSD-INVALID\)\.$/);
  });

  it("basicwl: a missing VAT breakdown breaks the schema, with the same entry", async () => {
    const r = await validate(doc("basicwl", { vat: false }));
    expect(r.valid).toBe(false);
    expect(r.notices.find((x) => x.code === "XSD-INVALID")?.message).toMatch(/ApplicableTradeTax|SpecifiedTradeSettlementHeaderMonetarySummation/);
  });

  it("with country DE the profile is rejected by an explicit error notice", async () => {
    const r = await validate(doc("minimum"), { country: "DE" });
    expect(r.valid).toBe(false);
    expect(r.notices.find((x) => x.code === "NOT-EN16931")?.severity).toBe("error");
  });

  it("the verdict follows the XSD when the XSD is switched off: nothing to fail, but the notice still says XSD only", async () => {
    const r = await validate(doc("minimum", { line: true }), { xsd: false });
    expect(r.xsd.ran).toBe(false);
    expect(r.notices.map((x) => x.code)).toContain("PROFILE-XSD-ONLY");
    expect(r.notices.map((x) => x.code)).not.toContain("XSD-INVALID");
  });

  it("both new notice codes are explained", () => {
    for (const code of ["XSD-INVALID", "PROFILE-XSD-ONLY"]) {
      const e = explainRule(code);
      expect(e.found, code).toBe(true);
      expect(e.plainLanguage?.fix, code).toBeTruthy();
    }
  });
});
