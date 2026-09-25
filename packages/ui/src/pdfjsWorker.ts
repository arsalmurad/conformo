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
 *
 * `sharedWorker` matters independently of the module-instance point above:
 * pdfjs's own `getDocument()` creates a brand-new `PDFWorker` — a real
 * `Worker` thread, re-fetching and re-executing the ~2.3MB pdf.worker.mjs
 * script from scratch — on *every single call* unless one is passed in
 * explicitly via the `worker` option. Found by profiling the live preview:
 * getDocument() alone cost ~1100ms on every edit, not just the first, with
 * no improvement after the "first" render — because there was no shared
 * worker to warm up in the first place, each call was silently paying full
 * worker-startup cost again. Passing `await sharedWorker` as `worker` in
 * `getDocument({data, worker})` reuses the same thread for the app's
 * lifetime.
 */
export const pdfjsReady = import('pdfjs-dist/legacy/build/pdf.mjs').then(async (pdfjs) => {
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
});

// `new PDFWorker()` returns synchronously, before the Worker thread it
// spins up has actually finished loading/initializing — awaiting its own
// `.promise` (not just the constructor call) is what makes this resolve
// only once the worker is genuinely ready to receive a document. Skipping
// this was a real, if intermittent, bug: getDocument() still waits for that
// same internal readiness regardless, so a caller racing ahead on the bare
// constructor could still pay part of worker-startup cost on what should
// have been an already-warm call.
export const sharedWorker = pdfjsReady.then(async (pdfjs) => {
  const worker = new pdfjs.PDFWorker();
  await worker.promise;
  return worker;
});
