export interface XmlAttribute {
  /** Local name, e.g. "schemeID" — the prefix (if any) is stripped, matching
   * how every reader in this package looks attributes up (by meaning, never
   * by which prefix a particular sender's software happened to choose). */
  name: string;
  value: string;
}

export interface XmlElement {
  type: 'element';
  /** Local name without prefix, e.g. "CrossIndustryInvoice". */
  name: string;
  /** Resolved namespace URI, if any xmlns declaration was in scope. This,
   * not the prefix, is an element's real identity in XML — two documents
   * using different prefixes for the same namespace are the same document
   * as far as every reader here is concerned. */
  namespaceURI?: string;
  attributes: XmlAttribute[];
  children: XmlNode[];
}

export interface XmlText {
  type: 'text';
  value: string;
}

export type XmlNode = XmlElement | XmlText;

export class XmlSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XmlSecurityError';
  }
}

export class XmlSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XmlSyntaxError';
  }
}
