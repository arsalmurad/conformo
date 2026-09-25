import { useEffect, useRef, useState } from 'react';
import type { Invoice } from '@conformo/core';
import type { TemplateId } from '@conformo/pdf';
import { InvoiceInputError } from '@conformo/formats';
import { buildPreviewPdf, type EmbeddableLogo } from '../pdf/exportPdf.js';
import { pdfjsReady, sharedWorker } from '../pdfjsWorker.js';

// Small on purpose:  is "the
// live preview reflects an edit within 500ms" end to end. This still
// coalesces a fast burst of keystrokes into one rebuild; it just doesn't
// make the user wait for it.
const DEBOUNCE_MS = 80;

interface Props {
  invoice: Invoice;
  template: TemplateId;
  logo: EmbeddableLogo | undefined;
  paymentLink: string;
}

/**
 * "There is currently no preview component anywhere in packages/ui/src. The
 * user fills a form and hopes."  — this
 * rasterizes the invoice page onto a <canvas> with pdf.js, at
 * devicePixelRatio for a crisp render on high-DPI screens. An earlier
 * version used an <iframe src="blob:...">, which avoided pdf.js's render
 * cost entirely but showed the browser's own PDF-viewer toolbar and a
 * "blob:http://..." identity — the opposite of "looks like a real product,"
 * which is the point of this phase.
 *
 * Hitting the 500ms budget with pdf.js turned out to need one real fix, not
 * the one it looked like at first: pdf.js's `getDocument()` creates a brand
 * new `PDFWorker` — a real Worker thread, re-fetching and re-executing the
 * ~2.3MB pdf.worker.mjs script — on *every call* unless one is passed in
 * explicitly. Profiling showed ~1100-2000ms on getDocument() alone, on every
 * edit, not just the first, because nothing was ever actually being reused.
 * `pdfjsWorker.ts`'s `sharedWorker` creates that `PDFWorker` once and every
 * render passes it via `getDocument({data, worker})`; measured after the
 * fix, getDocument() drops to single-digit milliseconds once warm.
 *
 * Also renders `buildPreviewPdf()` (exportPdf.ts), not `buildInvoicePdf()`:
 * the same page, without the PDF/A-3 wrapper (embedded XML, ICC profile,
 * XMP metadata) — pixel-identical to the real download, since finalizePDFA
 * never touches page content, but a smaller file for pdf.js to parse. A
 * smaller secondary win measured alongside the worker fix above, not the
 * fix itself: "what you see is what you get" still holds, since it's the
 * same layout code drawing the same page, just not re-wrapped in archival
 * metadata nothing on screen depends on.
 *
 * Renders to an off-screen canvas first and only blits the finished frame
 * onto the visible one in a single drawImage — the previous frame stays on
 * screen, unchanged, for the entire rebuild, so a slow edit never flashes a
 * blank or half-drawn page.
 */
export function InvoicePreview({ invoice, template, logo, paymentLink }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'rendering' | 'ready' | 'error'>('rendering');
  const [error, setError] = useState<string | undefined>();
  const generation = useRef(0);
  // pdfjs's own cancellation handle for whichever render() call is currently
  // drawing to the off-screen canvas — two renders in flight at once on the
  // same canvas throw "Cannot use the same canvas during multiple render()
  // operations" (found by actually loading the page: two edits landing
  // inside one debounce window, or React StrictMode's double effect
  // invocation in dev).
  const renderTask = useRef<{ cancel: () => void } | null>(null);
  const offscreen = useRef<HTMLCanvasElement | null>(null);
  // The worker is now shared/persistent (pdfjsWorker.ts's sharedWorker), so
  // each PDFDocumentProxy it loads needs its own destroy() once superseded —
  // previously a fresh worker was created (and the old one simply garbage
  // collected) on every render, which implicitly freed this; reusing one
  // worker across the app's lifetime means nothing else does that anymore.
  const currentDoc = useRef<{ destroy: () => Promise<void> } | null>(null);

  useEffect(() => {
    const myGeneration = ++generation.current;
    setStatus((s) => (s === 'ready' ? 'rendering' : s)); // keep showing the last good frame while a new one renders
    const timer = setTimeout(async () => {
      try {
        const bytes = await buildPreviewPdf(invoice, template, { logo, paymentLink: paymentLink || undefined });
        if (myGeneration !== generation.current) return;

        const [pdfjs, worker] = await Promise.all([pdfjsReady, sharedWorker]);
        // destroy() lives on the loading task getDocument() returns, not on
        // the PDFDocumentProxy its .promise resolves to — kept as a separate
        // reference for exactly that reason.
        const loadingTask = pdfjs.getDocument({ data: bytes, worker });
        const doc = await loadingTask.promise;
        const page = await doc.getPage(1);
        const canvas = canvasRef.current;
        if (!canvas || myGeneration !== generation.current) {
          loadingTask.destroy();
          return;
        }
        currentDoc.current?.destroy();
        currentDoc.current = loadingTask;

        // Fit to the panel's own CSS width, scaled up by devicePixelRatio so
        // the bitmap itself is sharp on a retina/high-DPI screen — canvas.width
        // is a pixel-buffer size, unrelated to its on-screen CSS size.
        const dpr = window.devicePixelRatio || 1;
        const cssWidth = canvas.parentElement?.clientWidth || 380;
        const unscaled = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (cssWidth / unscaled.width) * dpr });

        if (!offscreen.current) offscreen.current = document.createElement('canvas');
        const off = offscreen.current;
        off.width = viewport.width;
        off.height = viewport.height;
        const offCtx = off.getContext('2d');
        if (!offCtx) return;

        renderTask.current?.cancel();
        const task = page.render({ canvas: off, canvasContext: offCtx, viewport });
        renderTask.current = task;
        await task.promise;
        if (renderTask.current === task) renderTask.current = null;
        if (myGeneration !== generation.current) return;

        // The only part that touches the VISIBLE canvas: one atomic blit, so
        // the previous frame is on screen right up until this instant.
        canvas.width = off.width;
        canvas.height = off.height;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssWidth * (off.height / off.width)}px`;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(off, 0, 0);
        // A plain, DOM-observable completion signal for e2e tests — polling
        // this is far cheaper than diffing canvas pixel data on every tick.
        canvas.dataset.renderedGeneration = String(myGeneration);

        setError(undefined);
        setStatus('ready');
      } catch (err) {
        if (myGeneration !== generation.current) return;
        if (err instanceof Error && err.name === 'RenderingCancelledException') return;
        setError(err instanceof InvoiceInputError ? err.message : "Can't render a preview yet.");
        if (!(err instanceof InvoiceInputError)) console.warn('preview render failed:', err);
        setStatus('error');
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild on any input that changes what buildInvoicePdf produces
  }, [invoice, template, logo, paymentLink]);

  // Only on unmount — the effect above already destroys the PREVIOUS doc
  // each time it loads a new one, so this just cleans up the very last one.
  useEffect(() => () => {
    void currentDoc.current?.destroy();
  }, []);

  return (
    <aside className="preview-panel" aria-label="Invoice preview">
      <p className="preview-status">
        {status === 'error' ? error : status === 'rendering' ? 'Updating preview…' : 'Live preview — this is the PDF you’ll download.'}
      </p>
      <canvas ref={canvasRef} role="img" aria-label={`Preview of invoice ${invoice.number || 'draft'}`} />
    </aside>
  );
}
