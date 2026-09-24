import { useCallback, useState } from 'react';
import type { Invoice } from '@conformo/core';
import { pdfjsReady } from '../pdfjsWorker.js';

interface Props {
  onImport: (invoice: Invoice) => void;
}

// Matches parseXml.ts's own default (20 MB), checked here too so a huge file
// never even reaches the parser — this is a pre-filter, not a substitute for
// the parser's own limits (which also cap depth and node count).
const MAX_BYTES = 20 * 1024 * 1024;

type Status =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string };

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';
}

/**
 * Import a Factur-X/ZUGFeRD PDF, a bare CII XML, a UBL XML or an XRechnung
 * file, and replace the current draft with it .
 * A PDF whose visible totals disagree with its own embedded XML is refused
 * outright rather than imported with a warning: that mismatch is the fraud
 * vector the phase brief calls out, and a form the user could still submit
 * despite the warning is not actually a safeguard.
 */
export function InvoiceDropzone({ onImport }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setStatus({ kind: 'idle' });
    try {
      if (file.size > MAX_BYTES) {
        setStatus({ kind: 'error', message: `File is ${(file.size / 1e6).toFixed(1)} MB; the limit is 20 MB.` });
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { detectXmlFormat, readInvoiceFromPdf } = await import('@conformo/parse');

      if (isPdf(bytes)) {
        await pdfjsReady;
        const result = await readInvoiceFromPdf(bytes);
        if (result.visibleTotals.checked && result.visibleTotals.mismatches.length > 0) {
          const fields = result.visibleTotals.mismatches.map((m) => m.label).join(', ');
          setStatus({
            kind: 'error',
            message: `Refusing to import: this PDF's visible ${fields} do not match its embedded XML. ` +
              `That can mean the page or the XML was altered after the invoice was issued.`,
          });
          return;
        }
        onImport(result.invoice);
        setStatus({
          kind: 'success',
          message: `Imported ${result.format.toUpperCase()} invoice ${result.invoice.number} from ${file.name}` +
            (result.visibleTotals.checked ? ' (visible totals match the embedded XML).' : '.'),
        });
      } else {
        const xml = new TextDecoder().decode(bytes);
        const result = detectXmlFormat(xml);
        onImport(result.invoice);
        setStatus({ kind: 'success', message: `Imported ${result.format} invoice ${result.invoice.number} from ${file.name}.` });
      }
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }, [onImport]);

  return (
    <div
      className={`invoice-dropzone${dragOver ? ' invoice-dropzone-active' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void handleFile(e.dataTransfer.files?.[0]);
      }}
    >
      <label className="field-label" htmlFor="invoice-import-input">
        Import an invoice (replaces the current draft)
      </label>
      <input
        id="invoice-import-input"
        type="file"
        accept=".xml,.pdf,application/xml,text/xml,application/pdf"
        disabled={busy}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <p className="invoice-dropzone-hint">Factur-X/ZUGFeRD PDF, CII, UBL or XRechnung XML. Drag a file here or use the picker.</p>
      {status.kind === 'error' && <p className="field-hint invoice-dropzone-error">{status.message}</p>}
      {status.kind === 'success' && <p className="field-hint invoice-dropzone-success">{status.message}</p>}
    </div>
  );
}
