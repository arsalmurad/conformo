import { z } from 'zod';
import { validate } from '@invoice-engine/validate';
import type { RuleResult } from '@invoice-engine/validate';

export const validateInvoiceSchema = {
  xml: z.string().describe('CII (Factur-X/ZUGFeRD) XML text to validate. UBL is not yet supported by @invoice-engine/validate.'),
  country: z.enum(['FR']).optional().describe('Also run this country\'s CIUS layer on top of EN 16931 (only France/BR-FR Flux 2 is compiled today).'),
};

const argsSchema = z.object(validateInvoiceSchema);

function formatRule(r: RuleResult): string {
  const fields = r.fields.length ? ` (${r.fields.join(', ')})` : '';
  const plain = r.plainLanguage ? `\n  Why: ${r.plainLanguage.why}\n  Fix: ${r.plainLanguage.fix}` : '';
  return `[${r.severity.toUpperCase()}] ${r.ruleId}${fields}\n  ${r.message}${plain}`;
}

export async function validateInvoice(args: z.infer<typeof argsSchema>) {
  try {
    const result = await validate(args.xml, args.country ? { country: args.country } : {});
    const failures = result.results.filter((r) => r.severity === 'error' || r.severity === 'fatal');
    const advisory = result.results.filter((r) => r.severity === 'warning' || r.severity === 'info');
    const header = `${result.valid ? 'VALID' : 'INVALID'} — ${result.firedCount} rules checked, ${failures.length} failed, ${advisory.length} advisory.`;
    const body = [...failures, ...advisory].map(formatRule).join('\n\n');
    return { content: [{ type: 'text' as const, text: body ? `${header}\n\n${body}` : header }] };
  } catch (err) {
    return { content: [{ type: 'text' as const, text: (err as Error).message }], isError: true };
  }
}
