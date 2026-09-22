import { runSchematron, toValidationResult } from "./core.js";
import type { CompiledSchematron, SaxonJSLike, ValidationResult } from "./types.js";

export type { RuleResult, PlainLanguageMessage, ValidationResult } from "./types.js";

/** The browser entry point. Takes the `SaxonJS` global left by loading
 * `SaxonJS2.rt.js` (the free runtime-only build — no compiler, no Node
 * built-ins: see tools/fetch-saxonjs.mjs) and the already-fetched SEF
 * artefacts as parsed JSON, so this module never touches `fetch`, `fs`, or
 * any other environment-specific API itself. No server involved: the caller
 * fetched the SEF as a static file, same as any other page asset.
 *
 * Deliberately separate from src/index.ts, which imports the Node `saxon-js`
 * package directly — that import alone would break a browser bundle. */
export async function validateInBrowser(
  saxonJs: SaxonJSLike,
  xml: string,
  en16931: CompiledSchematron,
  frCtc?: CompiledSchematron,
): Promise<ValidationResult> {
  const runs = [await runSchematron(saxonJs, xml, en16931)];
  if (frCtc) runs.push(await runSchematron(saxonJs, xml, frCtc));
  return toValidationResult(runs);
}
