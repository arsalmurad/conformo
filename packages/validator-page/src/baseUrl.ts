/**
 * `import.meta.env.BASE_URL` (Vite's own reflection of vite.config.ts's
 * `base`) without depending on the global `vite/client` ambient types: this
 * file is reachable from the root, Node-context tsconfig.json's own include
 * glob via a plain-.ts import (main.ts -> browserValidator.ts), which
 * doesn't set `types: ["vite/client"]`, and there is no way to *exclude* a
 * file from that pass once something else already reachable from it imports
 * it. A local, narrow type assertion sidesteps the whole problem: it needs
 * no global augmentation, so it compiles cleanly under either tsconfig.
 */
export const BASE_URL: string = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
