import type { Invoice } from '@conformo/core';
import { pasteAsPlainText, stripHtml } from '../hardening/sanitize.js';

interface Props {
  invoice: Invoice;
  onChange: (invoice: Invoice) => void;
}

/** The one free-text, multi-line field on an invoice (BT-22) — and so the
 * one place "HTML sanitisation on rich input, paste-to-plain-text"
 *  actually applies. Every other field is a single
 * line of structured data (a name, an amount, a code); this is the only one
 * meant to hold whatever the user wants to say. */
export function NotesField({ invoice, onChange }: Props) {
  const text = invoice.notes?.[0]?.text ?? '';

  function setText(value: string) {
    const cleaned = stripHtml(value);
    onChange({ ...invoice, notes: cleaned ? [{ text: cleaned }] : undefined });
  }

  return (
    <label className="field">
      <span className="field-label">Notes (shown on the invoice)</span>
      <textarea
        className="notes-textarea"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={pasteAsPlainText}
        placeholder="e.g. thank-you note, late-payment terms, discount terms…"
      />
    </label>
  );
}
