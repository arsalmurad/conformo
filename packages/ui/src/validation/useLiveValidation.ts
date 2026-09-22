import { useEffect, useRef, useState } from 'react';
import type { Invoice } from '@invoice-engine/core';
import { buildCII } from '@invoice-engine/formats';
import type { RuleResult } from '@invoice-engine/validate/browser';
import { validateInvoiceXml } from './browserValidator.js';
import { targetFor, type Section } from './fieldMap.js';

const DEBOUNCE_MS = 350;

export interface LiveValidation {
  checking: boolean;
  /** True once at least one validation pass has completed — avoids flashing
   * every field red on the very first render before the debounce fires. */
  ready: boolean;
  byField: Record<string, RuleResult[]>;
  bySection: Partial<Record<Section, RuleResult[]>>;
  errorCount: number;
}

const EMPTY: LiveValidation = { checking: false, ready: false, byField: {}, bySection: {}, errorCount: 0 };

export function useLiveValidation(invoice: Invoice, country: 'FR' | undefined): LiveValidation {
  const [result, setResult] = useState<LiveValidation>(EMPTY);
  const generation = useRef(0);

  useEffect(() => {
    const myGeneration = ++generation.current;
    setResult((prev) => ({ ...prev, checking: true }));
    const timer = setTimeout(async () => {
      let outcome: LiveValidation;
      try {
        const xml = buildCII(invoice);
        const { results } = await validateInvoiceXml(xml, country);
        const failures = results.filter((r) => r.severity === 'error' || r.severity === 'fatal');
        const byField: Record<string, RuleResult[]> = {};
        const bySection: LiveValidation['bySection'] = {};
        for (const r of failures) {
          const target = targetFor(r.fields);
          if (target.kind === 'field') (byField[target.field] ??= []).push(r);
          else (bySection[target.section] ??= []).push(r);
        }
        outcome = { checking: false, ready: true, byField, bySection, errorCount: failures.length };
      } catch (err) {
        // A mid-edit invoice (e.g. an empty required field the type system
        // doesn't catch at runtime) can still fail to serialize at all; treat
        // that as "can't tell yet" rather than crashing the editor.
        console.warn('live validation skipped:', err);
        outcome = { ...EMPTY, ready: true };
      }
      if (myGeneration === generation.current) setResult(outcome);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [invoice, country]);

  return result;
}
