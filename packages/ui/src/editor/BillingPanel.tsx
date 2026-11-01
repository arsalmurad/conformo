import { useState } from 'react';
import type { Invoice, Line } from '@conformo/core';
import { DecimalInput } from './DecimalInput.js';
import { useI18n } from '../i18n/I18n.js';
import { formatMoney } from '../money.js';
import { standardRate } from '../countries.js';

const SHORTCUTS = [50, 100];

interface Props {
  invoice: Invoice;
  onChange: (invoice: Invoice) => void;
}

/** The "percent-of-project billing" hard requirement: a control for billing
 * some percentage of an agreed total (a deposit, a final balance) rather
 * than hand-computing it, with the already-paid portion mapped straight to
 * BT-113 (prepaid amount). The percentage and project total are UI-only
 * bookkeeping — not part of the EN 16931 model, which has no concept of a
 * "project" spanning multiple invoices — used here only to compute the one
 * thing the model DOES represent: a line item and a prepaid amount, on THIS
 * invoice. Remaining-balance tracking is therefore necessarily a manual
 * running total: nothing before this session knows what a project's earlier
 * invoices billed unless the user says so, since two invoices are always
 * separate encrypted-and-exported documents, never a shared record. */
export function BillingPanel({ invoice, onChange }: Props) {
  const { lang } = useI18n();
  const de = lang === 'de';
  const [percentMode, setPercentMode] = useState(false);
  const [projectTotalMinor, setProjectTotalMinor] = useState(0);
  const [percent, setPercent] = useState(50);

  const thisInvoiceMinor = Math.round((projectTotalMinor * percent) / 100);
  const prepaid = invoice.prepaidMinor ?? 0;
  const remaining = projectTotalMinor - prepaid - thisInvoiceMinor;

  function applyPercentLine() {
    const line: Line = {
      name: de ? `Projektzahlung: ${percent} % von ${formatMoney(projectTotalMinor, invoice.currency, lang)}` : `Project payment: ${percent}% of ${formatMoney(projectTotalMinor, invoice.currency, lang)}`,
      quantity: 1,
      unitPriceMinor: thisInvoiceMinor,
      taxCategory: invoice.lines[0]?.taxCategory ?? 'S',
      taxRate: invoice.lines[0]?.taxRate ?? standardRate(invoice.seller.country) ?? 0,
    };
    onChange({ ...invoice, lines: [line] });
  }

  return (
    <fieldset className="billing-panel">
      <legend>{de ? 'Abschlagsrechnung' : 'Deposits and part payments'}</legend>
      <label className="billing-toggle">
        <input type="checkbox" checked={percentMode} onChange={(e) => setPercentMode(e.target.checked)} />
        {de ? 'Einen Prozentsatz eines Projektbetrags berechnen' : 'Bill a percentage of a total project value'}
      </label>

      {percentMode && (
        <div className="billing-percent">
          <div className="field">
            <label className="field-label" htmlFor="billing-total">{de ? 'Projektbetrag (netto)' : 'Project total (net)'}, {invoice.currency}</label>
            <DecimalInput id="billing-total" kind="money" value={projectTotalMinor} onValue={setProjectTotalMinor} />
          </div>
          <div className="billing-shortcuts">
            {SHORTCUTS.map((p) => (
              <button type="button" key={p} className="btn btn-secondary" aria-pressed={percent === p} onClick={() => setPercent(p)}>
                {p} %
              </button>
            ))}
            <label className="billing-custom-percent">
              <span className="visually-hidden">{de ? 'Prozentsatz' : 'Percentage'}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={percent}
                onChange={(e) => setPercent(Math.max(0, Math.min(100, Number(e.target.value))))}
              />
              %
            </label>
          </div>
          <p className="billing-computed">
            {de ? 'Diese Rechnung' : 'This invoice'}: <span className="num">{formatMoney(thisInvoiceMinor, invoice.currency, lang)}</span>
          </p>
          <button type="button" className="btn btn-secondary" onClick={applyPercentLine} disabled={thisInvoiceMinor <= 0}>
            {de ? 'Positionen durch diesen Betrag ersetzen' : 'Replace the invoice lines with this amount'}
          </button>
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor="billing-prepaid">{de ? 'Bereits bezahlt (Anzahlung)' : 'Already paid (deposit received)'}, {invoice.currency}</label>
        <DecimalInput id="billing-prepaid" kind="money" value={prepaid} onValue={(prepaidMinor) => onChange({ ...invoice, prepaidMinor: prepaidMinor || undefined })} />
      </div>

      {percentMode && projectTotalMinor > 0 && (
        <p className="billing-remaining">
          {de ? 'Offen nach dieser Rechnung' : 'Remaining after this invoice'}: <span className="num">{formatMoney(remaining, invoice.currency, lang)}</span>
        </p>
      )}
    </fieldset>
  );
}
