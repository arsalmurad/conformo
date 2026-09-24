import { cloneElement, isValidElement } from 'react';
import type { Invoice, Line, Party, TaxCategory } from '@conformo/core';
import { localeForInvoice } from '@conformo/pdf';
import type { LiveValidation } from '../validation/useLiveValidation.js';
import type { TouchedFields } from '../validation/useTouchedFields.js';
import { touchKeyFor } from '../validation/touchKey.js';
import type { PartyProfile } from '../profiles/types.js';
import type { EmbeddableLogo } from '../pdf/exportPdf.js';
import { checkIban } from '../profiles/iban.js';
import { checkVatFormat } from '../profiles/vat.js';
import { EAS_CODES } from '../profiles/eas.js';
import { FieldErrors } from './FieldErrors.js';
import { ProfilePicker } from './ProfilePicker.js';
import { MoneyInput } from './MoneyInput.js';
import { BillingPanel } from './BillingPanel.js';
import { NumberField } from './NumberField.js';
import { NotesField } from './NotesField.js';
import { PaymentLinkField } from './PaymentLinkField.js';
import { LogoUpload } from './LogoUpload.js';
import { LocaleDateInput } from './LocaleDateInput.js';

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
  touchedFields: TouchedFields;
  profiles: PartyProfile[];
  onSaveProfile: (profile: PartyProfile) => void;
  onDeleteProfile: (id: string) => void;
  paymentLink: string;
  onPaymentLinkChange: (link: string) => void;
  logo: EmbeddableLogo | undefined;
  onLogoChange: (logo: EmbeddableLogo | undefined) => void;
}

export function InvoiceEditor({
  invoice,
  onChange,
  validation,
  touchedFields,
  profiles,
  onSaveProfile,
  onDeleteProfile,
  paymentLink,
  onPaymentLinkChange,
  logo,
  onLogoChange,
}: Props) {
  const { byField, bySection } = validation;
  const { isVisible, markTouched } = touchedFields;
  // Same locale the PDF itself renders with (packages/pdf/src/locale.ts) —
  // the date fields should show the invoice's own country's format, not
  // guess independently and risk disagreeing with the document it produces.
  const locale = localeForInvoice(invoice.buyer.country, invoice.seller.country);

  // Only a field the user has actually blurred (or an export attempt) shows
  // its errors — see useTouchedFields. 'tax'/'totals' have no input of their
  // own to blur (they're computed from the lines, not typed directly), so
  // they piggyback on the lines section having been touched.
  const fieldErrors = (key: string) => (isVisible(touchKeyFor(key)) ? byField[key] : undefined);
  const sectionErrors = (key: 'lines' | 'tax' | 'totals' | 'payment') => (isVisible(touchKeyFor(key)) ? bySection[key] : undefined);

  const set = <K extends keyof Invoice>(key: K, value: Invoice[K]) => onChange({ ...invoice, [key]: value });
  const setParty = (side: 'seller' | 'buyer', patch: Partial<Party>) =>
    onChange({ ...invoice, [side]: { ...invoice[side], ...patch } });
  const setLine = (index: number, patch: Partial<Line>) =>
    onChange({ ...invoice, lines: invoice.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)) });
  const addLine = () =>
    onChange({ ...invoice, lines: [...invoice.lines, { name: '', quantity: 1, unitPriceMinor: 0, taxCategory: 'S', taxRate: 0 }] });
  const removeLine = (index: number) => onChange({ ...invoice, lines: invoice.lines.filter((_, i) => i !== index) });

  // A single delegated blur handler for the whole form, rather than an
  // onBlur prop threaded through every one of the ~25 inputs below: React's
  // onBlur bubbles (it's backed by the native "focusout" event, not "blur"),
  // so this fires for every field and reads which one via data-field.
  const handleBlur = (e: React.FocusEvent<HTMLFormElement>) => {
    const field = (e.target as HTMLElement).dataset.field;
    if (field) markTouched(field);
  };

  return (
    <form className="editor" onSubmit={(e) => e.preventDefault()} onBlur={handleBlur}>
      <section className="editor-row">
        <NumberField value={invoice.number} onChange={(number) => set('number', number)} errors={fieldErrors('number')} />
        <Field label="Currency" errors={fieldErrors('currency')}>
          <input data-field="currency" value={invoice.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} maxLength={3} />
        </Field>
        <Field label="Issue date" errors={fieldErrors('issueDate')}>
          <LocaleDateInput data-field="issueDate" locale={locale} value={invoice.issueDate} onChange={(v) => set('issueDate', v)} />
        </Field>
        <Field label="Due date" errors={fieldErrors('dueDate')}>
          <LocaleDateInput
            data-field="dueDate"
            locale={locale}
            value={invoice.dueDate ?? ''}
            onChange={(v) => set('dueDate', v || undefined)}
          />
        </Field>
      </section>

      <section className="editor-parties">
        <PartyFields
          title="Seller"
          side="seller"
          party={invoice.seller}
          onChange={(p) => setParty('seller', p)}
          fieldErrors={fieldErrors}
          profiles={profiles}
          onSaveProfile={onSaveProfile}
          onDeleteProfile={onDeleteProfile}
        />
        <PartyFields
          title="Buyer"
          side="buyer"
          party={invoice.buyer}
          onChange={(p) => setParty('buyer', p)}
          fieldErrors={fieldErrors}
          profiles={profiles}
          onSaveProfile={onSaveProfile}
          onDeleteProfile={onDeleteProfile}
        />
      </section>

      <section className="editor-lines" id="field-lines">
        <h3>Invoice lines</h3>
        <FieldErrors errors={sectionErrors('lines')} />
        {invoice.lines.map((line, i) => (
          <div className="line-row" key={i}>
            <input
              className="line-name"
              data-field="lines"
              placeholder="Description"
              value={line.name}
              onChange={(e) => setLine(i, { name: e.target.value })}
            />
            <input
              className="line-qty"
              data-field="lines"
              type="number"
              step="any"
              value={line.quantity}
              onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
            />
            <MoneyInput
              className="line-price"
              dataField="lines"
              minor={line.unitPriceMinor}
              onChange={(unitPriceMinor) => setLine(i, { unitPriceMinor })}
              key={i}
            />
            <select data-field="lines" value={line.taxCategory} onChange={(e) => setLine(i, { taxCategory: e.target.value as TaxCategory })}>
              {TAX_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              className="line-rate"
              data-field="lines"
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

      <section id="field-tax">
        <FieldErrors errors={sectionErrors('tax')} />
        <FieldErrors errors={sectionErrors('totals')} />
      </section>

      <BillingPanel invoice={invoice} onChange={onChange} />

      <section className="editor-row">
        <Field label="IBAN" errors={sectionErrors('payment')} hint={ibanHint(invoice.payment.iban)}>
          <input
            data-field="payment"
            value={invoice.payment.iban ?? ''}
            onChange={(e) => set('payment', { ...invoice.payment, iban: e.target.value.toUpperCase() })}
          />
        </Field>
        <Field label="Payment terms">
          <input value={invoice.paymentTerms ?? ''} onChange={(e) => set('paymentTerms', e.target.value || undefined)} />
        </Field>
      </section>

      <section className="editor-row">
        <PaymentLinkField value={paymentLink} onChange={onPaymentLinkChange} />
        <LogoUpload logo={logo} onChange={onLogoChange} />
      </section>

      <NotesField invoice={invoice} onChange={onChange} />
    </form>
  );
}

function PartyFields({
  title,
  side,
  party,
  onChange,
  fieldErrors,
  profiles,
  onSaveProfile,
  onDeleteProfile,
}: {
  title: string;
  side: 'seller' | 'buyer';
  party: Party;
  onChange: (patch: Partial<Party>) => void;
  fieldErrors: (key: string) => import('@conformo/validate/browser').RuleResult[] | undefined;
  profiles: PartyProfile[];
  onSaveProfile: (profile: PartyProfile) => void;
  onDeleteProfile: (id: string) => void;
}) {
  const isEmail = (party.electronicAddress ?? '').includes('@');
  return (
    <fieldset className="party" id={`field-${side}`}>
      <legend>{title}</legend>
      <ProfilePicker party={party} profiles={profiles} onLoad={onChange} onSave={onSaveProfile} onDelete={onDeleteProfile} />
      <Field label="Name" errors={fieldErrors(`${side}.name`)}>
        <input data-field={`${side}.name`} value={party.name} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>
      <Field label="Street" errors={fieldErrors(`${side}.street`)}>
        <input data-field={`${side}.street`} value={party.street ?? ''} onChange={(e) => onChange({ street: e.target.value || undefined })} />
      </Field>
      <div className="editor-row">
        <Field label="Postcode" errors={fieldErrors(`${side}.postcode`)}>
          <input data-field={`${side}.postcode`} value={party.postcode ?? ''} onChange={(e) => onChange({ postcode: e.target.value || undefined })} />
        </Field>
        <Field label="City" errors={fieldErrors(`${side}.city`)}>
          <input data-field={`${side}.city`} value={party.city ?? ''} onChange={(e) => onChange({ city: e.target.value || undefined })} />
        </Field>
        <Field label="Country" errors={fieldErrors(`${side}.country`)}>
          <input
            data-field={`${side}.country`}
            value={party.country}
            onChange={(e) => onChange({ country: e.target.value.toUpperCase() })}
            maxLength={2}
            placeholder="FR"
          />
        </Field>
      </div>
      <Field label="VAT number" errors={fieldErrors(`${side}.vatId`)} hint={vatHint(party.vatId)}>
        <input data-field={`${side}.vatId`} value={party.vatId ?? ''} onChange={(e) => onChange({ vatId: e.target.value.toUpperCase() || undefined })} />
      </Field>
      <Field label="Electronic address" errors={fieldErrors(`${side}.electronicAddress`)}>
        <input
          data-field={`${side}.electronicAddress`}
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

function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

function Field({
  label,
  errors,
  hint,
  children,
}: {
  label: string;
  errors?: import('@conformo/validate/browser').RuleResult[];
  hint?: string;
  children: React.ReactNode;
}) {
  const hasErrors = !!errors?.length;
  // "A missing buyer name while typing is not the same class of thing as a
  // structurally invalid VAT breakdown" (Part C) — a required field that's
  // simply still empty reads as unfinished, not as broken, even though both
  // are the same Schematron severity underneath. Detected from the child
  // input's own `value`, so every Field call site gets this for free.
  const value = isValidElement(children) ? (children.props as { value?: unknown }).value : undefined;
  const incomplete = hasErrors && isEmptyValue(value);
  const stateClass = hasErrors ? (incomplete ? 'field-incomplete' : 'field-invalid') : hint ? 'field-invalid' : '';

  // WCAG 3.3.1/4.1.2: the error text and hint are a DESCRIPTION of the input,
  // not part of its accessible NAME — without this, a screen reader would
  // fold the whole label's text (including error/hint copy that changes as
  // you type) into the input's name instead of announcing it as a separate,
  // stable description on focus. Falls back to a slug of the label for the
  // few call sites with no data-field (e.g. "Address scheme"), so every
  // Field that has something to describe gets a stable id, not only the
  // ones already wired into touch-tracking.
  const dataField = isValidElement(children) ? (children.props as Record<string, unknown>)['data-field'] : undefined;
  const hasDescription = hasErrors || !!hint;
  const describedById = hasDescription
    ? typeof dataField === 'string'
      ? `${dataField.replace(/\./g, '-')}-desc`
      : `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-desc`
    : undefined;
  const child =
    isValidElement(children) && describedById
      ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          'aria-describedby': describedById,
          'aria-invalid': hasErrors || undefined,
        })
      : children;

  return (
    <label className={`field ${stateClass}`}>
      <span className="field-label">{label}</span>
      {child}
      <div id={describedById}>
        <FieldErrors errors={errors} />
        {hint && <p className="field-hint">{hint}</p>}
      </div>
    </label>
  );
}
