// @vitest-environment happy-dom
//
// happy-dom doesn't implement IndexedDB (confirmed: `indexedDB is not
// defined` without this), so this polyfills it with fake-indexeddb — a
// spec-conformant implementation, not a stub — to prove the same "gapless"
// claim the browser app relies on: no two calls to next() ever return the
// same number, even when they race.
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { LocalNumberingProvider, WebhookNumberingProvider } from "../packages/ui/src/numbering/provider.js";

describe("LocalNumberingProvider: gapless, atomic sequencing", () => {
  it("counts up by exactly 1 each call, starting at 1", async () => {
    const provider = new LocalNumberingProvider(`series-${crypto.randomUUID()}`);
    expect(await provider.next()).toMatch(/-0001$/);
    expect(await provider.next()).toMatch(/-0002$/);
    expect(await provider.next()).toMatch(/-0003$/);
  });

  it("never hands out the same number twice under concurrent calls — the actual meaning of gapless", async () => {
    const provider = new LocalNumberingProvider(`series-${crypto.randomUUID()}`);
    const results = await Promise.all(Array.from({ length: 25 }, () => provider.next()));
    expect(new Set(results).size).toBe(25);
  });

  it("keeps separate series independent", async () => {
    const a = new LocalNumberingProvider(`series-a-${crypto.randomUUID()}`);
    const b = new LocalNumberingProvider(`series-b-${crypto.randomUUID()}`);
    expect(await a.next()).toMatch(/-0001$/);
    expect(await b.next()).toMatch(/-0001$/);
    expect(await a.next()).toMatch(/-0002$/);
  });

  it("peek shows the next number without consuming it", async () => {
    const provider = new LocalNumberingProvider(`series-${crypto.randomUUID()}`);
    const peeked = await provider.peek();
    expect(await provider.peek()).toBe(peeked); // calling peek again doesn't advance it
    expect(await provider.next()).toBe(peeked); // and it matches what next() actually draws
    expect(await provider.peek()).not.toBe(peeked); // now advanced, since next() consumed one
  });
});

describe("WebhookNumberingProvider: the same interface, backed by the user's own server", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the server's number on a successful POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ number: "SRV-0042" }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new WebhookNumberingProvider("https://example.test/next");
    expect(await provider.next()).toBe("SRV-0042");
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/next", { method: "POST" });
  });

  it("throws rather than silently returning an unassigned invoice on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const provider = new WebhookNumberingProvider("https://example.test/next");
    await expect(provider.next()).rejects.toThrow(/503/);
  });

  it("throws on a malformed response rather than assigning an invalid number", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ oops: true }) }));
    const provider = new WebhookNumberingProvider("https://example.test/next");
    await expect(provider.next()).rejects.toThrow(/number/);
  });
});
