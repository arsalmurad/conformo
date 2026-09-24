/**
 * Same pattern as packages/ui/src/validation/browserValidator.ts: loads the
 * free SaxonJS2.rt.js runtime as a real <script> tag and the compiled SEF
 * artefacts as fetched JSON, then runs @conformo/validate's browser
 * entry point (never the Node one, which imports node:fs and cannot be
 * bundled for a browser at all). Assets are served from public/validator/,
 * populated by scripts/copy-validator-assets.mjs.
 */
import { validateInBrowser } from '@conformo/validate/browser';
import type { SaxonJSLike, ValidationResult } from '@conformo/validate/browser';
import { BASE_URL } from './baseUrl.js';

let saxonPromise: Promise<SaxonJSLike> | undefined;
let en16931Promise: Promise<object> | undefined;
let frCtcPromise: Promise<object> | undefined;

function loadSaxon(): Promise<SaxonJSLike> {
  if (!saxonPromise) {
    saxonPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      // BASE_URL (baseUrl.ts), not a hardcoded "/" — see vite.config.ts's
      // VITE_BASE_PATH, for when this is deployed under a subpath.
      script.src = `${BASE_URL}validator/SaxonJS2.rt.js`;
      script.onload = () => resolve((window as unknown as { SaxonJS: SaxonJSLike }).SaxonJS);
      script.onerror = () => reject(new Error('failed to load the SaxonJS runtime'));
      document.head.appendChild(script);
    });
  }
  return saxonPromise;
}

function loadSef(name: 'en16931' | 'fr-ctc'): Promise<object> {
  return fetch(`${BASE_URL}validator/${name}.sef.json`).then((r) => {
    if (!r.ok) throw new Error(`missing compiled Schematron artefact ${name}.sef.json (run npm run schematron:compile)`);
    return r.json();
  });
}

export async function validateInvoiceXml(xml: string, country: 'FR' | ''): Promise<ValidationResult> {
  const [saxonJs, en16931] = await Promise.all([
    loadSaxon(),
    (en16931Promise ??= loadSef('en16931')),
  ]);
  const frCtc = country === 'FR' ? await (frCtcPromise ??= loadSef('fr-ctc')) : undefined;
  return validateInBrowser(saxonJs, xml, en16931, frCtc);
}
