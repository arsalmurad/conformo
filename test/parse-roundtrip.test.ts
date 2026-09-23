import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import type { Invoice } from '@invoice-engine/core';
import { buildCII, buildUBL } from '@invoice-engine/formats';
import { FIXTURES } from '../tools/fixtures.manifest.js';
import { detectXmlFormat, UnrecognizedFormatError } from '../packages/parse/src/index.js';
import { XmlSecurityError } from '../packages/parse/src/xml/parseXml.js';

// Every non-negative fixture, generate -> parse -> the result must equal the
// source model exactly. This is the phase's core proof: readCII()/readUBL()
// are the true inverse of buildCII()/buildUBL(), not just "close enough".
// Always built with the default (en16931) profile: xrechnung/peppol pin BT-23
// to a fixed URN regardless of the invoice's own businessProcess, which is a
// one-way transform by design, not something a reader could invert.
const fixtureFiles = FIXTURES.filter((f) => !f.negative).map((f) => f.file);

describe('round-trip: generate -> parse -> identical Invoice', () => {
  for (const file of fixtureFiles) {
    const invoice = JSON.parse(fs.readFileSync(path.join('fixtures', file), 'utf8')) as Invoice;
    const credit = invoice.typeCode === '381';

    it(`${file}: CII`, () => {
      const xml = buildCII(invoice);
      const result = detectXmlFormat(xml);
      expect(result.format).toBe('cii');
      expect(result.invoice).toEqual(invoice);
    });

    it(`${file}: UBL`, () => {
      const xml = buildUBL(invoice);
      const result = detectXmlFormat(xml);
      expect(result.format).toBe(credit ? 'ubl-credit-note' : 'ubl-invoice');
      expect(result.invoice).toEqual(invoice);
    });
  }
});

describe('detectXmlFormat(): format sniffing and security', () => {
  it('rejects a document that is neither CII nor UBL', () => {
    expect(() => detectXmlFormat('<Something xmlns="urn:not-an-invoice-format"/>')).toThrow(UnrecognizedFormatError);
  });

  it('rejects XXE at the format-detection level, not just the raw XML-parser level', () => {
    const xxe = `<?xml version="1.0"?>
      <!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
      <rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100">&xxe;</rsm:CrossIndustryInvoice>`;
    expect(() => detectXmlFormat(xxe)).toThrow(XmlSecurityError);
  });

  it('rejects a billion-laughs payload at the format-detection level', () => {
    const lol = `<?xml version="1.0"?>
      <!DOCTYPE lolz [
        <!ENTITY lol "lol">
        <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
      ]>
      <rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100">&lol1;</rsm:CrossIndustryInvoice>`;
    expect(() => detectXmlFormat(lol)).toThrow(XmlSecurityError);
  });
});
