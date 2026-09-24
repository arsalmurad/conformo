import { useState } from 'react';
import type { Invoice, Line } from '@conformo/core';
import { toMajor } from '@conformo/core';
import { MoneyInput } from './MoneyInput.js';

const SHORTCUTS: { percent: number; label: string }[] = [
  { percent: 50, label: '50% (deposit)' },
  { percent: 100, label: '100% (full amount)' },
];

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
 * running total: nothing before this codebase knows what a project's earlier
 * invoices billed unless the user says so, since two invoices are always
 * separate encrypted-and-exported documents, never a shared record. */
export function BillingPanel({ invoice, onChange }: Props) {
  const [percentMode, setPercentMode] = useState(false);
  const [projectTotalMinor, setProjectTotalMinor] = useState(0);
  const [percent, setPercent] = useState(50);

  const thisInvoiceMinor = Math.round((projectTotalMinor * percent) / 100);
  const prepaid = invoice.prepaidMinor ?? 0;
  const remaining = projectTotalMinor - prepaid - thisInvoiceMinor;

  function applyPercentLine() {
    const line: Line = {
      name: `Project payment — ${percent}% of ${toMajor(projectTotalMinor)} ${invoice.currency}`,
      quantity: 1,
      unitPriceMinor: thisInvoiceMinor,
      taxCategory: invoice.lines[0]?.taxCategory ?? 'S',
      taxRate: invoice.lines[0]?.taxRate ?? 0,
    };
    onChange({ ...invoice, lines: [line] });
  }

  return (
    <fieldset className="billing-panel">
      <legend>Billing</legend>
      <label className="billing-toggle">
        <input type="checkbox" checked={percentMode} onChange={(e) => setPercentMode(e.target.checked)} />
        Bill a percentage of a total project value
      </label>

      {percentMode && (
        <div className="billing-percent">
          <label className="field">
            <span className="field-label">Project total</span>
            <MoneyInput minor={projectTotalMinor} onChange={setProjectTotalMinor} />
          </label>
          <div className="billing-shortcuts">
            {SHORTCUTS.map((s) => (
              <button
                type="button"
                key={s.percent}
                className={percent === s.percent ? 'active' : ''}
                onClick={() => setPercent(s.percent)}
              >
                {s.label}
              </button>
            ))}
            <label className="billing-custom-percent">
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
            This invoice: {toMajor(thisInvoiceMinor)} {invoice.currency}
          </p>
          <button type="button" onClick={applyPercentLine} disabled={thisInvoiceMinor <= 0}>
            Replace invoice lines with this amount
          </button>
        </div>
      )}

      <label className="field">
        <span className="field-label">Already paid (deposit received on this project)</span>
        <MoneyInput minor={prepaid} onChange={(prepaidMinor) => onChange({ ...invoice, prepaidMinor })} />
      </label>

      {percentMode && projectTotalMinor > 0 && (
        <p className="billing-remaining">
          Remaining after this invoice: {toMajor(remaining)} {invoice.currency}
        </p>
      )}
    </fieldset>
  );
}
