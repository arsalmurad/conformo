import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18n.js';
import type { Numbering } from '../numbering/useNumbering.js';
import { wasIssued } from '../numbering/localCounter.js';
import type { Described } from '../validation/messages.js';
import { Field } from './Field.js';

interface Props {
  value: string;
  onChange: (number: string) => void;
  numbering: Numbering;
  error?: Described;
}

/**
 * The invoice number (BT-1). Typing is allowed: people moving from another tool continue their own numbering. The
 * gapless local sequence stays the default: one click takes its next number, and the "Numbering" settings (in the
 * More menu) continue an existing sequence from any number. A number already downloaded on this device gets a warning,
 * not a block: it may be a deliberate re-issue of the same invoice.
 */
export function NumberField({ value, onChange, numbering, error }: Props) {
  const { t } = useI18n();
  const [duplicate, setDuplicate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!value) { setDuplicate(false); return; }
    const timer = setTimeout(() => {
      wasIssued(value).then((d) => { if (!cancelled) setDuplicate(d); }).catch(() => {});
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [value]);

  const warn: Described | undefined = duplicate && !error ? { text: t.numbering.duplicate } : undefined;
  return (
    <div className="number-field">
      <Field fieldKey="number" label={t.fields.number} error={error ?? warn} required>
        <input value={value} autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      </Field>
      {!value && (
        <button
          type="button"
          className="btn btn-quiet number-next"
          disabled={numbering.assigning}
          onClick={() => void numbering.assignNext().then((n) => n && onChange(n))}
        >
          {numbering.assigning ? t.numbering.assigning : numbering.peek ? t.numbering.useNext(numbering.peek) : t.numbering.useNextUnknown}
        </button>
      )}
      {numbering.error && <p className="field-msg field-msg-error">{numbering.error}</p>}
    </div>
  );
}
