/** pdf-lib can only embed PNG or JPEG (there is no `embedWebp`), but the
 * hard requirement explicitly accepts WebP uploads. Rather than reject a
 * format we said we accept, a validated WebP is decoded through a canvas
 * (the browser's own image decoder — the same one that already accepted the
 * file's real magic bytes in hardening/logo.ts) and re-encoded as PNG. */
export async function convertToPng(bytes: Uint8Array, mimeType: string): Promise<Uint8Array> {
  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!pngBlob) throw new Error('Failed to encode logo as PNG');
  return new Uint8Array(await pngBlob.arrayBuffer());
}
