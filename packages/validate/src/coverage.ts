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

export interface CoverageReport {
  totalRules: number;
  writtenRules: number;
  percent: number;
  missingRuleIds: string[];
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

  return { totalRules: allRuleIds.size, writtenRules: writtenCount, percent, missingRuleIds: missing };
}
