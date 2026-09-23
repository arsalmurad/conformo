/**
 * Pulls the embedded Factur-X/ZUGFeRD XML back out of a PDF/A-3, the inverse
 * of packages/pdf/src/pdfa.ts's finalizePDFA(). Reads the catalog-level /AF
 * array directly rather than walking the /Names/EmbeddedFiles name tree:
 * pdf-lib itself writes /AF during save() (see the comment in pdfa.ts), and
 * every PDF this package needs to read was produced the same way, so /AF is
 * guaranteed present and is the shorter path to the same file.
 *
 * pdf-lib only (no node:fs, no Buffer): this must run in a browser, same as
 * the writer (CONTRIBUTING.md invariant 4).
 */
import { PDFArray, PDFDict, PDFName, PDFRawStream, PDFStream, PDFString, PDFHexString, decodePDFRawStream } from 'pdf-lib';
import { PDFDocument } from 'pdf-lib';

export class NoEmbeddedXmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoEmbeddedXmlError';
  }
}

export interface EmbeddedXmlFile {
  filename: string;
  xml: string;
}

function filespecFilename(spec: PDFDict): string {
  const uf = spec.lookup(PDFName.of('UF'));
  if (uf instanceof PDFHexString || uf instanceof PDFString) return uf.decodeText();
  const f = spec.lookup(PDFName.of('F'));
  if (f instanceof PDFHexString || f instanceof PDFString) return f.decodeText();
  return '';
}

/** Every /AF attachment as (filename, decoded text), not just the first. A
 * Factur-X PDF carries exactly one, but this makes the caller's own "is this
 * really the invoice XML" decision explicit rather than assumed here. */
export function listEmbeddedFiles(pdfDoc: PDFDocument): EmbeddedXmlFile[] {
  const af = pdfDoc.catalog.lookup(PDFName.of('AF'));
  if (!(af instanceof PDFArray)) return [];
  const files: EmbeddedXmlFile[] = [];
  for (let i = 0; i < af.size(); i++) {
    const spec = af.lookup(i, PDFDict);
    const ef = spec.lookup(PDFName.of('EF'), PDFDict);
    const stream = ef.lookup(PDFName.of('F'), PDFStream) as PDFRawStream;
    const bytes = decodePDFRawStream(stream).decode();
    files.push({ filename: filespecFilename(spec), xml: new TextDecoder().decode(bytes) });
  }
  return files;
}

/**
 * The one XML attachment recognizable as an invoice, by filename extension:
 * a Factur-X PDF can carry other attachments (e.g. a logo font is embedded
 * differently, but a supplier could still attach an unrelated PDF or image
 * as a second /AF entry), so this does not just grab files[0].
 */
export async function extractEmbeddedXml(pdfBytes: Uint8Array): Promise<EmbeddedXmlFile> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const files = listEmbeddedFiles(pdfDoc);
  const xmlFile = files.find((f) => f.filename.toLowerCase().endsWith('.xml'));
  if (!xmlFile) {
    throw new NoEmbeddedXmlError(
      files.length === 0
        ? 'This PDF has no embedded files (not a Factur-X/ZUGFeRD invoice).'
        : `This PDF has ${files.length} embedded file(s) but none is XML: ${files.map((f) => f.filename).join(', ')}`,
    );
  }
  return xmlFile;
}
