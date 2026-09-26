import type { RuleResult } from '@conformo/validate/browser';

/** Keep the rule id visible but secondary; the human sentence leads. The
 * rule id used to open the line in bold ("BR-06: ...") — the opposite of
 * what a freelancer reading this actually needs first. */
export function FieldErrors({ errors }: { errors: RuleResult[] | undefined }) {
  if (!errors || errors.length === 0) return null;
  return (
    <ul className="field-errors">
      {errors.map((e, i) => (
        <li key={i}>
          <span className="field-error-text">{e.plainLanguage?.summary ?? e.message}</span>{' '}
          <span className="field-error-rule">{e.ruleId}</span>
        </li>
      ))}
    </ul>
  );
}
