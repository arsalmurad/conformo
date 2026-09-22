import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildCII } from "@invoice-engine/formats";
import { validate } from "@invoice-engine/validate";
import type { Invoice } from "@invoice-engine/core";
import sample from "../fixtures/sample-invoice.json" with { type: "json" };

const validCii = buildCII(sample as unknown as Invoice);
const brokenCii = readFileSync(new URL("../fixtures/negative/broken-invoice.xml", import.meta.url), "utf-8");

describe("validate(): the sample invoice", () => {
  it("passes EN 16931 cleanly", async () => {
    const result = await validate(validCii);
    expect(result.valid).toBe(true);
    expect(result.results.filter((r) => r.severity === "error" || r.severity === "fatal")).toEqual([]);
  });

  it("also passes the French CTC (BR-FR Flux 2) layer, matching the 77/0 result the project's own tracker records", async () => {
    const result = await validate(validCii, { country: "FR" });
    expect(result.valid).toBe(true);
  });

  it("rejects a non-CII document rather than silently validating nothing", async () => {
    await expect(validate("<Invoice/>")).rejects.toThrow(/CII/);
  });
});

describe("validate(): a deliberately broken invoice ", () => {
  it("flags at least 10 distinct rules, each with a location, a message, and — where we have one — a plain-language explanation", async () => {
    const result = await validate(brokenCii);
    expect(result.valid).toBe(false);

    const failures = result.results.filter((r) => r.severity === "error" || r.severity === "fatal");
    const distinctRuleIds = new Set(failures.map((f) => f.ruleId));
    expect(distinctRuleIds.size).toBeGreaterThanOrEqual(10);

    for (const f of failures) {
      expect(f.xpath.length).toBeGreaterThan(0);
      expect(f.message.length).toBeGreaterThan(0);
    }

    // The core mandatory-field rules this fixture is built to trip must all
    // be caught, with a plain-language translation attached to each.
    const byId = new Map(failures.map((f) => [f.ruleId, f]));
    for (const id of ["BR-01", "BR-02", "BR-03", "BR-04", "BR-05", "BR-06", "BR-07", "BR-08", "BR-10", "BR-CO-26", "BR-Z-10"]) {
      const f = byId.get(id);
      expect(f, `expected ${id} to fire`).toBeDefined();
      expect(f!.plainLanguage, `expected a plain-language message for ${id}`).toBeDefined();
      expect(f!.plainLanguage!.summary.length).toBeGreaterThan(0);
      expect(f!.plainLanguage!.why.length).toBeGreaterThan(0);
      expect(f!.plainLanguage!.fix.length).toBeGreaterThan(0);
    }

    // Printed for the human reviewing this gate, per the project's own build plan
    // ("paste the real output") — see the an earlier pass gate transcript in
    // the project's own tracker for the captured run.
    console.log(`\n${distinctRuleIds.size} distinct rules fired on the broken fixture:\n`);
    for (const id of [...distinctRuleIds].sort()) {
      const f = byId.get(id)!;
      console.log(`[${f.ruleId}] (${f.severity}) ${f.fields.join(", ") || "—"}`);
      console.log(`  official: ${f.message}`);
      if (f.plainLanguage) {
        console.log(`  what it means: ${f.plainLanguage.summary}`);
        console.log(`  why: ${f.plainLanguage.why}`);
        console.log(`  fix: ${f.plainLanguage.fix}`);
      }
    }
  });
});
