import { useState } from 'react';
import type { Invoice, Line, Party, TaxCategory } from '@invoice-engine/core';
import { fromMajor, toMajor } from '@invoice-engine/core';
import type { LiveValidation } from '../validation/useLiveValidation.js';
import { FieldErrors } from './FieldErrors.js';

/** A plain `value={toMajor(minor)}` input reformats to a fixed 2-decimal
 * string on every keystroke, which fights the cursor mid-edit (typing "1000"
 * renders "1.00" after the first digit, then loses the rest). This keeps its
 * own draft text instead, and only commits a parse back out on each valid
 * keystroke — the display never snaps back to a reformatted string until the
 * field is next remounted (a fresh line, or a freshly loaded invoice). */
function MoneyInput({ minor, onChange, className }: { minor: number; onChange: (minor: number) => void; className?: string }) {
  const [text, setText] = useState(() => toMajor(minor));
  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        if (/^\d*\.?\d*$/.test(e.target.value) && e.target.value !== '' && e.target.value !== '.') {
          onChange(fromMajor(e.target.value));
        }
      }}
      onBlur={() => setText(toMajor(minor))}
    />
  );
}

const TAX_CATEGORIES: { value: TaxCategory; label: string }[] = [
  { value: 'S', label: 'S — Standard rated' },
  { value: 'Z', label: 'Z — Zero rated' },
  { value: 'E', label: 'E — Exempt from VAT' },
  { value: 'AE', label: 'AE — Reverse charge' },
  { value: 'K', label: 'K — Intra-community supply' },
  { value: 'G', label: 'G — Export outside the EU' },
  { value: 'O', label: 'O — Not subject to VAT' },
];

interface Props {
  invoice: Invoice;
  onChange: (invoice: Invoice) => void;
  validation: LiveValidation;
}

export function InvoiceEditor({ invoice, onChange, validation }: Props) {
  const { byField, bySection } = validation;

  const set = <K extends keyof Invoice>(key: K, value: Invoice[K]) => onChange({ ...invoice, [key]: value });
  const setParty = (side: 'seller' | 'buyer', patch: Partial<Party>) =>
    onChange({ ...invoice, [side]: { ...invoice[side], ...patch } });
  const setLine = (index: number, patch: Partial<Line>) =>
    onChange({ ...invoice, lines: invoice.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)) });
  const addLine = () =>
    onChange({ ...invoice, lines: [...invoice.lines, { name: '', quantity: 1, unitPriceMinor: 0, taxCategory: 'S', taxRate: 0 }] });
  const removeLine = (index: number) => onChange({ ...invoice, lines: invoice.lines.filter((_, i) => i !== index) });

  return (
    <form className="editor" onSubmit={(e) => e.preventDefault()}>
      <section className="editor-row">
        <Field label="Invoice number" errors={byField.number}>
          <input value={invoice.number} onChange={(e) => set('number', e.target.value)} placeholder="INV-2026-0001" />
        </Field>
        <Field label="Currency" errors={byField.currency}>
          <input value={invoice.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} maxLength={3} />
        </Field>
        <Field label="Issue date" errors={byField.issueDate}>
          <input type="date" value={invoice.issueDate} onChange={(e) => set('issueDate', e.target.value)} />
        </Field>
        <Field label="Due date" errors={byField.dueDate}>
          <input type="date" value={invoice.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || undefined)} />
        </Field>
      </section>

      <section className="editor-parties">
        <PartyFields title="Seller" side="seller" party={invoice.seller} onChange={(p) => setParty('seller', p)} byField={byField} />
        <PartyFields title="Buyer" side="buyer" party={invoice.buyer} onChange={(p) => setParty('buyer', p)} byField={byField} />
      </section>

      <section className="editor-lines">
        <h3>Invoice lines</h3>
        <FieldErrors errors={bySection.lines} />
        {invoice.lines.map((line, i) => (
          <div className="line-row" key={i}>
            <input
              className="line-name"
              placeholder="Description"
              value={line.name}
              onChange={(e) => setLine(i, { name: e.target.value })}
            />
            <input
              className="line-qty"
              type="number"
              step="any"
              value={line.quantity}
              onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
            />
            <MoneyInput
              className="line-price"
              minor={line.unitPriceMinor}
              onChange={(unitPriceMinor) => setLine(i, { unitPriceMinor })}
              key={i}
            />
            <select value={line.taxCategory} onChange={(e) => setLine(i, { taxCategory: e.target.value as TaxCategory })}>
              {TAX_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              className="line-rate"
              type="number"
              step="0.01"
              value={line.taxRate}
              onChange={(e) => setLine(i, { taxRate: Number(e.target.value) })}
              disabled={line.taxCategory === 'O'}
            />
            <button type="button" className="line-remove" onClick={() => removeLine(i)} aria-label="Remove line">
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={addLine}>
          + Add line
        </button>
      </section>

      <section>
        <FieldErrors errors={bySection.tax} />
        <FieldErrors errors={bySection.totals} />
      </section>

      <section className="editor-row">
        <Field label="IBAN" errors={bySection.payment}>
          <input
            value={invoice.payment.iban ?? ''}
            onChange={(e) => set('payment', { ...invoice.payment, iban: e.target.value.toUpperCase() })}
          />
        </Field>
        <Field label="Payment terms">
          <input value={invoice.paymentTerms ?? ''} onChange={(e) => set('paymentTerms', e.target.value || undefined)} />
        </Field>
      </section>
    </form>
  );
}

function PartyFields({
  title,
  side,
  party,
  onChange,
  byField,
}: {
  title: string;
  side: 'seller' | 'buyer';
  party: Party;
  onChange: (patch: Partial<Party>) => void;
  byField: LiveValidation['byField'];
}) {
  return (
    <fieldset className="party">
      <legend>{title}</legend>
      <Field label="Name" errors={byField[`${side}.name`]}>
        <input value={party.name} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>
      <Field label="Street" errors={byField[`${side}.street`]}>
        <input value={party.street ?? ''} onChange={(e) => onChange({ street: e.target.value || undefined })} />
      </Field>
      <div className="editor-row">
        <Field label="Postcode" errors={byField[`${side}.postcode`]}>
          <input value={party.postcode ?? ''} onChange={(e) => onChange({ postcode: e.target.value || undefined })} />
        </Field>
        <Field label="City" errors={byField[`${side}.city`]}>
          <input value={party.city ?? ''} onChange={(e) => onChange({ city: e.target.value || undefined })} />
        </Field>
        <Field label="Country" errors={byField[`${side}.country`]}>
          <input
            value={party.country}
            onChange={(e) => onChange({ country: e.target.value.toUpperCase() })}
            maxLength={2}
            placeholder="FR"
          />
        </Field>
      </div>
      <Field label="VAT number" errors={byField[`${side}.vatId`]}>
        <input value={party.vatId ?? ''} onChange={(e) => onChange({ vatId: e.target.value.toUpperCase() || undefined })} />
      </Field>
    </fieldset>
  );
}

function Field({ label, errors, children }: { label: string; errors?: import('@invoice-engine/validate/browser').RuleResult[]; children: React.ReactNode }) {
  return (
    <label className={`field ${errors?.length ? 'field-invalid' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      <FieldErrors errors={errors} />
    </label>
  );
}
