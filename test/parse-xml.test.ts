import { describe, it, expect } from "vitest";
import { parseXml, XmlSecurityError, XmlSyntaxError } from "../packages/parse/src/xml/parseXml.js";
import { child, children, text, attr, descend } from "../packages/parse/src/xml/query.js";

describe("parseXml(): correctness on well-formed, realistic invoice XML", () => {
  it("parses a namespaced document and resolves elements by namespace URI, not prefix", () => {
    const root = parseXml(
      '<rsm:Invoice xmlns:rsm="urn:test:rsm" xmlns:ram="urn:test:ram"><ram:ID>INV-1</ram:ID></rsm:Invoice>',
    );
    expect(root.name).toBe("Invoice");
    expect(root.namespaceURI).toBe("urn:test:rsm");
    const id = child(root, "ID", "urn:test:ram");
    expect(text(id)).toBe("INV-1");
  });

  it("resolves the same document correctly even with different prefix choices", () => {
    // Same URIs, different (legal) prefix names — a real sender's choice.
    const root = parseXml('<x:Invoice xmlns:x="urn:test:rsm" xmlns:y="urn:test:ram"><y:ID>INV-1</y:ID></x:Invoice>');
    expect(text(child(root, "ID", "urn:test:ram"))).toBe("INV-1");
  });

  it("handles a default (unprefixed) namespace", () => {
    const root = parseXml('<Invoice xmlns="urn:test:rsm"><ID xmlns="urn:test:rsm">INV-1</ID></Invoice>');
    expect(root.namespaceURI).toBe("urn:test:rsm");
    expect(text(child(root, "ID", "urn:test:rsm"))).toBe("INV-1");
  });

  it("handles self-closing (empty) elements, exactly what packages/formats emits for mandatory-but-empty groups", () => {
    const root = parseXml("<a><b/><c></c></a>");
    expect(children(root, "b")).toHaveLength(1);
    expect(text(child(root, "b"))).toBeUndefined();
  });

  it("decodes the five predefined entities and numeric character references", () => {
    const root = parseXml("<a>A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos; &#65; &#x42;</a>");
    expect(text(root)).toBe('A & B <C> "D" \'E\' A B');
  });

  it("reads attributes by local name, ignoring any prefix", () => {
    const root = parseXml('<a xmlns:x="urn:x"><x:ID x:schemeID="0002">123</x:ID></a>');
    expect(attr(child(root, "ID"), "schemeID")).toBe("0002");
  });

  it("skips comments and processing instructions", () => {
    const root = parseXml('<?xml version="1.0"?><!-- a comment --><a><!-- inner --><b>1</b></a>');
    expect(text(child(root, "b"))).toBe("1");
  });

  it("treats a CDATA section as plain text content", () => {
    const root = parseXml("<a><![CDATA[<not-a-tag> & raw]]></a>");
    expect(text(root)).toBe("<not-a-tag> & raw");
  });

  it("round-trips a realistic small CII-shaped fragment via descend()", () => {
    const xml =
      '<rsm:CrossIndustryInvoice xmlns:rsm="urn:rsm" xmlns:ram="urn:ram">' +
      "<rsm:ExchangedDocument><ram:ID>INV-42</ram:ID></rsm:ExchangedDocument>" +
      "</rsm:CrossIndustryInvoice>";
    const root = parseXml(xml);
    const id = descend(root, "ExchangedDocument", "ID");
    expect(text(id)).toBe("INV-42");
  });

  it("rejects malformed XML (mismatched end tag) rather than guessing", () => {
    expect(() => parseXml("<a><b></c></a>")).toThrow(XmlSyntaxError);
  });
});

describe("parseXml(): security — the exact attack shapes the project's own conventions names", () => {
  it("rejects a DOCTYPE with an XXE external-entity payload", () => {
    const xxe = `<?xml version="1.0"?>
      <!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
      <a>&xxe;</a>`;
    expect(() => parseXml(xxe)).toThrow(XmlSecurityError);
  });

  it("rejects a billion-laughs entity-expansion payload", () => {
    const lol = `<?xml version="1.0"?>
      <!DOCTYPE lolz [
        <!ENTITY lol "lol">
        <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
        <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">
      ]>
      <a>&lol2;</a>`;
    expect(() => parseXml(lol)).toThrow(XmlSecurityError);
  });

  it("rejects a DOCTYPE with no ENTITY at all (still refused — invoices never need one)", () => {
    expect(() => parseXml('<!DOCTYPE a SYSTEM "http://example.com/evil.dtd"><a/>')).toThrow(XmlSecurityError);
  });

  it("caps total input size before parsing", () => {
    const huge = `<a>${"x".repeat(1000)}</a>`;
    expect(() => parseXml(huge, { maxBytes: 100 })).toThrow(XmlSecurityError);
  });

  it("caps element nesting depth", () => {
    const deep = "<a>".repeat(50) + "x" + "</a>".repeat(50);
    expect(() => parseXml(deep, { maxDepth: 10 })).toThrow(XmlSecurityError);
  });

  it("caps total node count (defends against many-tiny-elements, not just deep nesting)", () => {
    const wide = "<a>" + "<b/>".repeat(1000) + "</a>";
    expect(() => parseXml(wide, { maxNodes: 100 })).toThrow(XmlSecurityError);
  });

  it("a real invoice-sized document parses fine under the default limits", () => {
    const xml =
      '<rsm:CrossIndustryInvoice xmlns:rsm="urn:rsm" xmlns:ram="urn:ram">' +
      "<ram:ID>INV-1</ram:ID>".repeat(50) +
      "</rsm:CrossIndustryInvoice>";
    expect(() => parseXml(xml)).not.toThrow();
  });
});
