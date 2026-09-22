/**
 * "Gapless sequential numbering with a pluggable series provider: local,
 * SQLite, Postgres or webhook. The user must not be able to free-type a
 * number that breaks the sequence." 
 *
 * A provider's only contract is `next()`: hand out the next number in the
 * series, exactly once, atomically. That is what "gapless" actually means —
 * no two calls ever return the same number, and no call can be un-done once
 * it returns (an invoice can be voided later, but its number is never
 * reissued). Everything else — where the counter lives — is the provider's
 * business.
 *
 * Only `local` is implemented as a running counter here, because it's the
 * only one of the four that can run with the "no mandatory server" hard
 * requirement: it's IndexedDB, in the browser, working offline, satisfied by
 * this app alone. SQLite and Postgres are not something a browser can dial
 * into directly (there is no SQL-over-fetch), so both of them, and any other
 * server-backed series, are the SAME provider from this app's side: `webhook`,
 * hitting a URL the user points at their own server. That server can be
 * backed by SQLite, Postgres, or anything else — this app has no way to
 * know or care, which is exactly why the brief lists three server-side
 * options but the client only ever needs one HTTP contract for all of them.
 */
import { nextCounterValue, peekCounterValue } from './localCounter.js';

export interface NumberingProvider {
  readonly kind: 'local' | 'webhook';
  /** A human-readable description for the settings UI, e.g. "Local sequence"
   * or "https://example.com/next-number". */
  readonly label: string;
  /** Atomically allocates and returns the next number. Never returns the
   * same value twice, even under concurrent calls. */
  next(): Promise<string>;
}

export interface WebhookResponse {
  number: string;
}

export interface LocalSeriesFormat {
  /** e.g. "INV-2026-" — the counter is appended, zero-padded. */
  prefix: string;
  padTo: number;
}

export const DEFAULT_LOCAL_FORMAT: LocalSeriesFormat = {
  prefix: `INV-${new Date().getFullYear()}-`,
  padTo: 4,
};

export class LocalNumberingProvider implements NumberingProvider {
  readonly kind = 'local';
  constructor(
    private readonly seriesId: string,
    private readonly format: LocalSeriesFormat = DEFAULT_LOCAL_FORMAT,
  ) {}

  get label(): string {
    return `Local sequence (${this.seriesId})`;
  }

  private formatNumber(counter: number): string {
    return `${this.format.prefix}${String(counter).padStart(this.format.padTo, '0')}`;
  }

  async next(): Promise<string> {
    const counter = await nextCounterValue(this.seriesId);
    return this.formatNumber(counter);
  }

  async peek(): Promise<string> {
    const counter = await peekCounterValue(this.seriesId);
    return this.formatNumber(counter);
  }
}

export class WebhookNumberingProvider implements NumberingProvider {
  readonly kind = 'webhook';
  constructor(private readonly url: string) {}

  get label(): string {
    return this.url;
  }

  async next(): Promise<string> {
    const res = await fetch(this.url, { method: 'POST' });
    if (!res.ok) {
      throw new Error(`Numbering webhook returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as WebhookResponse;
    if (!body.number || typeof body.number !== 'string') {
      throw new Error('Numbering webhook response is missing a "number" string field');
    }
    return body.number;
  }
}
