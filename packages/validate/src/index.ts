import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import SaxonJS from "saxon-js";
import { createEngine } from "./engine.js";
import { nodeXsdRunner } from "./xsd.node.js";
import type { CompiledSchematron, ValidateOptions, ValidationResult } from "./types.js";

export type {
  RuleResult, PlainLanguageMessage, ValidateOptions, ValidationResult, SaxonJSLike, Syntax, Profile,
  DetectedDocument, RuleSetRun, XsdRun, Notice,
} from "./types.js";
export { ValidationInputError } from "./types.js";
export { getPlainLanguageMessage } from "./messages/index.js";
export { groupResults, describePlaces, groupHeading } from "./group.js";
export type { RuleGroup } from "./group.js";
export { describeLocation } from "./location.js";
export type { ResultPlace } from "./location.js";
export { detectDocument, profileFromCustomizationId } from "./detect.js";
export { planRulesets } from "./engine.js";

const artefactsDir = fileURLToPath(new URL("../artefacts/", import.meta.url));

function readArtefact(name: string): string {
  try {
    const buf = readFileSync(`${artefactsDir}${name}`);
    return (name.endsWith(".gz") ? gunzipSync(buf) : buf).toString("utf-8");
  } catch {
    throw new Error(`Missing compiled validation artefact "${name}". Run: npm run schematron:compile`);
  }
}

interface RulesetsFile {
  rulesets: Record<string, { label: string; source: string }>;
  levelOverrides?: Record<string, Record<string, string>>;
}

function rulesetsFile(): RulesetsFile {
  try {
    return JSON.parse(readArtefact("rulesets.json")) as RulesetsFile;
  } catch {
    return { rulesets: {} };
  }
}

let engine: ReturnType<typeof createEngine> | undefined;

/**
 * Validates a CII or UBL invoice. The syntax and profile are read from the document (root element and
 * BT-24) and decide which rule sets run: EN 16931, plus XRechnung or Peppol BIS Billing 3.0, plus the
 * French CTC rules when `country: "FR"`. The result lists exactly which rule sets ran. XSD validation
 * runs too (disable with `xsd: false`). Runs locally, with no server.
 */
export async function validate(xml: string, options: ValidateOptions = {}): Promise<ValidationResult> {
  const meta = rulesetsFile();
  engine ??= createEngine({
    saxon: SaxonJS,
    loadRuleset: async (id): Promise<CompiledSchematron | string> => readArtefact(`${id}.sef.json.gz`),
    xsd: nodeXsdRunner,
    info: meta.rulesets,
    levelOverrides: meta.levelOverrides,
  });
  return engine.validate(xml, options);
}
