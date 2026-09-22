import { parseSvrl } from "./svrl.js";
import { getPlainLanguageMessage } from "./messages/index.js";
import type { CompiledSchematron, RuleResult, SaxonJSLike, ValidationResult } from "./types.js";

/** Runs one compiled Schematron ruleset against `xmlText` and returns
 * structured results with plain-language messages attached where we have
 * one. `saxonJs` is either the `saxon-js` Node package or the browser
 * `SaxonJS2.rt.js` global — both implement the same `.transform()` API,
 * which is what makes this function usable unmodified on both sides
 * . */
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
