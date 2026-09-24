import { useEffect, useRef, useState } from 'react';
import type { Invoice } from '@invoice-engine/core';
import type { TemplateId } from '@invoice-engine/pdf';
import { InvoiceInputError } from '@invoice-engine/formats';
import { buildInvoicePdf, type EmbeddableLogo } from '../pdf/exportPdf.js';

// Small on purpose:  is "the
// live preview reflects an edit within 500ms" end to end, and rebuilding the
// real PDF/A-3 (font embedding, page layout, the PDF/A wrapper) already costs
// a good fraction of that budget on its own. This still coalesces a fast
// burst of keystrokes into one rebuild; it just doesn't make the user wait
// for it.
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
 * shows the exact PDF bytes buildInvoicePdf() would download, in an <iframe>
 * pointed at a blob URL rather than rasterized by pdfjs onto a canvas: the
 * browser's own native PDF viewer, the same one that would open the
 * downloaded file, so "what you see is what you get" by construction rather
 * than by two renderers agreeing. Also markedly faster — an early pdfjs+canvas
 * version blew the 500ms budget below on getDocument()/render() alone (measured
 * 600-700ms per edit even warm), while native rendering does not.
 */
export function InvoicePreview({ invoice, template, logo, paymentLink }: Props) {
  const [status, setStatus] = useState<'rendering' | 'ready' | 'error'>('rendering');
  const [error, setError] = useState<string | undefined>();
  const [url, setUrl] = useState<string | undefined>();
  const generation = useRef(0);
  const urlToRevoke = useRef<string | undefined>(undefined);

  useEffect(() => {
    const myGeneration = ++generation.current;
    setStatus((s) => (s === 'ready' ? 'rendering' : s)); // keep showing the last good page while a new one renders
    const timer = setTimeout(async () => {
      try {
        const bytes = await buildInvoicePdf(invoice, template, { logo, paymentLink: paymentLink || undefined });
        if (myGeneration !== generation.current) return;

        const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
        const nextUrl = URL.createObjectURL(blob);
        // Revoked on the NEXT successful render, not here — revoking the URL
        // the iframe is still displaying would blank it before the new one
        // has loaded.
        const previous = urlToRevoke.current;
        urlToRevoke.current = nextUrl;
        setUrl(nextUrl);
        if (previous) URL.revokeObjectURL(previous);
        setError(undefined);
        setStatus('ready');
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

  // Only on unmount — the effect above already revokes the PREVIOUS url each
  // time it makes a new one, so this just cleans up the very last one.
  useEffect(() => () => { if (urlToRevoke.current) URL.revokeObjectURL(urlToRevoke.current); }, []);

  return (
    <aside className="preview-panel" aria-label="Invoice preview">
      <p className="preview-status">
        {status === 'error' ? error : status === 'rendering' ? 'Updating preview…' : 'Live preview — this is the PDF you’ll download.'}
      </p>
      {url && <iframe src={url} title={`Preview of invoice ${invoice.number || 'draft'}`} />}
    </aside>
  );
}
