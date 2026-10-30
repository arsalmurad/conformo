import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Read from package.json (src/../package.json in the repo and in dist/), never hardcoded. */
export const SERVER_VERSION: string = (() => {
  try {
    const p = fileURLToPath(new URL('../package.json', import.meta.url));
    return (JSON.parse(readFileSync(p, 'utf8')) as { version: string }).version;
  } catch {
    return '0.0.0';
  }
})();
