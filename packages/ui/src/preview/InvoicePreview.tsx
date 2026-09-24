import { useEffect, useRef, useState } from 'react';
import type { Invoice } from '@invoice-engine/core';
import type { TemplateId } from '@invoice-engine/pdf';
import { InvoiceInputError } from '@invoice-engine/formats';
import { buildInvoicePdf, type EmbeddableLogo } from '../pdf/exportPdf.js';
import { pdfjsReady } from '../pdfjsWorker.js';

const DEBOUNCE_MS = 400;

interface Props {
  invoice: Invoice;
  template: TemplateId;
  logo: EmbeddableLogo | undefined;
  paymentLink: string;
}

/**
 * "There is currently no preview component anywhere in packages/ui/src. The
 * user fills a form and hopes."  — this
 * renders the exact PDF bytes buildInvoicePdf() would download, not a
 * parallel HTML mock of the layout: "what you see is what you get" by
 * construction, since it's literally the same function the download button
 * calls, rasterized client-side with pdfjs-dist rather than reimplemented.
 */
export function InvoicePreview({ invoice, template, logo, paymentLink }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'rendering' | 'ready' | 'error'>('rendering');
  const [error, setError] = useState<string | undefined>();
  const generation = useRef(0);

  useEffect(() => {
    const myGeneration = ++generation.current;
    setStatus((s) => (s === 'ready' ? 'rendering' : s)); // keep showing the last good page while a new one renders
    const timer = setTimeout(async () => {
      try {
        const bytes = await buildInvoicePdf(invoice, template, { logo, paymentLink: paymentLink || undefined });
        if (myGeneration !== generation.current) return;

        const pdfjs = await pdfjsReady;
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        const page = await doc.getPage(1);
        const canvas = canvasRef.current;
        if (!canvas || myGeneration !== generation.current) return;

        // Fit the canvas to the panel's own width rather than a fixed scale,
        // so the preview stays sharp whether the panel is a 380px sidebar or
        // full-width on a phone.
        const targetWidth = canvas.parentElement?.clientWidth || 380;
        const unscaled = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: targetWidth / unscaled.width });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        if (myGeneration === generation.current) {
          setError(undefined);
          setStatus('ready');
        }
      } catch (err) {
        if (myGeneration !== generation.current) return;
        setError(err instanceof InvoiceInputError ? err.message : "Can't render a preview yet.");
        if (!(err instanceof InvoiceInputError)) console.warn('preview render failed:', err);
        setStatus('error');
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild on any input that changes what buildInvoicePdf produces
  }, [invoice, template, logo, paymentLink]);

  return (
    <aside className="preview-panel" aria-label="Invoice preview">
      <p className="preview-status">
        {status === 'error' ? error : status === 'rendering' ? 'Updating preview…' : 'Live preview — this is the PDF you’ll download.'}
      </p>
      <canvas ref={canvasRef} role="img" aria-label={`Preview of invoice ${invoice.number || 'draft'}`} />
    </aside>
  );
}
