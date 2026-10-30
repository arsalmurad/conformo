/** A rule violation as reported by the Schematron, translated into a shape a
 * caller can render without knowing SVRL. */
export interface RuleResult {
  /** The Schematron rule id, e.g. "BR-CO-15" or "BR-FR-05". */
  ruleId: string;
  /** "error"/"fatal" fail the invoice; "warning"/"info" are advisory (matches
   * the Schematron @flag/@role convention: unflagged defaults to "error"). */
  severity: "error" | "fatal" | "warning" | "info";
  /** Every BT-/BG- identifier mentioned in the rule's official message text, in order of appearance. */
  fields: string[];
  /** The XPath location of the offending node, as reported by the processor. */
  xpath: string;
  /** The official Schematron message text, verbatim (machine prefix stripped). */
  message: string;
  /** Set when the publisher's validator configuration re-levels this rule for the document's profile
   * (e.g. KoSIT downgrades BR-CL-21 for XRechnung). `severity` is then the effective level and this is
   * what the Schematron itself says. */
  originalSeverity?: "error" | "fatal" | "warning" | "info";
  /** Which rule set produced this result, a key of RULESETS, e.g. "en16931-ubl" or "xrechnung-cii". */
  ruleSet: string;
  /** Present only for rules with a hand-written plain-language translation (see src/messages). */
  plainLanguage?: PlainLanguageMessage;
}

export interface PlainLanguageMessage {
  /** One sentence: what the rule means, addressed to whoever prepared the invoice. */
  summary: string;
  /** One or two sentences: why the rule exists. */
  why: string;
  /** One or two sentences: how to fix it. */
  fix: string;
}

/** XML syntax of the document, decided from its root element. */
export type Syntax = "cii" | "ubl-invoice" | "ubl-creditnote";

/** The specification a document declares in BT-24, reduced to what decides the rule sets. */
export type Profile =
  | "en16931"          // plain EN 16931, also ZUGFeRD/Factur-X COMFORT and BASIC
  | "xrechnung"        // XRechnung 3.x, including the extension and CVD flavours
  | "peppol"           // Peppol BIS Billing 3.0
  | "extended"         // Factur-X / ZUGFeRD EXTENDED (a superset of EN 16931, not EN 16931 itself)
  | "minimum"          // Factur-X / ZUGFeRD MINIMUM: not an EN 16931 invoice
  | "basicwl"          // Factur-X / ZUGFeRD BASIC WL: not an EN 16931 invoice
  | "unknown";

/** What the validator found out about the document before choosing rule sets. */
export interface DetectedDocument {
  syntax: Syntax;
  /** BT-24, verbatim, when present. */
  customizationId?: string;
  /** BT-23, verbatim, when present. */
  businessProcess?: string;
  profile: Profile;
  /** For XRechnung: the flavour named in BT-24, which selects KoSIT's severity table. */
  variant?: "standard" | "extension" | "cvd";
}

/** What `validate()` was asked for. All optional: the default is "work it out from the document". */
export interface ValidateOptions {
  /** Force the profile instead of reading it from BT-24. */
  profile?: "en16931" | "xrechnung" | "peppol";
  /** Add a country layer. FR adds the French CTC rules (CII only). DE reports whether the profile
   * is acceptable for German B2B e-invoicing (MINIMUM and BASIC WL are not). */
  country?: "FR" | "DE";
  /** Run XSD validation as well (default true). */
  xsd?: boolean;
}

/** One rule set that was executed against the document. */
export interface RuleSetRun {
  id: string;
  label: string;
  /** Publisher and version, e.g. "CEN eInvoicing-EN16931 validation-1.3.17". */
  source: string;
  /** How many Schematron rules fired (matched a context). */
  fired: number;
  failed: number;
  advisory: number;
}

export interface XsdRun {
  ran: boolean;
  /** Which schema, e.g. "UBL 2.1 Invoice" or "CII D16B". */
  schema?: string;
  valid?: boolean;
  errors: string[];
  /** Why XSD did not run, when `ran` is false. */
  skippedReason?: string;
}

/** A finding that is not a Schematron rule: e.g. "this profile is not accepted for German B2B". */
export interface Notice {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
}

export interface ValidationResult {
  /** True only if no Schematron rule of severity error/fatal failed, XSD (if it ran) passed,
   * and no error-severity notice was raised. */
  valid: boolean;
  /** Total Schematron rules that fired across every rule set that ran. */
  firedCount: number;
  results: RuleResult[];
  detected: DetectedDocument;
  /** Exactly the rule sets that ran, in order. */
  ruleSets: RuleSetRun[];
  xsd: XsdRun;
  notices: Notice[];
}

/** The subset of the SaxonJS API (identical between the `saxon-js` Node package and the browser
 * `SaxonJS2.rt.js` global) that validation needs. */
export interface SaxonJSLike {
  transform(
    options: { stylesheetText: string; sourceText: string; destination: "serialized" },
    mode: "async",
  ): Promise<{ principalResult: string }>;
}

/** A compiled Stylesheet Export File. Opaque: we only round-trip it through JSON.stringify into SaxonJS. */
export type CompiledSchematron = object;

/** How the engine gets a compiled rule set (file read in Node, fetch in a browser). */
export type RulesetLoader = (id: string) => Promise<CompiledSchematron | string>;

/** Runs XSD validation. Implemented per platform. */
export interface XsdRunner {
  validate(
    syntax: Syntax,
    profile: Profile,
    xml: string,
  ): Promise<{ schema: string; valid: boolean; errors: string[] }>;
}

/** Thrown when the input cannot be validated at all (not XML, or not a supported invoice syntax). */
export class ValidationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationInputError";
  }
}
