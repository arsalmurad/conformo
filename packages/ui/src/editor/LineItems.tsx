import type { Invoice, Line, TaxCategory } from '@conformo/core';
import { lineNet } from '@conformo/core';
import { useI18n } from '../i18n/I18n.js';
import { standardRate } from '../countries.js';
import { formatMoney } from '../money.js';
import type { Described } from '../validation/messages.js';
import { Field } from './Field.js';
import { DecimalInput } from './DecimalInput.js';

/** K (intra-EU supply of goods) is left out on purpose: EN 16931 then also needs the delivery date and the
 * deliver-to country (BR-IC-11/12), which this form does not ask for yet (docs/DECISIONS.md). */
const CATEGORIES: TaxCategory[] = ['S', 'Z', 'E', 'AE', 'G', 'O'];

interface Props {
  invoice: Invoice;
  onChange: (invoice: Invoice) => void;
  errorFor: (key: string) => Described | undefined;
}

export function newLine(sellerCountry: string): Line {
  return { name: '', quantity: 1, unitPriceMinor: 0, taxCategory: 'S', taxRate: standardRate(sellerCountry) ?? 0 };
}

export function LineItems({ invoice, onChange, errorFor }: Props) {
  const { t, lang } = useI18n();
  const setLine = (i: number, patch: Partial<Line>) =>
    onChange({ ...invoice, lines: invoice.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) });

  function setCategory(i: number, category: TaxCategory) {
    const l = invoice.lines[i]!;
    if (category === 'S') {
      setLine(i, { taxCategory: 'S', taxRate: l.taxRate > 0 ? l.taxRate : standardRate(invoice.seller.country) ?? 0, exemptionReason: undefined, exemptionCode: undefined });
    } else {
      // Every category but S carries 0 % (BR-Z/E/AE/G-05, BR-O-05 forbids a rate at all), and every one but Z needs a
      // reason (BR-E/AE/G/O-10); BR-Z-10 forbids one on a zero-rated line.
      const reason = category === 'Z' ? undefined : l.exemptionReason || t.exemptionDefaults[category] || undefined;
      setLine(i, { taxCategory: category, taxRate: 0, exemptionReason: reason, exemptionCode: undefined });
    }
  }

  return (
    <div className="lines">
      {invoice.lines.map((line, i) => {
        const k = (f: string) => `lines.${i}.${f}`;
        let net: string;
        try { net = formatMoney(lineNet(line), invoice.currency, lang); } catch { net = '—'; }
        return (
          <fieldset className="line" key={i}>
            <legend className="line-legend">{t.lines.line(i + 1)}</legend>
            <Field fieldKey={k('name')} label={t.fields.lineName} error={errorFor(k('name'))} required className="line-name">
              <input value={line.name} onChange={(e) => setLine(i, { name: e.target.value })} />
            </Field>
            <div className="line-grid">
              <Field fieldKey={k('quantity')} label={t.fields.quantity} error={errorFor(k('quantity'))} className="line-qty">
                <DecimalInput kind="decimal" value={line.quantity} onValue={(quantity) => setLine(i, { quantity })} />
              </Field>
              <Field fieldKey={k('unitPriceMinor')} label={`${t.fields.unitPrice}, ${invoice.currency}`} error={errorFor(k('unitPriceMinor'))} className="line-price">
                <DecimalInput kind="money" value={line.unitPriceMinor} onValue={(unitPriceMinor) => setLine(i, { unitPriceMinor })} />
              </Field>
              <Field fieldKey={k('taxCategory')} label={t.fields.vatType} error={errorFor(k('taxCategory'))} className="line-vat">
                <select value={line.taxCategory} onChange={(e) => setCategory(i, e.target.value as TaxCategory)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{t.vatCategories[c]}</option>)}
                  {!CATEGORIES.includes(line.taxCategory) && <option value={line.taxCategory}>{line.taxCategory}</option>}
                </select>
              </Field>
              {line.taxCategory === 'S' && (
                <Field fieldKey={k('taxRate')} label={t.fields.vatRate} error={errorFor(k('taxRate'))} className="line-rate">
                  <DecimalInput kind="decimal" value={line.taxRate} onValue={(taxRate) => setLine(i, { taxRate })} />
                </Field>
              )}
              <div className="line-total" aria-live="off">
                <span className="field-label">{t.fields.lineTotal}</span>
                <output className="line-total-value num">{net}</output>
              </div>
            </div>
            {line.taxCategory !== 'S' && line.taxCategory !== 'Z' && (
              <Field fieldKey={k('exemptionReason')} label={t.fields.exemptionReason} error={errorFor(k('exemptionReason'))} required>
                <input value={line.exemptionReason ?? ''} onChange={(e) => setLine(i, { exemptionReason: e.target.value || undefined })} />
              </Field>
            )}
            {invoice.lines.length > 1 && (
              <button
                type="button"
                className="btn btn-quiet line-remove"
                onClick={() => onChange({ ...invoice, lines: invoice.lines.filter((_, idx) => idx !== i) })}
              >
                {t.lines.remove(i + 1)}
              </button>
            )}
          </fieldset>
        );
      })}
      <button type="button" className="btn btn-secondary" onClick={() => onChange({ ...invoice, lines: [...invoice.lines, newLine(invoice.seller.country)] })}>
        + {t.lines.add}
      </button>
    </div>
  );
}
