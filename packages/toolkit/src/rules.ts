import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getPlainLanguageMessage } from '@conformo/validate';
import type { PlainLanguageMessage } from '@conformo/validate';

export interface RuleExplanation {
  ruleId: string;
  /** False when neither the plain-language table nor any compiled rule set knows this id. */
  found: boolean;
  /** Which compiled rule set(s) define it, with the publisher's own wording. */
  official: { ruleSet: string; text: string }[];
  /** Hand-written explanation (what it means, why it exists, how to fix it) where one exists. */
  plainLanguage?: PlainLanguageMessage;
}

const artefacts = fileURLToPath(new URL('../../validate/artefacts/', import.meta.url));
const SETS = ['en16931-ubl', 'en16931-cii', 'xrechnung-ubl', 'peppol-ubl', 'fr-ctc'];
const texts = new Map<string, string>();

function load(set: string): string {
  let t = texts.get(set);
  if (t === undefined) {
    const direct = `${artefacts}${set}.sef.json`;
    const published = fileURLToPath(new URL(`../node_modules/@conformo/validate/artefacts/${set}.sef.json`, import.meta.url));
    const p = existsSync(direct) ? direct : published;
    t = existsSync(p) ? readFileSync(p, 'utf-8') : '';
    texts.set(set, t);
  }
  return t;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "BR-CO-15" -> the publishers' wording from the compiled rule sets plus our plain-language explanation. */
export function explainRule(ruleId: string): RuleExplanation {
  const id = ruleId.trim();
  const re = new RegExp(`\\[${escapeRe(id)}\\][-\\s]*([^"\\\\<]{5,600})`);
  const official: RuleExplanation['official'] = [];
  for (const set of SETS) {
    const m = re.exec(load(set));
    if (m) official.push({ ruleSet: set, text: m[1]!.replace(/\s+/g, ' ').trim() });
  }
  const plainLanguage = getPlainLanguageMessage(id);
  return { ruleId: id, found: official.length > 0 || !!plainLanguage, official, ...(plainLanguage ? { plainLanguage } : {}) };
}
