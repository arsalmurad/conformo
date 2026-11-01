/**
 * @conformo/schema: the Invoice model as a zod schema plus its JSON Schema. The committed invoice.schema.json is generated
 * by `npm run schema:generate` and checked for freshness by test/schema.test.ts.
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { invoiceSchema } from './invoice.js';

export * from './invoice.js';

/** JSON Schema (draft-07) for the Invoice, generated from `invoiceSchema`. Inlined, no $ref. */
export const invoiceJsonSchema = zodToJsonSchema(invoiceSchema, {
  target: 'jsonSchema7',
  $refStrategy: 'none',
}) as Record<string, unknown> & { $schema: string };

/** Exactly the text committed as packages/schema/invoice.schema.json. */
export const invoiceJsonSchemaText = `${JSON.stringify({ ...invoiceJsonSchema, title: 'Conformo Invoice (EN 16931)' }, null, 2)}\n`;
