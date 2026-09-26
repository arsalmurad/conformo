/** A rule violation as reported by the Schematron, translated into a shape a
 * caller can render without knowing SVRL. */
export interface RuleResult {
  /** The Schematron rule id, e.g. "BR-CO-15" or "BR-FR-05". */
  ruleId: string;
  /** "error"/"fatal" fail the invoice; "warning"/"info" are advisory (matches
   * the Schematron @flag/@role convention: unflagged defaults to "error").
   * The EN 16931 Schematron only ever flags "warning"; French CTC flags
   * every one of its own assertions "fatal" — both are preserved as reported
   * rather than collapsed, since a caller may reasonably want to tell them
   * apart. */
  severity: "error" | "fatal" | "warning" | "info";
  /** Every BT-/BG- identifier mentioned in the rule's official message text,
   * in order of appearance. Empty when the rule text names none. */
  fields: string[];
  /** The XPath location of the offending node, as reported by the processor. */
  xpath: string;
  /** The official Schematron message text, verbatim. */
  message: string;
  /** Present only for the ~40 rules with a hand-written plain-language
   * translation (see src/messages). Absent otherwise: the caller falls back
   * to `message`. */
  plainLanguage?: PlainLanguageMessage;
}

export interface PlainLanguageMessage {
  /** One sentence: what the rule means, addressed to whoever prepared the
   * invoice (a freelancer, not a spec author). */
  summary: string;
  /** One or two sentences: why the rule exists. */
  why: string;
  /** One or two sentences: how to fix it. */
  fix: string;
}

/** Which ruleset(s) to run. "en16931" is the base EN 16931 semantic rules,
 * required for every profile; a country layer is additive on top of it.
 * Only the CII/Factur-X syntax is compiled today; a UBL profile throws
 * rather than silently skipping rules it cannot run. */
export interface ValidateOptions {
  profile?: "en16931";
  country?: "FR";
}

export interface ValidationResult {
  valid: boolean;
  firedCount: number;
  results: RuleResult[];
}

/** The subset of the SaxonJS API (identical between the `saxon-js` Node
 * package and the browser `SaxonJS2.rt.js` global) that validation needs. */
export interface SaxonJSLike {
  transform(
    options: { stylesheetText: string; sourceText: string; destination: "serialized" },
    mode: "async",
  ): Promise<{ principalResult: string }>;
}

/** A compiled Stylesheet Export File, as produced by `tools/compile-schematron.sh`.
 * Opaque to us: we only ever round-trip it through JSON.stringify into SaxonJS. */
export type CompiledSchematron = object;
