import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildPreviewPdf } from '../packages/ui/src/pdf/exportPdf.js';
import { emptyInvoice } from '../packages/ui/src/state/emptyInvoice.js';

// exportPdf.ts loads its fonts with fetch() from the app's public/ folder; serve them from disk instead.
const publicDir = path.join(process.cwd(), 'packages', 'ui', 'public');

describe('live preview PDF', () => {
  beforeAll(() => {
    vi.stubGlobal('fetch', async (url: string) => {
      const bytes = fs.readFileSync(path.join(publicDir, url.replace(/^\//, '')));
      return new Response(bytes);
    });
  });
  afterAll(() => { vi.unstubAllGlobals(); });

  // The editor opens on emptyInvoice(), and every draft is incomplete until the user finishes it. The preview
  // must still draw the page: the missing fields are reported by the validation summary, not by a blank preview.
  // checkInvoice() rejects blank BT-1/BT-27/BT-40/BT-44/BT-55/BT-153, so the preview must not gate on it.
  it('renders the blank starting draft', async () => {
    const bytes = await buildPreviewPdf(emptyInvoice(), 'classic');
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
  });

  it('renders a half-filled draft', async () => {
    const draft = emptyInvoice();
    draft.seller = { name: 'Example Seller SARL', country: 'FR' };
    draft.lines[0] = { ...draft.lines[0]!, name: 'Consulting', unitPriceMinor: 10000, taxRate: 20 };
    const bytes = await buildPreviewPdf(draft, 'modern');
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
