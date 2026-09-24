import { z } from 'zod';
import type { Invoice } from '@conformo/core';
import { InvoiceInputError } from '@conformo/formats';
import { checkXRechnung } from '@conformo/formats';
import { FORMAT_IDS, serialize } from '../format.js';
import type { FormatId } from '../format.js';

export const createInvoiceSchema = {
  invoiceJson: z.string().describe(
    'A JSON-encoded Invoice object matching the EN 16931 model in @conformo/core '
    + '(BT/BG-identified fields: number, issueDate, currency, seller, buyer, payment, lines, ...). '
    + 'Money fields (unitPriceMinor, amountMinor, etc.) are integers in minor units (cents), never floats.',
  ),
  format: z.enum(FORMAT_IDS).describe(
    "Target syntax: 'cii' (Factur-X/ZUGFeRD), 'ubl' (UBL 2.1 Invoice/CreditNote), "
    + "'xrechnung-cii' / 'xrechnung-ubl' (the German CIUS), or 'peppol-ubl' (Peppol BIS Billing 3.0).",
  ),
};

const argsSchema = z.object(createInvoiceSchema);

export async function createInvoice(args: z.infer<typeof argsSchema>) {
  let invoice: Invoice;
  try {
    invoice = JSON.parse(args.invoiceJson) as Invoice;
  } catch (err) {
    return errorResult(`invoiceJson is not valid JSON: ${(err as Error).message}`);
  }

  const format = args.format as FormatId;
  const warnings = format.startsWith('xrechnung')
    ? checkXRechnung(invoice).map((i) => `[${i.severity.toUpperCase()} ${i.rule}] ${i.message}`)
    : [];

  try {
    const xml = serialize(invoice, format);
    const text = warnings.length
      ? `Warnings (not fatal — run validate_invoice for the authoritative Schematron result):\n${warnings.join('\n')}\n\n${xml}`
      : xml;
    return { content: [{ type: 'text' as const, text }] };
  } catch (err) {
    if (err instanceof InvoiceInputError) return errorResult(err.message);
    throw err;
  }
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}
