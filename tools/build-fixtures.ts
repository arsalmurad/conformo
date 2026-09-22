/**
 * Serializes every fixture into every format tools/validate.py must check it
 * against, per tools/fixtures.manifest.ts. Output goes to out/fixtures/, one
 * file per (fixture, target) pair, named so validate.py can find it without
 * re-deriving the mapping.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Invoice } from '@invoice-engine/core';
import { buildCII, buildUBL, buildXRechnungCII, buildXRechnungUBL } from '@invoice-engine/formats';
import { FIXTURES } from './fixtures.manifest.js';
import type { Target } from './fixtures.manifest.js';

const OUT = 'out/fixtures';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

function serialize(target: Target, invoice: Invoice): string {
  switch (target) {
    case 'cii-en16931': return buildCII(invoice);
    case 'ubl-en16931': return buildUBL(invoice);
    case 'ubl-peppol': return buildUBL(invoice, { profile: 'peppol' });
    case 'cii-xrechnung': return buildXRechnungCII(invoice);
    case 'ubl-xrechnung': return buildXRechnungUBL(invoice);
  }
}

let count = 0;
for (const spec of FIXTURES) {
  const invoice = JSON.parse(fs.readFileSync(path.join('fixtures', spec.file), 'utf8')) as Invoice;
  const stem = spec.file.replace(/\.json$/, '').replace(/\//g, '__');
  for (const target of spec.targets) {
    const xml = serialize(target, invoice);
    fs.writeFileSync(path.join(OUT, `${stem}__${target}.xml`), xml);
    count++;
  }
}
console.log(`wrote ${count} fixture XML files to ${OUT}/`);
