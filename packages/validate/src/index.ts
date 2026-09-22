import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import SaxonJS from "saxon-js";
import { runSchematron, toValidationResult } from "./core.js";
import type { CompiledSchematron, ValidateOptions, ValidationResult } from "./types.js";

export type { RuleResult, PlainLanguageMessage, ValidateOptions, ValidationResult, SaxonJSLike } from "./types.js";
export { getPlainLanguageMessage } from "./messages/index.js";

const artefactsDir = fileURLToPath(new URL("../artefacts/", import.meta.url));
const sefCache = new Map<string, CompiledSchematron>();

function loadSef(name: string): CompiledSchematron {
  const cached = sefCache.get(name);
  if (cached) return cached;
  const path = `${artefactsDir}${name}.sef.json`;
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    throw new Error(
      `Missing compiled Schematron artefact "${name}.sef.json". Run: npm run schematron:compile`,
    );
  }
  const sef = JSON.parse(text) as CompiledSchematron;
  sefCache.set(name, sef);
  return sef;
}

/** Is this a Factur-X/CII document? The only syntax whose Schematron is
 * compiled today . A UBL document is rejected rather than
 * silently validated against nothing. */
function assertCii(xml: string): void {
  if (!/<(?:\w+:)?CrossIndustryInvoice\b/.test(xml)) {
    throw new Error(
      "validate() only supports the Factur-X/CII syntax right now " +
        "(no rsm:CrossIndustryInvoice root found). UBL Schematron is not yet " +
        "compiled to SEF; see the project's own tracker.",
    );
  }
}

/** Validates a Factur-X/CII invoice against the compiled EN 16931 Schematron,
 * plus a country's CIUS layer on top when `country` is given. Runs
 * client-side with no server: the same `runSchematron` core also runs
 * unmodified in a browser (see src/browser.ts and test/validate-browser.test.ts). */
export async function validate(xml: string, options: ValidateOptions = {}): Promise<ValidationResult> {
  assertCii(xml);
  const runs = [await runSchematron(SaxonJS, xml, loadSef("en16931"))];
  if (options.country === "FR") {
    runs.push(await runSchematron(SaxonJS, xml, loadSef("fr-ctc")));
  }
  return toValidationResult(runs);
}
