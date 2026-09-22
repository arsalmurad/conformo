import type { RuleResult } from '@invoice-engine/validate/browser';

export function FieldErrors({ errors }: { errors: RuleResult[] | undefined }) {
  if (!errors || errors.length === 0) return null;
  return (
    <ul className="field-errors">
      {errors.map((e, i) => (
        <li key={i}>
          <strong>{e.ruleId}:</strong> {e.plainLanguage?.summary ?? e.message}
        </li>
      ))}
    </ul>
  );
}
