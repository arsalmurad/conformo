import type { Invoice, Line, Party, TaxCategory } from '@invoice-engine/core';
import type { LiveValidation } from '../validation/useLiveValidation.js';
import type { PartyProfile } from '../profiles/types.js';
import { checkIban } from '../profiles/iban.js';
import { checkVatFormat } from '../profiles/vat.js';
import { EAS_CODES } from '../profiles/eas.js';
import { FieldErrors } from './FieldErrors.js';
import { ProfilePicker } from './ProfilePicker.js';
import { MoneyInput } from './MoneyInput.js';
import { BillingPanel } from './BillingPanel.js';
import { NumberField } from './NumberField.js';

/** Client-side hints (IBAN checksum, VAT format) run instantly, unlike the
 * Schematron round trip — no point waiting 350ms and a WASM-ish transform to
 * tell someone they transposed two IBAN digits. */
function ibanHint(iban: string | undefined): string | undefined {
  if (!iban) return undefined;
  const result = checkIban(iban);
  return result.valid ? undefined : `This IBAN ${result.reason}.`;
}

function vatHint(vatId: string | undefined): string | undefined {
  if (!vatId) return undefined;
  const result = checkVatFormat(vatId);
  return result.valid ? undefined : `This VAT number ${result.reason}.`;
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
  profiles: PartyProfile[];
  onSaveProfile: (profile: PartyProfile) => void;
  onDeleteProfile: (id: string) => void;
}

export function InvoiceEditor({ invoice, onChange, validation, profiles, onSaveProfile, onDeleteProfile }: Props) {
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
        <NumberField value={invoice.number} onChange={(number) => set('number', number)} errors={byField.number} />
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
        <PartyFields
          title="Seller"
          side="seller"
          party={invoice.seller}
          onChange={(p) => setParty('seller', p)}
          byField={byField}
          profiles={profiles}
          onSaveProfile={onSaveProfile}
          onDeleteProfile={onDeleteProfile}
        />
        <PartyFields
          title="Buyer"
          side="buyer"
          party={invoice.buyer}
          onChange={(p) => setParty('buyer', p)}
          byField={byField}
          profiles={profiles}
          onSaveProfile={onSaveProfile}
          onDeleteProfile={onDeleteProfile}
        />
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

      <BillingPanel invoice={invoice} onChange={onChange} />

      <section className="editor-row">
        <Field label="IBAN" errors={bySection.payment} hint={ibanHint(invoice.payment.iban)}>
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
  profiles,
  onSaveProfile,
  onDeleteProfile,
}: {
  title: string;
  side: 'seller' | 'buyer';
  party: Party;
  onChange: (patch: Partial<Party>) => void;
  byField: LiveValidation['byField'];
  profiles: PartyProfile[];
  onSaveProfile: (profile: PartyProfile) => void;
  onDeleteProfile: (id: string) => void;
}) {
  const isEmail = (party.electronicAddress ?? '').includes('@');
  return (
    <fieldset className="party">
      <legend>{title}</legend>
      <ProfilePicker party={party} profiles={profiles} onLoad={onChange} onSave={onSaveProfile} onDelete={onDeleteProfile} />
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
      <Field label="VAT number" errors={byField[`${side}.vatId`]} hint={vatHint(party.vatId)}>
        <input value={party.vatId ?? ''} onChange={(e) => onChange({ vatId: e.target.value.toUpperCase() || undefined })} />
      </Field>
      <Field label="Electronic address" errors={byField[`${side}.electronicAddress`]}>
        <input
          value={party.electronicAddress ?? ''}
          placeholder="name@example.com, or a scheme-specific ID"
          onChange={(e) => onChange({ electronicAddress: e.target.value || undefined })}
        />
      </Field>
      {!isEmail && party.electronicAddress && (
        <Field label="Address scheme" hint={!party.electronicAddressScheme ? 'Required for a non-email address (BT-34/BT-49).' : undefined}>
          <select
            value={party.electronicAddressScheme ?? ''}
            onChange={(e) => onChange({ electronicAddressScheme: e.target.value || undefined })}
          >
            <option value="">Select a scheme…</option>
            {EAS_CODES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      )}
    </fieldset>
  );
}

function Field({
  label,
  errors,
  hint,
  children,
}: {
  label: string;
  errors?: import('@invoice-engine/validate/browser').RuleResult[];
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`field ${errors?.length || hint ? 'field-invalid' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      <FieldErrors errors={errors} />
      {hint && <p className="field-hint">{hint}</p>}
    </label>
  );
}
