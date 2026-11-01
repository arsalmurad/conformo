import { createEngine } from "./engine.js";
import type { CompiledSchematron, SaxonJSLike, ValidateOptions, ValidationResult, XsdRunner } from "./types.js";

export type {
  RuleResult, PlainLanguageMessage, ValidateOptions, ValidationResult, SaxonJSLike, Syntax, Profile,
  DetectedDocument, RuleSetRun, XsdRun, Notice,
} from "./types.js";
export { ValidationInputError } from "./types.js";
export { detectDocument, profileFromCustomizationId } from "./detect.js";
export { planRulesets } from "./engine.js";

export interface BrowserValidatorOptions {
  /** The `SaxonJS` global left by loading `SaxonJS2.rt.js` (runtime-only build: see tools/fetch-artefacts.mjs). */
  saxonJs: SaxonJSLike;
  /** Returns a compiled rule set by id ("en16931-cii", "xrechnung-ubl", ...). Normally a `fetch` of a static file.
   * Called lazily and at most once per id, so a page only downloads the rule sets its documents need. */
  loadRuleset: (id: string) => Promise<CompiledSchematron | string>;
  /** Optional XSD runner. Without one, the result reports XSD as not run, with the reason. */
  xsd?: XsdRunner;
  xsdUnavailableReason?: string;
  info?: Record<string, { label: string; source: string }>;
  levelOverrides?: Record<string, Record<string, string>>;
}

/**
 * The browser entry point. Same engine as Node's `validate()`, so detection, rule-set selection and the
 * result shape are identical; only the loading of SaxonJS and of the compiled rule sets differs. This
 * module touches no `fs`, `fetch` or `document` itself.
 */
export function createBrowserValidator(options: BrowserValidatorOptions): (xml: string, o?: ValidateOptions) => Promise<ValidationResult> {
  const engine = createEngine({
    saxon: options.saxonJs,
    loadRuleset: options.loadRuleset,
    xsd: options.xsd,
    xsdUnavailableReason: options.xsdUnavailableReason ?? "XSD validation is not available in the browser build",
    info: options.info,
    levelOverrides: options.levelOverrides,
  });
  return (xml, o) => engine.validate(xml, o);
}
