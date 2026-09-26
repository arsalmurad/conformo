import { parseSvrl } from "./svrl.js";
import { getPlainLanguageMessage } from "./messages/index.js";
import type { CompiledSchematron, RuleResult, SaxonJSLike, ValidationResult } from "./types.js";

/** Is this a Factur-X/CII document? The only syntax whose Schematron is
 * compiled today (EN 16931 + French CTC, both CII). A UBL document — or any
 * non-invoice XML —
 * is rejected rather than silently validated against a Schematron that fires
 * zero rules against it and reports a false "valid".
 *
 * Lives here, not in src/index.ts, specifically so src/browser.ts calls the
 * exact same guard: it was originally Node-entry-only, which meant
 * validateInBrowser() — the code path the public validator page actually
 * runs — reported non-invoice XML as valid. Found by an independent review
 * that actually dropped a non-invoice file into the built validator page
 * rather than only reading the source. */
export function assertCii(xml: string): void {
  if (!/<(?:\w+:)?CrossIndustryInvoice\b/.test(xml)) {
    throw new Error(
      "This does not look like a Factur-X/CII invoice (no rsm:CrossIndustryInvoice root found). " +
        "UBL Schematron is not yet compiled to SEF.",
    );
  }
}

/** Runs one compiled Schematron ruleset against `xmlText` and returns
 * structured results with plain-language messages attached where we have
 * one. `saxonJs` is either the `saxon-js` Node package or the browser
 * `SaxonJS2.rt.js` global — both implement the same `.transform()` API,
 * which is what makes this function usable unmodified on both sides. */
export async function runSchematron(
  saxonJs: SaxonJSLike,
  xmlText: string,
  sef: CompiledSchematron,
): Promise<{ results: RuleResult[]; firedCount: number }> {
  const { principalResult } = await saxonJs.transform(
    {
      stylesheetText: JSON.stringify(sef),
      sourceText: xmlText,
      destination: "serialized",
    },
    "async",
  );
  const { results, firedCount } = parseSvrl(principalResult);
  for (const r of results) {
    r.plainLanguage = getPlainLanguageMessage(r.ruleId);
  }
  return { results, firedCount };
}

export function toValidationResult(runs: Array<{ results: RuleResult[]; firedCount: number }>): ValidationResult {
  const results = runs.flatMap((r) => r.results);
  const firedCount = runs.reduce((sum, r) => sum + r.firedCount, 0);
  return {
    valid: results.every((r) => r.severity !== "error" && r.severity !== "fatal"),
    firedCount,
    results,
  };
}
