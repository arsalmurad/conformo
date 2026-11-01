import { cloneElement, isValidElement } from 'react';
import type { Described } from '../validation/messages.js';

export function fieldId(key: string): string {
  return `f-${key.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

interface Props {
  /** The field key problems are attached to (see validation/problems.ts); also the input's data-field. */
  fieldKey: string;
  label: string;
  hint?: string;
  error?: Described;
  /** Shown as a quiet badge, not an asterisk: the user's side of "mandatory". */
  required?: boolean;
  className?: string;
  children: React.ReactElement;
}

/**
 * One labelled input with its message line. The label is a real <label for>, so every input has a visible label and
 * an accessible name; the error (or the hint when there is none) is the input's description. The message line always
 * takes its space, so an error appearing never pushes the form down (no layout shift).
 */
export function Field({ fieldKey, label, hint, error, required, className, children }: Props) {
  const id = fieldId(fieldKey);
  const msgId = `${id}-msg`;
  const child = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id,
        'data-field': fieldKey,
        'aria-describedby': error || hint ? msgId : undefined,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
      })
    : children;
  return (
    <div className={`field${error ? ' field-has-error' : ''}${className ? ` ${className}` : ''}`}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {child}
      <p id={msgId} className={`field-msg${error ? ' field-msg-error' : ''}`}>
        {error ? (
          <>
            <span>{error.text}</span>
            {error.fix && <span className="field-fix"> {error.fix}</span>}
          </>
        ) : (
          hint
        )}
      </p>
    </div>
  );
}
