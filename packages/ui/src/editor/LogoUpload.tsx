import { useState } from 'react';
import { checkLogoFile } from '../hardening/logo.js';
import { convertToPng } from '../hardening/imageConvert.js';
import type { EmbeddableLogo } from '../pdf/exportPdf.js';

interface Props {
  logo: EmbeddableLogo | undefined;
  onChange: (logo: EmbeddableLogo | undefined) => void;
}

const MIME_BY_KIND = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;

/** "logo uploads limited to PNG/JPEG/WebP under 2 MB with SVG blocked"
 * . The validation (hardening/logo.ts) checks the
 * file's actual bytes, not its name or reported MIME type. WebP is accepted
 * on upload but converted to PNG before use, since pdf-lib has no WebP
 * embedder (see hardening/imageConvert.ts) — the size/type/SVG rules are
 * still enforced against the ORIGINAL uploaded bytes, before any
 * conversion, so the conversion step can't be used to smuggle something
 * that would otherwise have been rejected. */
export function LogoUpload({ logo, onChange }: Props) {
  const [error, setError] = useState<string | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    const check = await checkLogoFile(file);
    if (!check.valid) {
      setError(`This file ${check.reason}.`);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pngBytes = check.kind === 'webp' ? await convertToPng(bytes, MIME_BY_KIND[check.kind]) : bytes;
    const kind = check.kind === 'webp' ? 'png' : check.kind!;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(new Blob([pngBytes as BlobPart], { type: MIME_BY_KIND[kind] })));
    onChange({ bytes: pngBytes, kind });
  }

  return (
    <div className="logo-upload">
      <label className="field-label">Logo (optional, shown on the PDF)</label>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {previewUrl && <img src={previewUrl} alt="Logo preview" className="logo-preview" />}
      {logo && (
        <button type="button" onClick={() => { onChange(undefined); setPreviewUrl(undefined); }}>
          Remove logo
        </button>
      )}
      {error && <p className="field-hint">{error}</p>}
    </div>
  );
}
