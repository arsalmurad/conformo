import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Published layout: <pkg>/assets next to <pkg>/src. Repo layout: <repo>/assets, three levels up from src.
const candidates = ['../assets/', '../../../assets/'].map((r) => fileURLToPath(new URL(r, import.meta.url)));

function find(rel: string): string {
  for (const dir of candidates) if (existsSync(dir + rel)) return dir + rel;
  throw new Error(`Conformo asset ${rel} not found (looked in ${candidates.join(', ')})`);
}

let cache: { regular: Uint8Array; bold: Uint8Array; icc: Uint8Array } | undefined;

/** Work Sans (SIL OFL) and the sRGB ICC profile PDF/A needs. Read once. */
export function loadPdfAssets(): { regular: Uint8Array; bold: Uint8Array; icc: Uint8Array } {
  return (cache ??= {
    regular: readFileSync(find('fonts/WorkSans-Regular.ttf')),
    bold: readFileSync(find('fonts/WorkSans-Bold.ttf')),
    icc: readFileSync(find('sRGB.icc')),
  });
}
