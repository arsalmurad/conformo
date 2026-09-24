import { useEffect, useRef, useState } from 'react';
import type { Invoice } from '@conformo/core';
import { buildCII, InvoiceInputError } from '@conformo/formats';
import type { RuleResult } from '@conformo/validate/browser';
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
  /** Set when the invoice couldn't even be serialized to XML — e.g. an
   * electronic address with no scheme code that isn't an e-mail address
   * (see InvoiceInputError in @conformo/formats). This is a REAL
   * problem the user needs to see, not the same as "still typing": silently
   * reporting zero issues here would show a false "passes EN 16931" for a
   * document that doesn't even have a body yet. */
  structuralError?: string;
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
        if (err instanceof InvoiceInputError) {
          // A real, actionable problem — surface it rather than hiding it
          // behind a false "0 issues".
          outcome = { ...EMPTY, ready: true, errorCount: 1, structuralError: err.message };
        } else {
          // Something else went wrong (e.g. the validator's own assets
          // haven't loaded yet); don't crash the editor over it, but don't
          // claim a clean pass either.
          console.warn('live validation skipped:', err);
          outcome = { ...EMPTY, ready: false };
        }
      }
      if (myGeneration === generation.current) setResult(outcome);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [invoice, country]);

  return result;
}
