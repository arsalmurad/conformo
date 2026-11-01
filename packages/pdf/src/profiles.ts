/**
 * Factur-X / ZUGFeRD profiles as they appear in a hybrid PDF: the fx:ConformanceLevel in the XMP packet and the
 * name of the embedded XML. Values follow the Factur-X 1.0.x / ZUGFeRD 2.x profile list and were cross-checked
 * against two independent implementations (the factur-x Python library and Mustangproject's ZUGFeRDExporter);
 * the FeRD specification text itself could not be fetched from the build environment (see docs/KNOWN-GAPS.md).
 *
 * Only the profiles Conformo can write are listed. MINIMUM and BASIC WL are deliberately absent: they are not EN 16931
 * invoices and are not accepted as e-invoices for German B2B (from 2027).
 */
export type FacturXProfile = 'en16931' | 'xrechnung' | 'extended';

export interface FacturXProfileMeta {
  /** fx:ConformanceLevel, exactly as written in the XMP packet. */
  conformanceLevel: string;
  /** fx:DocumentFileName and the attachment name. */
  xmlFilename: string;
  /** Name of the profile in ZUGFeRD 2.x terms, for messages. */
  zugferdName: string;
}

export const FACTURX_PROFILES: Record<FacturXProfile, FacturXProfileMeta> = {
  en16931: { conformanceLevel: 'EN 16931', xmlFilename: 'factur-x.xml', zugferdName: 'EN 16931 (COMFORT)' },
  xrechnung: { conformanceLevel: 'XRECHNUNG', xmlFilename: 'xrechnung.xml', zugferdName: 'XRECHNUNG' },
  extended: { conformanceLevel: 'EXTENDED', xmlFilename: 'factur-x.xml', zugferdName: 'EXTENDED' },
};
