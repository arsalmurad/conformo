import type { PdfContainerInfo } from '@conformo/parse';
import type { DetectedDocument, Notice } from '@conformo/validate';

/** XMP ConformanceLevel values a profile may carry, compared without case, spaces and hyphens. EN 16931 has been written as "EN 16931" and as "COMFORT". */
function expectedLevels(d: DetectedDocument): string[] | undefined {
  const id = (d.customizationId ?? '').toLowerCase();
  if (d.profile === 'xrechnung' || id.includes('xrechnung')) return ['XRECHNUNG'];
  if (/[:#]minimum$/.test(id)) return ['MINIMUM'];
  if (/[:#]basicwl$/.test(id)) return ['BASICWL'];
  if (/[:#]basic$/.test(id)) return ['BASIC'];
  if (/[:#]extended$/.test(id)) return ['EXTENDED'];
  if (d.profile === 'en16931') return ['EN16931', 'COMFORT'];
  return undefined;
}
const norm = (s: string): string => s.toUpperCase().replace(/[\s-]/g, '');

const LEGACY_NAMES = ['zugferd-invoice.xml'];

/**
 * Notices about the PDF container of a ZUGFeRD / Factur-X invoice: what was found, and where the XMP metadata, the
 * embedded file name and the profile named in the XML disagree. Informational: none of them is an error and none changes
 * `valid`. They say what the file contains, not whether anybody will accept it.
 */
export function containerNotices(info: PdfContainerInfo, detected: DetectedDocument): Notice[] {
  const out: Notice[] = [];
  const name = info.embeddedFilename;
  const x = info.xmp;

  if (x) {
    const legacy = x.prefix !== 'fx' || x.namespaceVersion !== '1p0' || (name !== undefined && LEGACY_NAMES.includes(name.toLowerCase()));
    out.push({
      severity: 'info', code: 'PDF-CONTAINER',
      message: `PDF container: embedded file ${name ? `"${name}"` : '(none)'}, XMP schema ${x.namespace} (prefix ${x.prefix}, namespace version ${x.namespaceVersion}${x.version ? `, Version ${x.version}` : ''}${x.conformanceLevel ? `, ConformanceLevel ${x.conformanceLevel}` : ''}).`
        + (legacy ? ' ZUGFeRD 2.1 and later, and Factur-X, use factur-x.xml (xrechnung.xml for the XRechnung profile) with the fx schema, namespace urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#. Conformo reads both containers.' : ''),
    });
  } else if (name) {
    out.push({ severity: 'info', code: 'PDF-CONTAINER', message: `PDF container: embedded file "${name}"; no ZUGFeRD / Factur-X XMP extension schema was found in the PDF metadata.` });
  }

  const want = expectedLevels(detected);
  if (x?.conformanceLevel && want && !want.includes(norm(x.conformanceLevel))) {
    out.push({
      severity: 'warning', code: 'PDF-CONFORMANCE-MISMATCH',
      message: `The PDF metadata says ConformanceLevel "${x.conformanceLevel}", but the XML's specification identifier (BT-24) points to ${want.join(' / ')}${detected.customizationId ? ` ("${detected.customizationId}")` : ''}.`,
    });
  }

  if (name) {
    const lower = name.toLowerCase();
    const isXr = detected.profile === 'xrechnung';
    const fits = isXr ? lower === 'xrechnung.xml' : lower === 'factur-x.xml' || LEGACY_NAMES.includes(lower);
    if (!fits) {
      out.push({
        severity: 'warning', code: 'PDF-FILENAME-PROFILE',
        message: `The embedded file is named "${name}"; the profile in the XML is ${isXr ? 'XRechnung, which is embedded as xrechnung.xml' : `${detected.profile}, which is embedded as factur-x.xml (zugferd-invoice.xml in ZUGFeRD 2.0)`}.`,
      });
    }
    if (x?.documentFileName && x.documentFileName.toLowerCase() !== lower) {
      out.push({
        severity: 'warning', code: 'PDF-FILENAME-XMP',
        message: `The PDF metadata names the embedded file "${x.documentFileName}", but the file embedded is "${name}".`,
      });
    }
  }
  return out;
}
