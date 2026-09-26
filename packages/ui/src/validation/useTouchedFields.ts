import { useCallback, useState } from 'react';

/**
 * Do not flag fields the user has not touched yet: validate a field on
 * blur, and the whole document on first export attempt. A brand-new, empty
 * invoice used to show every mandatory-field error at once — "7 issues to
 * fix" before the user had typed a single character. This tracks which
 * fields have been blurred at least once, plus a one-way switch flipped by
 * the first export attempt that reveals everything regardless of touch
 * state, matching "validate the whole document on first export attempt".
 */
export interface TouchedFields {
  /** True once this field has been blurred, or revealAll() has fired. */
  isVisible: (field: string) => boolean;
  /** Call from a field's onBlur (or a delegated one — see InvoiceEditor's
   * form-level handler) with the same key byField/bySection uses. */
  markTouched: (field: string) => void;
  /** Call once, on the first export attempt. Idempotent and one-way: once
   * everything is visible, an export failure shouldn't hide issues again. */
  revealAll: () => void;
}

export function useTouchedFields(): TouchedFields {
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);

  const markTouched = useCallback((field: string) => {
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
  }, []);

  const revealAll = useCallback(() => setShowAll(true), []);

  const isVisible = useCallback((field: string) => showAll || touched.has(field), [showAll, touched]);

  return { isVisible, markTouched, revealAll };
}
