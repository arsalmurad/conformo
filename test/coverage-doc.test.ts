import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { EN16931_TERMS } from '@conformo/core';
import { renderCoverage } from '../tools/generate-coverage.js';

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf-8');

/** Value at a path like "lines[].allowances[].amountMinor" anywhere in the document (arrays flattened). */
function present(root: unknown, path: string): boolean {
  let nodes: unknown[] = [root];
  for (const seg of path.split('.')) {
    const key = seg.replace(/\[\]$/, '');
    const isArr = seg.endsWith('[]');
    nodes = nodes.flatMap((n) => {
      const v = typeof n === 'object' && n !== null ? (n as Record<string, unknown>)[key] : undefined;
      if (v === undefined || v === null) return [];
      return isArr ? (Array.isArray(v) ? v : []) : [v];
    });
  }
  return nodes.length > 0;
}

describe('EN 16931 term table', () => {
  it('lists every BT/BG number of the standard exactly once', () => {
    const ids = EN16931_TERMS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    // BT-1..BT-165 except the numbers EN 16931-1 never assigned (BT-4, BT-51 is used, ...): check the known gaps only.
    const unassigned = new Set([4]);
    for (let n = 1; n <= 165; n++) {
      if (unassigned.has(n)) continue;
      if (n >= 162 && n <= 165) continue; // BT-162..165 are the "address line 3" terms, checked below
      expect(ids, `BT-${n} missing from the term table`).toContain(`BT-${n}`);
    }
    for (const n of [162, 163, 164, 165]) expect(ids).toContain(`BT-${n}`);
    for (let n = 1; n <= 32; n++) expect(ids, `BG-${n}`).toContain(`BG-${n}`);
  });

  it('every input term is present in the fixture that claims to prove it', () => {
    const missing: string[] = [];
    for (const t of EN16931_TERMS) {
      if (t.kind === 'computed' || t.kind === 'derived' || !t.fixture) continue;
      if (!existsSync(new URL(`../fixtures/${t.fixture}`, import.meta.url))) { missing.push(`${t.id}: no fixture ${t.fixture}`); continue; }
      if (!present(JSON.parse(read(`fixtures/${t.fixture}`)), t.path)) missing.push(`${t.id} (${t.path}) not set in ${t.fixture}`);
    }
    expect(missing).toEqual([]);
  });

  it('every BT/BG mentioned in the model source is in the table', () => {
    const src = read('packages/core/src/model.ts');
    const mentioned = new Set([...src.matchAll(/\b(B[TG]-\d+(?:-\d+)?)\b/g)].map((m) => m[1]!));
    const known = new Set(EN16931_TERMS.map((t) => t.id));
    expect([...mentioned].filter((m) => !known.has(m))).toEqual([]);
  });

  it('docs/EN16931-COVERAGE.md is the generated document (run: npx tsx tools/generate-coverage.ts)', () => {
    expect(read('docs/EN16931-COVERAGE.md')).toBe(renderCoverage());
  });
});
