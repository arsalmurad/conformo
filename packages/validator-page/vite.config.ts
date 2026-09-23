import { defineConfig } from 'vite';

// No framework, no PWA plugin: this page is one screen with one job
// (validate a file), kept deliberately small and separately deployable
// from packages/ui .
export default defineConfig({});
