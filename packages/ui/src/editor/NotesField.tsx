import type { Invoice } from '@conformo/core';
import { pasteAsPlainText, stripHtml } from '../hardening/sanitize.js';
import { useI18n } from '../i18n/I18n.js';
import { fieldId } from './Field.js';

interface Props {
  invoice: Invoice;
  onChange: (invoice: Invoice) => void;
}

/** The free-text note (BT-22 without a subject code): the one multi-line, user-worded field, so the one place HTML
 * sanitizing applies. Notes with a subject code (the French AAB/PMD/PMT notices) are edited elsewhere and kept. */
export function NotesField({ invoice, onChange }: Props) {
  const { t } = useI18n();
  const coded = (invoice.notes ?? []).filter((n) => n.subjectCode);
  const text = (invoice.notes ?? []).find((n) => !n.subjectCode)?.text ?? '';
  const id = fieldId('notes.free');

  function setText(value: string) {
    const cleaned = stripHtml(value);
    const notes = cleaned ? [{ text: cleaned }, ...coded] : coded;
    onChange({ ...invoice, notes: notes.length ? notes : undefined });
  }

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{t.fields.notes}</label>
      <textarea id={id} className="notes-textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} onPaste={pasteAsPlainText} />
      <p className="field-msg" />
    </div>
  );
}
