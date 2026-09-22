// XMP packet for PDF/A-3 + Factur-X. The pdfaExtension schema block is
// mandatory: validators reject the fx: namespace without a declaration.
//
// Every value interpolated into this packet is user-or-invoice-supplied and must
// be escaped: xmlFilename, conformanceLevel, documentType and version used to go
// in unescaped, so an invoice.number containing "&" or "<" (xmlFilename can be
// derived from it) would have produced unparseable XMP.
const x = (s: unknown): string => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// The xpacket header requires a literal U+FEFF (BOM) as part of its syntax, not as
// an encoding artifact. Written as an escape rather than a literal character in the
// source so an editor or a "normalize whitespace" pass cannot silently strip it.
const BOM = '﻿';

const prop = (name: string, desc: string): string => `
              <rdf:li rdf:parseType="Resource">
                <pdfaProperty:name>${name}</pdfaProperty:name>
                <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                <pdfaProperty:category>external</pdfaProperty:category>
                <pdfaProperty:description>${desc}</pdfaProperty:description>
              </rdf:li>`;

export interface XMPOptions {
  title: string; author: string; producer: string; creatorTool: string;
  createDate: string; xmlFilename?: string; conformanceLevel?: string;
  documentType?: string; version?: string; pdfaPart?: string; pdfaConformance?: string;
}

export function buildXMP({ title, author, producer, creatorTool, createDate,
                           xmlFilename = 'factur-x.xml', conformanceLevel = 'EN 16931',
                           documentType = 'INVOICE', version = '1.0',
                           pdfaPart = '3', pdfaConformance = 'B' }: XMPOptions): string {
  const d = x(createDate);
  return `<?xpacket begin="${BOM}" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>${x(pdfaPart)}</pdfaid:part>
      <pdfaid:conformance>${x(pdfaConformance)}</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${x(title)}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>${x(author)}</rdf:li></rdf:Seq></dc:creator>
      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${x(title)}</rdf:li></rdf:Alt></dc:description>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreatorTool>${x(creatorTool)}</xmp:CreatorTool>
      <xmp:CreateDate>${d}</xmp:CreateDate>
      <xmp:ModifyDate>${d}</xmp:ModifyDate>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdf:Producer>${x(producer)}</pdf:Producer>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
        xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
        xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>${prop('DocumentFileName','Name of the embedded XML invoice file')}${prop('DocumentType','INVOICE')}${prop('Version','The actual version of the Factur-X XML schema')}${prop('ConformanceLevel','The conformance level of the embedded XML')}
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <fx:DocumentType>${x(documentType)}</fx:DocumentType>
      <fx:DocumentFileName>${x(xmlFilename)}</fx:DocumentFileName>
      <fx:Version>${x(version)}</fx:Version>
      <fx:ConformanceLevel>${x(conformanceLevel)}</fx:ConformanceLevel>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}
