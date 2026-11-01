import type { Invoice, Party } from '@conformo/core';
import { totals } from '@conformo/core';
import { localeForInvoice } from '@conformo/pdf';
import { looksLikeLeitwegId } from '@conformo/formats';
import type { Audience } from '../audience.js';
import { noteText, setNote, withSellerCountry } from '../audience.js';
import { useI18n } from '../i18n/I18n.js';
import { formatMoney } from '../money.js';
import type { PartyProfile } from '../profiles/types.js';
import { EAS_CODES } from '../profiles/eas.js';
import { checkVatFormat } from '../profiles/vat.js';
import type { Numbering } from '../numbering/useNumbering.js';
import type { Described } from '../validation/messages.js';
import { Field } from './Field.js';
import { CountryInput } from './CountryInput.js';
import { LocaleDateInput } from './LocaleDateInput.js';
import { NumberField } from './NumberField.js';
import { LineItems } from './LineItems.js';
import { ProfilePicker } from './ProfilePicker.js';

const CURRENCIES = ['EUR', 'CHF', 'GBP', 'USD', 'PLN', 'CZK', 'DKK', 'SEK', 'NOK', 'HUF', 'RON', 'BGN'];

interface Props {
  invoice: Invoice;
  onChange: (invoice: Invoice) => void;
  audience: Audience;
  /** The visible problem for a field (already filtered to touched fields), in the UI language. */
  errorFor: (key: string) => Described | undefined;
  onTouch: (key: string) => void;
  numbering: Numbering;
  profiles: PartyProfile[];
  onSaveProfile: (profile: PartyProfile) => void;
  onDeleteProfile: (id: string) => void;
}


/** The scheme travels with the address: EM for an email, 0204 for a Leitweg-ID, otherwise what the user picked. */
function schemeFor(address: string, current: string | undefined): string | undefined {
  if (!address) return undefined;
  if (address.includes('@')) return 'EM';
  if (looksLikeLeitwegId(address)) return '0204';
  return current && current !== 'EM' ? current : undefined;
}

export function InvoiceEditor({ invoice, onChange, audience, errorFor, onTouch, numbering, profiles, onSaveProfile, onDeleteProfile }: Props) {
  const { t, lang } = useI18n();
  const locale = localeForInvoice(invoice.buyer.country, invoice.seller.country);
  const isB2G = audience.id === 'de-b2g';
  const isFR = audience.id === 'fr-b2b';
  const req = (key: string) => audience.required.some((r) => r.key === key);

  const set = <K extends keyof Invoice>(key: K, value: Invoice[K]) => onChange({ ...invoice, [key]: value });
  const setParty = (side: 'seller' | 'buyer', patch: Partial<Party>) => onChange({ ...invoice, [side]: { ...invoice[side], ...patch } });
  const setContact = (patch: Partial<NonNullable<Party['contact']>>) =>
    setParty('seller', { contact: { ...invoice.seller.contact, ...patch } });

  // React's onBlur bubbles (it is focusout), so one handler marks whichever field was left as touched.
  const handleBlur = (e: React.FocusEvent<HTMLFormElement>) => {
    const key = (e.target as HTMLElement).dataset.field;
    if (key) onTouch(key);
  };

  let sum: ReturnType<typeof totals> | undefined;
  try { sum = totals(invoice); } catch { sum = undefined; }

  const vatHint = (v: string | undefined) => {
    if (!v) return undefined;
    const r = checkVatFormat(v);
    return r.valid ? undefined : (lang === 'de' ? `Ungewöhnliches Format: ${r.reason}.` : `Unusual format: this VAT ID ${r.reason}.`);
  };

  const party = (side: 'seller' | 'buyer') => {
    const p = invoice[side];
    const s = side === 'seller';
    const k = (f: string) => `${side}.${f}`;
    return (
      <>
        <Field fieldKey={k('name')} label={s ? t.fields.sellerName : t.fields.buyerName} error={errorFor(k('name'))} required>
          <input value={p.name} autoComplete={s ? 'organization' : 'off'} onChange={(e) => setParty(side, { name: e.target.value })} />
        </Field>
        <Field fieldKey={k('street')} label={t.fields.street} error={errorFor(k('street'))}>
          <input value={p.street ?? ''} autoComplete={s ? 'street-address' : 'off'} onChange={(e) => setParty(side, { street: e.target.value || undefined })} />
        </Field>
        <div className="row row-postcode">
          <Field fieldKey={k('postcode')} label={t.fields.postcode} error={errorFor(k('postcode'))} required={req(k('postcode'))}>
            <input value={p.postcode ?? ''} autoComplete={s ? 'postal-code' : 'off'} onChange={(e) => setParty(side, { postcode: e.target.value || undefined })} />
          </Field>
          <Field fieldKey={k('city')} label={t.fields.city} error={errorFor(k('city'))} required={req(k('city'))}>
            <input value={p.city ?? ''} autoComplete={s ? 'address-level2' : 'off'} onChange={(e) => setParty(side, { city: e.target.value || undefined })} />
          </Field>
        </div>
        <Field fieldKey={k('country')} label={t.fields.country} error={errorFor(k('country'))} required>
          <CountryInput value={p.country} onValue={(country) => (s ? onChange(withSellerCountry(invoice, country)) : setParty(side, { country }))} />
        </Field>
        <Field fieldKey={k('vatId')} label={s ? t.fields.vatId : t.fields.buyerVatId} hint={vatHint(p.vatId) ?? (s ? t.hints.vatId : undefined)} error={errorFor(k('vatId'))}>
          <input value={p.vatId ?? ''} spellCheck={false} onChange={(e) => setParty(side, { vatId: e.target.value.toUpperCase().replace(/\s/g, '') || undefined })} />
        </Field>
      </>
    );
  };

  const addressField = (side: 'seller' | 'buyer') => {
    const p = invoice[side];
    const k = `${side}.electronicAddress`;
    const address = p.electronicAddress ?? '';
    const needsScheme = !!address && !address.includes('@') && !looksLikeLeitwegId(address);
    return (
      <>
        <Field
          fieldKey={k}
          label={side === 'seller' ? t.fields.sellerEmail : t.fields.buyerEmail}
          hint={side === 'seller' ? t.hints.sellerEmail : isB2G ? t.hints.buyerEmailB2G : t.hints.buyerEmail}
          error={errorFor(k)}
          required={req(k)}
        >
          <input
            value={address}
            spellCheck={false}
            autoComplete={side === 'seller' ? 'email' : 'off'}
            onChange={(e) => {
              const v = e.target.value.trim();
              setParty(side, { electronicAddress: v || undefined, electronicAddressScheme: schemeFor(v, p.electronicAddressScheme) });
            }}
          />
        </Field>
        {needsScheme && (
          <Field fieldKey={`${side}.electronicAddressScheme`} label={t.fields.addressScheme} error={errorFor(`${side}.electronicAddressScheme`)} required>
            <select value={p.electronicAddressScheme ?? ''} onChange={(e) => setParty(side, { electronicAddressScheme: e.target.value || undefined })}>
              <option value="">—</option>
              {EAS_CODES.filter((c) => c.code !== 'EM').map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </Field>
        )}
      </>
    );
  };

  return (
    <form className="editor" onSubmit={(e) => e.preventDefault()} onBlur={handleBlur} noValidate>
      <section className="section" aria-labelledby="sec-seller">
        <div className="section-head">
          <h2 id="sec-seller"><span className="section-num" aria-hidden="true">1</span>{t.sections.seller}</h2>
          <ProfilePicker party={invoice.seller} profiles={profiles} onLoad={(seller) => onChange({ ...invoice, seller })}
            onSave={onSaveProfile} onDelete={onDeleteProfile} sectionLabel={t.sections.seller} />
        </div>
        {party('seller')}
        {invoice.seller.country === 'DE' && (
          <Field fieldKey="seller.taxRegistrationId" label={t.fields.taxRegistrationId} hint={t.hints.taxRegistrationId} error={errorFor('seller.taxRegistrationId')}>
            <input value={invoice.seller.taxRegistrationId ?? ''} onChange={(e) => setParty('seller', { taxRegistrationId: e.target.value || undefined })} />
          </Field>
        )}
        {isFR && (
          <Field fieldKey="seller.legalId" label={t.fields.legalId} hint={t.hints.legalId} error={errorFor('seller.legalId')} required>
            <input value={invoice.seller.legalId ?? ''} inputMode="numeric"
              onChange={(e) => setParty('seller', { legalId: e.target.value.replace(/\s/g, '') || undefined, legalIdScheme: e.target.value ? '0002' : undefined })} />
          </Field>
        )}
        {addressField('seller')}
        {isB2G && (
          <div className="subgroup">
            <p className="subgroup-hint">{t.hints.contact}</p>
            <Field fieldKey="seller.contact.name" label={t.fields.contactName} error={errorFor('seller.contact.name')} required>
              <input value={invoice.seller.contact?.name ?? ''} autoComplete="name" onChange={(e) => setContact({ name: e.target.value || undefined })} />
            </Field>
            <div className="row">
              <Field fieldKey="seller.contact.phone" label={t.fields.contactPhone} error={errorFor('seller.contact.phone')} required>
                <input type="tel" value={invoice.seller.contact?.phone ?? ''} autoComplete="tel" onChange={(e) => setContact({ phone: e.target.value || undefined })} />
              </Field>
              <Field fieldKey="seller.contact.email" label={t.fields.contactEmail} error={errorFor('seller.contact.email')} required>
                <input type="email" value={invoice.seller.contact?.email ?? ''} autoComplete="email" onChange={(e) => setContact({ email: e.target.value || undefined })} />
              </Field>
            </div>
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="sec-buyer">
        <div className="section-head">
          <h2 id="sec-buyer"><span className="section-num" aria-hidden="true">2</span>{t.sections.buyer}</h2>
          <ProfilePicker party={invoice.buyer} profiles={profiles} onLoad={(buyer) => onChange({ ...invoice, buyer })}
            onSave={onSaveProfile} onDelete={onDeleteProfile} sectionLabel={t.sections.buyer} />
        </div>
        {party('buyer')}
        {isB2G ? (
          <Field fieldKey="buyerReference" label={t.fields.leitwegId} hint={t.hints.leitwegId} error={errorFor('buyerReference')} required>
            <input
              value={invoice.buyerReference ?? ''}
              spellCheck={false}
              onChange={(e) => {
                const v = e.target.value.trim();
                const prev = invoice.buyerReference ?? '';
                // The authority's e-invoice address is normally its Leitweg-ID (scheme 0204): keep them in step while
                // the address is empty or still mirrors the Leitweg-ID.
                const mirror = !invoice.buyer.electronicAddress || invoice.buyer.electronicAddress === prev;
                onChange({
                  ...invoice,
                  buyerReference: v || undefined,
                  buyer: mirror ? { ...invoice.buyer, electronicAddress: v || undefined, electronicAddressScheme: v ? schemeFor(v, undefined) : undefined } : invoice.buyer,
                });
              }}
            />
          </Field>
        ) : (
          <Field fieldKey="buyerReference" label={t.fields.buyerReference} error={errorFor('buyerReference')}>
            <input value={invoice.buyerReference ?? ''} onChange={(e) => set('buyerReference', e.target.value || undefined)} />
          </Field>
        )}
        {addressField('buyer')}
      </section>

      <section className="section" aria-labelledby="sec-lines">
        <div className="section-head">
          <h2 id="sec-lines"><span className="section-num" aria-hidden="true">3</span>{t.sections.lines}</h2>
        </div>
        <div className="row row-details">
          <NumberField value={invoice.number} onChange={(n) => set('number', n)} numbering={numbering} error={errorFor('number')} />
          <Field fieldKey="issueDate" label={t.fields.issueDate} error={errorFor('issueDate')} required>
            <LocaleDateInput locale={locale} value={invoice.issueDate} onChange={(v) => set('issueDate', v)} />
          </Field>
          <Field fieldKey="dueDate" label={t.fields.dueDate} error={errorFor('dueDate')}>
            <LocaleDateInput locale={locale} value={invoice.dueDate ?? ''} onChange={(v) => set('dueDate', v || undefined)} />
          </Field>
          <Field fieldKey="currency" label={t.fields.currency} error={errorFor('currency')}>
            <select value={invoice.currency} onChange={(e) => set('currency', e.target.value)}>
              {(CURRENCIES.includes(invoice.currency) ? CURRENCIES : [invoice.currency, ...CURRENCIES]).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        {isFR && (
          <Field fieldKey="businessProcess" label={t.fields.businessProcess} error={errorFor('businessProcess')} required>
            <select value={invoice.businessProcess ?? ''} onChange={(e) => set('businessProcess', e.target.value || undefined)}>
              <option value="">—</option>
              {(['S1', 'B1', 'M1'] as const).map((c) => <option key={c} value={c}>{t.businessProcess[c]}</option>)}
            </select>
          </Field>
        )}
        <LineItems invoice={invoice} onChange={onChange} errorFor={errorFor} />
        {sum && (
          <dl className="totals num">
            <div><dt>{t.lines.subtotal}</dt><dd>{formatMoney(sum.taxBasis, invoice.currency, lang)}</dd></div>
            <div><dt>{t.lines.vat}</dt><dd>{formatMoney(sum.taxTotal, invoice.currency, lang)}</dd></div>
            <div className="totals-grand"><dt>{t.lines.total}</dt><dd>{formatMoney(sum.grand, invoice.currency, lang)}</dd></div>
          </dl>
        )}
        {errorFor('totals') && <p className="field-msg field-msg-error" data-field="totals" tabIndex={-1}>{errorFor('totals')!.text}</p>}
        {errorFor('lines') && <p className="field-msg field-msg-error" data-field="lines" tabIndex={-1}>{errorFor('lines')!.text}</p>}
      </section>

      <section className="section" aria-labelledby="sec-payment">
        <div className="section-head">
          <h2 id="sec-payment"><span className="section-num" aria-hidden="true">4</span>{t.sections.payment}</h2>
        </div>
        <div className="row">
          <Field fieldKey="payment.iban" label={t.fields.iban} error={errorFor('payment.iban')} className="grow">
            <input value={invoice.payment?.iban ?? ''} spellCheck={false}
              onChange={(e) => set('payment', { meansCode: '58', ...invoice.payment, iban: e.target.value.toUpperCase() || undefined })} />
          </Field>
          <Field fieldKey="payment.bic" label={t.fields.bic} error={errorFor('payment.bic')}>
            <input value={invoice.payment?.bic ?? ''} spellCheck={false}
              onChange={(e) => set('payment', { meansCode: '58', ...invoice.payment, bic: e.target.value.toUpperCase() || undefined })} />
          </Field>
        </div>
        <Field fieldKey="paymentTerms" label={t.fields.paymentTerms} error={errorFor('paymentTerms')}>
          <input value={invoice.paymentTerms ?? ''} onChange={(e) => set('paymentTerms', e.target.value || undefined)} />
        </Field>
        {isFR && (
          <div className="subgroup">
            <h3 className="subgroup-title">{t.sections.france}</h3>
            {(['AAB', 'PMD', 'PMT'] as const).map((code) => (
              <Field key={code} fieldKey={`notes.${code}`} label={t.fields[`note${code}`]} error={errorFor(`notes.${code}`)} required>
                <input value={noteText(invoice, code)} onChange={(e) => onChange(setNote(invoice, code, e.target.value))} />
              </Field>
            ))}
          </div>
        )}
      </section>
    </form>
  );
}
