import { defineConfig } from 'vite';

// No framework, no PWA plugin: this page is one screen with one job
// (validate a file), kept deliberately small and separately deployable
// from packages/ui .
//
// base defaults to root ("/"), unchanged for local dev and CI. Set
// VITE_BASE_PATH at build time to deploy under a subpath instead (e.g.
// `VITE_BASE_PATH=/conformo/validator/ npm run build`) — src/browserValidator.ts
// reads the same value at runtime via `import.meta.env.BASE_URL` rather than
// hardcoding "/".
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
});
