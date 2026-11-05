import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { createPdf, validate, containerNotices } from "@conformo/toolkit";
import { inspectPdfContainer } from "@conformo/parse";
import type { Invoice } from "@conformo/core";

const fixture = (n: string): Invoice => JSON.parse(readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf-8")) as Invoice;

/**
 * A synthetic PDF written by our own writer, then rewritten to look like a ZUGFeRD 2.0 container (zf prefix, 2p0
 * namespace, zugferd-invoice.xml). Built here, not taken from anybody's file.
 */
async function legacyContainer(bytes: Uint8Array, opts: { level?: string; filename?: string } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const mdRef = doc.catalog.get(PDFName.of("Metadata"));
  const xmpStream = doc.context.lookup(mdRef) as unknown as { getContents(): Uint8Array };
  let xmp = new TextDecoder().decode(xmpStream.getContents());
  xmp = xmp.replaceAll("urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#", "urn:zugferd:pdfa:CrossIndustryDocument:invoice:2p0#")
    .replaceAll("fx:", "zf:").replaceAll("xmlns:fx=", "xmlns:zf=").replaceAll("<zf:Version>1.0</zf:Version>", "<zf:Version>2p0</zf:Version>")
    .replace(/<zf:DocumentFileName>[^<]*</, "<zf:DocumentFileName>zugferd-invoice.xml<");
  if (opts.level) xmp = xmp.replace(/<zf:ConformanceLevel>[^<]*</, `<zf:ConformanceLevel>${opts.level}<`);
  const ref = doc.context.register(doc.context.stream(new TextEncoder().encode(xmp), { Type: "Metadata", Subtype: "XML" }));
  doc.catalog.set(PDFName.of("Metadata"), ref);
  const af = doc.catalog.lookup(PDFName.of("AF")) as PDFArray;
  const spec = af.lookup(0, PDFDict);
  const name = opts.filename ?? "zugferd-invoice.xml";
  spec.set(PDFName.of("F"), PDFString.of(name));
  spec.set(PDFName.of("UF"), PDFString.of(name));
  return doc.save({ useObjectStreams: false });
}

describe("PDF container notices", () => {
  it("a Factur-X PDF from our writer: one informational notice naming the fx schema, nothing else", async () => {
    const { pdf } = await createPdf(fixture("sample-invoice.json"));
    const info = await inspectPdfContainer(pdf);
    expect(info.embeddedFilename).toBe("factur-x.xml");
    expect(info.xmp).toMatchObject({ prefix: "fx", namespaceVersion: "1p0", version: "1.0", conformanceLevel: "EN 16931", documentFileName: "factur-x.xml" });
    const r = await validate(pdf);
    expect(r.valid).toBe(true);
    const n = r.notices.filter((x) => x.code.startsWith("PDF-"));
    expect(n.map((x) => x.code)).toEqual(["PDF-CONTAINER"]);
    expect(n[0]!.severity).toBe("info");
    expect(n[0]!.message).toContain("urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#");
    expect(n[0]!.message).not.toMatch(/ZUGFeRD 2\.1 and later/); // nothing to explain for the current container
  });

  it("the XRechnung profile embeds xrechnung.xml and raises nothing", async () => {
    const { pdf } = await createPdf(fixture("xrechnung-public-sector.json"), { profile: "xrechnung" });
    const r = await validate(pdf);
    expect(r.notices.filter((x) => x.code.startsWith("PDF-")).map((x) => x.code)).toEqual(["PDF-CONTAINER"]);
  });

  it("a ZUGFeRD 2.0 container is read, named, and explained, and stays valid", async () => {
    const { pdf } = await createPdf(fixture("sample-invoice.json"));
    const legacy = await legacyContainer(pdf);
    const r = await validate(legacy);
    expect(r.valid).toBe(true);
    expect(r.embeddedFilename).toBe("zugferd-invoice.xml");
    const n = r.notices.find((x) => x.code === "PDF-CONTAINER")!;
    expect(n.severity).toBe("info");
    expect(n.message).toContain('"zugferd-invoice.xml"');
    expect(n.message).toContain("urn:zugferd:pdfa:CrossIndustryDocument:invoice:2p0#");
    expect(n.message).toMatch(/prefix zf, namespace version 2p0/);
    expect(n.message).toMatch(/ZUGFeRD 2\.1 and later, and Factur-X, use factur-x\.xml \(xrechnung\.xml for the XRechnung profile\) with the fx schema/);
    expect(r.notices.filter((x) => x.code.startsWith("PDF-") && x.code !== "PDF-CONTAINER")).toEqual([]);
    expect(r.notices.some((x) => x.severity === "error")).toBe(false);
  });

  it("flags a ConformanceLevel that disagrees with BT-24 as a warning that does not change the verdict", async () => {
    const { pdf } = await createPdf(fixture("sample-invoice.json"));
    const r = await validate(await legacyContainer(pdf, { level: "BASIC" }));
    const n = r.notices.find((x) => x.code === "PDF-CONFORMANCE-MISMATCH")!;
    expect(n.severity).toBe("warning");
    expect(n.message).toContain('"BASIC"');
    expect(r.valid).toBe(true);
  });

  it("flags an embedded file name that does not fit the profile, and one that differs from the XMP DocumentFileName", async () => {
    const { pdf } = await createPdf(fixture("sample-invoice.json"));
    const r = await validate(await legacyContainer(pdf, { filename: "xrechnung.xml" }));
    expect(r.notices.map((x) => x.code)).toEqual(expect.arrayContaining(["PDF-FILENAME-PROFILE", "PDF-FILENAME-XMP"]));
    expect(r.valid).toBe(true);
  });
});

describe("containerNotices (pure)", () => {
  const detected = (customizationId: string, profile: "en16931" | "xrechnung" | "extended" | "minimum" | "basicwl") =>
    ({ syntax: "cii", profile, customizationId }) as never;
  const xmp = (conformanceLevel: string) => ({ namespace: "urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#", prefix: "fx", namespaceVersion: "1p0", conformanceLevel });

  it("accepts the level names each profile is written with", () => {
    const ok = (level: string, id: string, p: Parameters<typeof detected>[1]) =>
      containerNotices({ embeddedFilename: "factur-x.xml", xmp: xmp(level) }, detected(id, p)).some((n) => n.code === "PDF-CONFORMANCE-MISMATCH");
    expect(ok("EN 16931", "urn:cen.eu:en16931:2017", "en16931")).toBe(false);
    expect(ok("COMFORT", "urn:cen.eu:en16931:2017", "en16931")).toBe(false);
    expect(ok("BASIC", "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic", "en16931")).toBe(false);
    expect(ok("BASIC WL", "urn:factur-x.eu:1p0:basicwl", "basicwl")).toBe(false);
    expect(ok("EXTENDED", "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended", "extended")).toBe(false);
    expect(ok("XRECHNUNG", "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0", "xrechnung")).toBe(false);
    expect(ok("EN 16931", "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic", "en16931")).toBe(true);
  });

  it("says nothing about a PDF with neither XMP schema nor attachment", () => {
    expect(containerNotices({}, detected("urn:cen.eu:en16931:2017", "en16931"))).toEqual([]);
  });
});
