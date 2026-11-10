import { useEffect, useRef, useState } from 'react';
import type { Invoice } from '@conformo/core';
import { buildCII, checkInvoice } from '@conformo/formats';
import { leitwegNotices } from '@conformo/parse';
import type { Notice, ValidationResult } from '@conformo/validate/browser';
import type { Audience } from '../audience.js';
import { validateInvoiceXml } from './browserValidator.js';
import { clientProblems, mergeProblems, problemsFromInput, problemsFromRules, sortProblems, type Problem } from './problems.js';

// 750ms, not less: the Schematron transform occupies the main thread for a while, and the live preview has its own
// 500ms edit-to-repaint budget (see the e2e test). Starting validation inside the preview's window made ~half the
// edits miss it at 350ms.
const DEBOUNCE_MS = 750;

export interface LiveValidation {
  /** A pass is running for the latest edit; the problem list may be stale until it finishes. */
  checking: boolean;
  /** At least one full pass has finished (input + client checks always; rules when they could run). */
  ready: boolean;
  /** Everything that stops this invoice from being accepted under the chosen audience, in form order. */
  problems: Problem[];
  /** True when the official rule sets ran on this exact invoice and found nothing. Never true otherwise: a draft the
   * Schematron could not run on is not "valid". */
  accepted: boolean;
  /** The rule sets that ran, for the technical details. */
  ruleSets: ValidationResult['ruleSets'];
  /** Findings that are not Schematron rules, e.g. the Leitweg-ID check-digit warning. Shown under the technical details. */
  notices: Notice[];
  /** The validator's own assets failed to load (offline before first visit, a broken deploy). */
  unavailable?: string;
}

const EMPTY: LiveValidation = { checking: true, ready: false, problems: [], accepted: false, ruleSets: [], notices: [] };

export function useLiveValidation(invoice: Invoice, audience: Audience): LiveValidation {
  const [result, setResult] = useState<LiveValidation>(EMPTY);
  const generation = useRef(0);

  useEffect(() => {
    const myGeneration = ++generation.current;
    // Input and client checks are instant, so the problem list and the download gate never lag behind the form;
    // only the official Schematron pass is debounced.
    const input = problemsFromInput(checkInvoice(invoice), invoice);
    const client = clientProblems(invoice, audience);
    const quick = sortProblems(mergeProblems(input, client));
    setResult((prev) => ({ ...prev, checking: input.length === 0, problems: input.length ? quick : prev.ready ? mergeKeep(quick, prev.problems) : quick, accepted: false, ready: input.length > 0 || prev.ready }));
    if (input.length > 0) return;

    const timer = setTimeout(async () => {
      let outcome: LiveValidation;
      try {
        const xml = buildCII(invoice, { profile: audience.profile });
        const v = await validateInvoiceXml(xml, audience.country ? { country: audience.country } : {});
        const rules = problemsFromRules(v.results, invoice);
        const problems = sortProblems(mergeProblems(client, rules));
        outcome = { checking: false, ready: true, problems, accepted: v.valid && problems.length === 0, ruleSets: v.ruleSets, notices: [...v.notices, ...leitwegNotices(xml)] };
      } catch (err) {
        console.warn('live validation failed:', err);
        outcome = { checking: false, ready: true, problems: quick, accepted: false, ruleSets: [], notices: [], unavailable: err instanceof Error ? err.message : String(err) };
      }
      if (myGeneration === generation.current) setResult(outcome);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [invoice, audience]);

  return result;
}

/** While the rules re-run, keep showing the rule problems of the previous pass for fields not yet re-checked, so a
 * problem does not vanish and reappear on every keystroke. */
function mergeKeep(quick: Problem[], previous: Problem[]): Problem[] {
  const rules = previous.filter((p) => p.source === 'rules');
  return sortProblems(mergeProblems(quick, rules));
}
