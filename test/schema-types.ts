/**
 * Compile-time check (tsc, not vitest): the zod schema and core's Invoice must be assignable to each other, so the
 * schema cannot drift from the model. Adding a field to one without the other makes `npx tsc -p tsconfig.json` fail here.
 */
import type { z } from 'zod';
import type { Invoice } from '@conformo/core';
import type { invoiceSchema } from '@conformo/schema';

type Inferred = z.infer<typeof invoiceSchema>;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

/** Exact structural equality would trip on `string & {}`; two-way assignability is what matters. */
export const schemaToModel = (x: Inferred): Invoice => x;
export const modelToSchema = (x: Invoice): Inferred => x;

/** Same keys at the top level and in the nested shapes that carry the most fields. */
type SameKeys<A, B> = Equal<keyof A, keyof B>;
export const topLevelKeys: SameKeys<Inferred, Invoice> = true;
export const lineKeys: SameKeys<Inferred['lines'][number], Invoice['lines'][number]> = true;
export const partyKeys: SameKeys<Inferred['seller'], Invoice['seller']> = true;
export const paymentKeys: SameKeys<NonNullable<Inferred['payment']>, NonNullable<Invoice['payment']>> = true;
