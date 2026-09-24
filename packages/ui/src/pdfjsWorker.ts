/**
 * One shared pdfjs-dist worker setup for every consumer in this package
 * (InvoiceDropzone's PDF import, InvoicePreview's live rendering). Without
 * this, pdfjs throws "No GlobalWorkerOptions.workerSrc specified" once
 * bundled by Vite for a real browser — Node needs no such setup, which is
 * why this was only found by actually loading the page (see
 * an earlier pass). Centralized here, not duplicated per
 * caller, so there is exactly one place importing
 * 'pdfjs-dist/legacy/build/pdf.mjs' — Vite treats every import of the same
 * specifier as the same module instance, and a second, differently-worded
 * import elsewhere would risk resolving to a second bundle with its own
 * unconfigured GlobalWorkerOptions.
 */
export const pdfjsReady = import('pdfjs-dist/legacy/build/pdf.mjs').then(async (pdfjs) => {
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
});
