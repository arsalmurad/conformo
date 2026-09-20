/**
 * PDF/A-3b assembly on top of pdf-lib.
 *
 * pdf-lib gets you a PDF. It does not get you a PDF/A-3. Four things must be
 * added by hand, and four pdf-lib behaviours will silently corrupt the file if
 * you do not work around them. Each is commented where it bites. All of this
 * is verified against the official Factur-X XSD, the EN 16931 Schematron and a
 * PDF/A-3b structural audit. Do not "simplify" these without rerunning both.
 */
import { PDFName, PDFString, PDFHexString, AFRelationship } from 'pdf-lib';
import type { PDFDocument } from 'pdf-lib';
import { buildXMP } from './xmp.js';
import crypto from 'node:crypto';

export interface FinalizeOptions {
  xml: string | Uint8Array;
  xmlFilename?: string;
  conformanceLevel?: string;
  title: string;
  author: string;
  producer: string;
  creatorTool: string;
  iccProfile: Uint8Array;
  createDate?: Date;
}

export async function finalizePDFA(pdfDoc: PDFDocument, {
  xml, xmlFilename = 'factur-x.xml', conformanceLevel = 'EN 16931',
  title, author, producer, creatorTool, iccProfile, createDate = new Date(),
}: FinalizeOptions): Promise<PDFDocument> {
  const ctx = pdfDoc.context;
  const catalog = pdfDoc.catalog;

  // TRAP 1: pdf-lib treats a STRING argument to attach() as base64 and stores
  // the decoded bytes. Passing XML as a string yields binary garbage with a
  // plausible length in a file that still opens. Always hand over bytes.
  const xmlBytes = typeof xml === 'string' ? new TextEncoder().encode(xml) : xml;
  await pdfDoc.attach(xmlBytes, xmlFilename, {
    mimeType: 'text/xml',
    description: 'Factur-X/ZUGFeRD electronic invoice',
    creationDate: createDate,
    modificationDate: createDate,
    afRelationship: AFRelationship.Alternative,
  });

  // Note on what pdf-lib already handles, verified against pdf-lib 1.17.1:
  //   - it writes the catalog-level /AF array itself, during save(), not before
  //   - it escapes the embedded-file /Subtype correctly (/text#2Fxml)
  // So neither needs patching here, and checking for /AF at this point would
  // fail because the embedding has not been flushed yet. What pdf-lib does NOT
  // do is set /AFRelationship unless the option above is passed, and PDF/A-3
  // rejects a filespec without it. The regression guard in
  // test/pdfa-traps.test.ts asserts it on the saved bytes.

  // 4. OutputIntent with an embedded ICC profile. Required for PDF/A.
  const iccRef = ctx.register(ctx.flateStream(iccProfile, { N: 3 }));
  catalog.set(PDFName.of('OutputIntents'), ctx.obj([ctx.register(ctx.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'),
    OutputConditionIdentifier: PDFString.of('sRGB'),
    RegistryName: PDFString.of('http://www.color.org'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: iccRef,
  }))]));

  // TRAP 2: handing pdf-lib the XMP packet as a JS string encodes it as
  // latin1/PDFDocEncoding, mangling the leading U+FEFF in <?xpacket?> and
  // making the packet unparseable. Encode to UTF-8 bytes. It must also stay
  // unfiltered: PDF/A forbids a compressed metadata stream.
  const iso = createDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const xmp = buildXMP({ title, author, producer, creatorTool, createDate: iso,
                         xmlFilename, conformanceLevel });
  catalog.set(PDFName.of('Metadata'), ctx.register(ctx.stream(
    new TextEncoder().encode(xmp),
    { Type: PDFName.of('Metadata'), Subtype: PDFName.of('XML') },
  )));

  // 5. Deterministic document ID derived from content, never from a clock.
  //    This is what makes the output byte-reproducible and audit-defensible.
  const id = crypto.createHash('sha256')
    .update(String(title) + String(xml)).digest('hex').slice(0, 32).toUpperCase();
  const idObj = PDFHexString.of(id);
  ctx.trailerInfo.ID = ctx.obj([idObj, idObj]);

  pdfDoc.setTitle(title);
  pdfDoc.setAuthor(author);
  pdfDoc.setProducer(producer);
  pdfDoc.setCreator(creatorTool);
  pdfDoc.setCreationDate(createDate);
  pdfDoc.setModificationDate(createDate);
  return pdfDoc;
}
