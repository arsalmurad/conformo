import type { PlainLanguageMessage, RuleResult } from "./types.js";

/** Every hit of one rule at one level, for display. The `results` array of a validation stays one entry per hit. */
export interface RuleGroup {
  ruleId: string;
  ruleSet: string;
  severity: RuleResult["severity"];
  /** How many places the rule fired. */
  count: number;
  /** The publisher's sentence (same for every hit of the rule). */
  message: string;
  plainLanguage?: PlainLanguageMessage;
  /** Union of the hits' BT/BG ids, in order of first appearance. */
  fields: string[];
  /** One entry per hit, in document order. */
  places: { element: string; path: string; line?: number; xpath: string }[];
}

/** Groups results by rule set + rule id + severity, keeping the order of first appearance. */
export function groupResults(results: readonly RuleResult[]): RuleGroup[] {
  const groups = new Map<string, RuleGroup>();
  for (const r of results) {
    const key = `${r.ruleSet}\u0000${r.ruleId}\u0000${r.severity}`;
    let g = groups.get(key);
    if (!g) {
      g = { ruleId: r.ruleId, ruleSet: r.ruleSet, severity: r.severity, count: 0, message: r.message, ...(r.plainLanguage ? { plainLanguage: r.plainLanguage } : {}), fields: [], places: [] };
      groups.set(key, g);
    }
    g.count++;
    for (const f of r.fields) if (!g.fields.includes(f)) g.fields.push(f);
    g.places.push({ element: r.element ?? "", path: r.path ?? "", ...(r.line !== undefined ? { line: r.line } : {}), xpath: r.xpath });
  }
  return [...groups.values()];
}

/**
 * "ChargeAmount (lines 1, 2), LineTotalAmount (lines 1, 2), CalculatedAmount, ..." for a group, one entry per element
 * name with the invoice lines it was found on. `max` limits the entries shown; the rest become "and N more".
 */
export function describePlaces(g: RuleGroup, max = 10): string {
  // One entry per element name and level: the same name on invoice lines and at document level are told apart.
  const byKey = new Map<string, { name: string; lines: number[]; n: number; onLine: boolean }>();
  const namesOnLines = new Set(g.places.filter((p) => p.line !== undefined).map((p) => p.element || p.path || p.xpath));
  for (const p of g.places) {
    const name = p.element || p.path || p.xpath;
    const key = `${name}|${p.line !== undefined}`;
    const e = byKey.get(key) ?? byKey.set(key, { name, lines: [], n: 0, onLine: p.line !== undefined }).get(key)!;
    e.n++;
    if (p.line !== undefined && !e.lines.includes(p.line)) e.lines.push(p.line);
  }
  const entries = [...byKey.values()].map((e) => {
    if (e.onLine) return `${e.name} (${e.lines.length === 1 ? "line" : "lines"} ${e.lines.join(", ")})`;
    if (namesOnLines.has(e.name)) return `${e.name} (document level${e.n > 1 ? `, ${e.n} times` : ""})`;
    return e.n > 1 ? `${e.name} (${e.n} times)` : e.name;
  });
  return entries.length > max ? `${entries.slice(0, max).join(", ")}, and ${entries.length - max} more` : entries.join(", ");
}

/** The one-line heading for a group: "CII-DT-031, 12 places: ChargeAmount (lines 1, 2), ..." or "BR-CO-15: SomeElement". */
export function groupHeading(g: RuleGroup): string {
  const where = describePlaces(g);
  if (g.count === 1) return where ? `${g.ruleId}: ${where}` : g.ruleId;
  return `${g.ruleId}, ${g.count} places${where ? `: ${where}` : ""}`;
}
