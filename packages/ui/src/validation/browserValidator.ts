import { validateInBrowser } from '@invoice-engine/validate/browser';
import type { SaxonJSLike, ValidationResult } from '@invoice-engine/validate/browser';

/**
 * Loads the free SaxonJS2.rt.js runtime (no Node built-ins — see
 * tools/fetch-saxonjs.mjs) as a real <script> tag, the way a browser page
 * does it, and the compiled SEF artefacts as fetched JSON. This is the
 * browser-only counterpart to @invoice-engine/validate's Node entry: that
 * entry imports `node:fs` and the Node `saxon-js` package directly, which
 * cannot be bundled for a browser at all, so this module — not that one —
 * is what packages/ui is allowed to import. All three files are served from
 * public/validator/ (gitignored; populated by `npm run copy-validator-assets`,
 * which prebuild/predev already runs).
 */
let saxonPromise: Promise<SaxonJSLike> | undefined;
let en16931Promise: Promise<object> | undefined;
let frCtcPromise: Promise<object> | undefined;

function loadSaxon(): Promise<SaxonJSLike> {
  if (!saxonPromise) {
    saxonPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/validator/SaxonJS2.rt.js';
      script.onload = () => resolve((window as unknown as { SaxonJS: SaxonJSLike }).SaxonJS);
      script.onerror = () => reject(new Error('failed to load the SaxonJS runtime'));
      document.head.appendChild(script);
    });
  }
  return saxonPromise;
}

function loadSef(name: 'en16931' | 'fr-ctc'): Promise<object> {
  return fetch(`/validator/${name}.sef.json`).then((r) => {
    if (!r.ok) throw new Error(`missing compiled Schematron artefact ${name}.sef.json (run npm run schematron:compile)`);
    return r.json();
  });
}

export async function validateInvoiceXml(xml: string, country: 'FR' | undefined): Promise<ValidationResult> {
  const [saxonJs, en16931] = await Promise.all([
    loadSaxon(),
    (en16931Promise ??= loadSef('en16931')),
  ]);
  const frCtc = country === 'FR' ? await (frCtcPromise ??= loadSef('fr-ctc')) : undefined;
  return validateInBrowser(saxonJs, xml, en16931, frCtc);
}
