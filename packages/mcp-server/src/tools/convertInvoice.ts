import { z } from 'zod';
import { detectXmlFormat, extractEmbeddedXml } from '@verinvoice/parse';
import { FORMAT_IDS, serialize } from '../format.js';
import type { FormatId } from '../format.js';

export const convertInvoiceSchema = {
  source: z.string().describe(
    'The source invoice: CII/UBL/XRechnung XML text, or (when sourceIsPdf is true) '
    + 'a base64-encoded Factur-X/ZUGFeRD PDF.',
  ),
  sourceIsPdf: z.boolean().optional().describe('Set true when `source` is base64-encoded PDF bytes rather than XML text.'),
  targetFormat: z.enum(FORMAT_IDS).describe('The syntax to convert into — see create_invoice for what each value means.'),
};

const argsSchema = z.object(convertInvoiceSchema);

export async function convertInvoice(args: z.infer<typeof argsSchema>) {
  try {
    let xml: string;
    if (args.sourceIsPdf) {
      const bytes = Uint8Array.from(Buffer.from(args.source, 'base64'));
      xml = (await extractEmbeddedXml(bytes)).xml;
    } else {
      xml = args.source;
    }
    const { invoice, format: sourceFormat } = detectXmlFormat(xml);
    const target = args.targetFormat as FormatId;
    const converted = serialize(invoice, target);
    return {
      content: [{ type: 'text' as const, text: `Converted from ${sourceFormat} to ${target}:\n\n${converted}` }],
    };
  } catch (err) {
    return { content: [{ type: 'text' as const, text: (err as Error).message }], isError: true };
  }
}
