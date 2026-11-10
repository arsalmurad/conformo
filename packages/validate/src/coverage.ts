/**
 * How many of the EN 16931 Schematron's own rules have a hand-written
 * plain-language message. It should be a fact tracked here, not a thing
 * discovered by a reviewer.
 *
 * Reads the actual compiled artefact rather than a hardcoded rule count, so
 * this number can never drift from what the validator really runs: every
 * rule the Factur-X CII Schematron can fire puts its human id as a
 * "[BR-XX]-" prefix directly on the message text baked into the compiled
 * SEF (see src/svrl.ts's own comment on why) — the same mechanism the
 * runtime parser uses, scanned here at report time instead.
 */
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { en } from './messages/en.js';
import { getPlainLanguageMessage } from './messages/index.js';

export interface CoverageReport {
  totalRules: number;
  writtenRules: number;
  percent: number;
  missingRuleIds: string[];
  /** The syntax-binding rules (CII-DT, CII-SR, UBL-CR, UBL-DT, UBL-SR): answered by hand-written entry or by family. */
  syntax: { totalRules: number; withMessage: number; percent: number; missingRuleIds: string[] };
}

export class MissingSefError extends Error {
  constructor(path: string) {
    super(`Missing ${path} — run: npm run schematron:compile`);
    this.name = 'MissingSefError';
  }
}

export function computeCoverage(sefPaths: string[] = ['en16931-cii', 'en16931-ubl'].map((id) => fileURLToPath(new URL(`../artefacts/${id}.sef.json.gz`, import.meta.url)))): CoverageReport {
  const sef = sefPaths.map((p) => {
    if (!fs.existsSync(p)) throw new MissingSefError(p);
    return gunzipSync(fs.readFileSync(p)).toString('utf-8');
  }).join('\n');
  const allRuleIds = new Set([...sef.matchAll(/\[(BR-[A-Z0-9-]+)\]-/g)].map((m) => m[1]!));
  const writtenRuleIds = new Set(Object.keys(en));

  const missing = [...allRuleIds].filter((id) => !writtenRuleIds.has(id)).sort();
  const writtenCount = allRuleIds.size - missing.length;
  const percent = Math.round((writtenCount / allRuleIds.size) * 1000) / 10;

  // Syntax rules: each id with the publisher's sentence, so the family resolver can be asked the same way the engine asks.
  const syntaxText = new Map<string, string>();
  for (const m of sef.matchAll(/\[((?:CII|UBL)-(?:DT|SR|CR)-\d+[a-z]*)\][-\s]*([^"\\<]{3,300})/g)) if (!syntaxText.has(m[1]!)) syntaxText.set(m[1]!, m[2]!.replace(/\s+/g, ' ').trim());
  const syntaxMissing = [...syntaxText].filter(([id, text]) => !getPlainLanguageMessage(id, 'en', text)).map(([id]) => id).sort();
  const syntaxTotal = syntaxText.size;
  const syntaxPercent = syntaxTotal ? Math.round(((syntaxTotal - syntaxMissing.length) / syntaxTotal) * 1000) / 10 : 0;

  return {
    totalRules: allRuleIds.size, writtenRules: writtenCount, percent, missingRuleIds: missing,
    syntax: { totalRules: syntaxTotal, withMessage: syntaxTotal - syntaxMissing.length, percent: syntaxPercent, missingRuleIds: syntaxMissing },
  };
}
