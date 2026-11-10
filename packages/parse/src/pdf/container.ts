/**
 * What a ZUGFeRD / Factur-X PDF says about itself in its XMP metadata, next to the name of the embedded XML file.
 * Reading only: nothing here validates or changes the PDF. pdf-lib only (no node:fs), so it runs in a browser too.
 *
 * The names, and where each was checked:
 *  - Factur-X 1.0 and ZUGFeRD 2.1 and later: XMP prefix `fx`, schema namespace
 *    `urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#`, properties DocumentFileName, DocumentType, Version,
 *    ConformanceLevel; embedded file `factur-x.xml` (`xrechnung.xml` for the XRechnung profile). Checked against the
 *    extension schema FNFE-MPE ships with its factur-x reference library (facturx/xmp/Factur-X_extension_schema.xmp in
 *    the factur-x release pinned in tools/artefacts.manifest.json) and against what packages/pdf writes.
 *  - ZUGFeRD 2.0: XMP prefix `zf`, namespace `urn:zugferd:pdfa:CrossIndustryDocument:invoice:2p0#`, Version `2p0`,
 *    embedded file `zugferd-invoice.xml`. Seen in a real PDF made by Mustangproject 2.24.0 and in the file names the
 *    factur-x library accepts (ZUGFERD_FILENAMES). The FeRD ZUGFeRD 2.0 specification text itself could not be
 *    retrieved when this was written, so these three values are not confirmed against it; the notice built from them
 *    only reports what the file contains and never says the file is wrong.
 *  - ZUGFeRD 1.0 (not EN 16931): `urn:ferd:pdfa:CrossIndustryDocument:invoice:1p0#`, file `ZUGFeRD-invoice.xml`
 *    (FNFE's wheel ships FeRD's ZUGFeRD_extension_schema.xmp). Reported by name only.
 */
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { listEmbeddedFiles } from './extractXml.js';

export interface PdfContainerInfo {
  /** Name of the embedded XML file that was read (first .xml attachment), if any. */
  embeddedFilename?: string;
  /** The ZUGFeRD / Factur-X extension schema found in the XMP packet, if any. */
  xmp?: {
    /** Namespace URI, e.g. "urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#". */
    namespace: string;
    /** Prefix it is declared with, e.g. "fx" or "zf". */
    prefix: string;
    /** The version token of the namespace, e.g. "1p0" or "2p0". */
    namespaceVersion: string;
    /** <prefix>:Version, e.g. "1.0" or "2p0". */
    version?: string;
    /** <prefix>:ConformanceLevel, e.g. "EN 16931", "BASIC", "XRECHNUNG". */
    conformanceLevel?: string;
    /** <prefix>:DocumentFileName. */
    documentFileName?: string;
    /** <prefix>:DocumentType. */
    documentType?: string;
  };
}

const NS = /xmlns:([A-Za-z][\w-]*)="((?:urn:[a-z-]+:pdfa:CrossIndustryDocument:invoice:)([0-9a-z]+)#)"/;

const decodeEntities = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Reads the XMP packet and the attachment list of a PDF. Never throws for a PDF without XMP: the fields are just absent. */
export async function inspectPdfContainer(pdfBytes: Uint8Array): Promise<PdfContainerInfo> {
  const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const out: PdfContainerInfo = {};
  const file = listEmbeddedFiles(doc).find((f) => f.filename.toLowerCase().endsWith('.xml'));
  if (file) out.embeddedFilename = file.filename;

  const md = doc.catalog.lookup(PDFName.of('Metadata'));
  if (!(md instanceof PDFRawStream)) return out;
  const xmp = new TextDecoder().decode(decodePDFRawStream(md).decode());
  const m = NS.exec(xmp);
  if (!m) return out;
  const prefix = m[1]!;
  const prop = (name: string): string | undefined => {
    const v = new RegExp(`<${prefix}:${name}>([^<]*)</${prefix}:${name}>`).exec(xmp)?.[1];
    return v === undefined ? undefined : decodeEntities(v).trim();
  };
  const version = prop('Version');
  const conformanceLevel = prop('ConformanceLevel');
  const documentFileName = prop('DocumentFileName');
  const documentType = prop('DocumentType');
  out.xmp = {
    namespace: m[2]!, prefix, namespaceVersion: m[3]!,
    ...(version !== undefined ? { version } : {}),
    ...(conformanceLevel !== undefined ? { conformanceLevel } : {}),
    ...(documentFileName !== undefined ? { documentFileName } : {}),
    ...(documentType !== undefined ? { documentType } : {}),
  };
  return out;
}
