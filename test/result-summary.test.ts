import { describe, it, expect } from "vitest";
import { buildCII } from "@conformo/formats";
import { summarizeResult, validate } from "@conformo/toolkit";
import type { Invoice } from "@conformo/core";
import { main } from "../packages/cli/src/main.js";
import type { Io } from "../packages/cli/src/io.js";
import publicSector from "../fixtures/xrechnung-public-sector.json" with { type: "json" };

const base = publicSector as unknown as Invoice;
const badIdXml = buildCII(base, { profile: "xrechnung", customizationId: "urn:xoev-de:kosit:standard:xrechnung_3.0" });
const goodXml = buildCII(base, { profile: "xrechnung" });

async function cli(argv: string[], stdin: string): Promise<{ code: number; out: string }> {
  let out = "";
  const io: Io = { out: (t) => { out += t; }, err: () => {}, readStdin: async () => Buffer.from(stdin, "utf-8") };
  return { code: await main(argv, io), out };
}

describe("the verdict line counts Conformo's own checks apart from the official rules", () => {
  const xsdOk = { ran: true, valid: true, errors: [] };
  const rule = (severity: "error" | "fatal" | "warning" | "info") => ({ severity }) as never;

  it("keeps the plain wording when only official rules are involved", () => {
    const ok = summarizeResult({ valid: true, firedCount: 135, results: [], xsd: xsdOk, notices: [] });
    expect(ok.text).toBe("VALID — 135 rules checked, 0 failed, 0 advisory.");
    const bad = summarizeResult({ valid: false, firedCount: 91, results: [rule("error"), rule("warning")], xsd: xsdOk, notices: [] });
    expect(bad.text).toBe("INVALID — 91 rules checked, 1 failed, 1 advisory.");
    expect(bad.official).toEqual({ checked: 91, failed: 1, advisory: 1 });
  });

  it("names a Conformo error check, and a failed XSD, instead of reading as '0 failed'", () => {
    const s = summarizeResult({
      valid: false, firedCount: 89, results: [rule("warning")], xsd: xsdOk,
      notices: [{ severity: "error", code: "XRECHNUNG-ID-UNKNOWN", message: "m" }, { severity: "warning", code: "LEITWEG-CHECK-DIGITS", message: "w" }],
    });
    expect(s.text).toBe("INVALID — 89 official rules checked, 0 failed, 1 advisory; 1 Conformo check failed (XRECHNUNG-ID-UNKNOWN).");
    expect(s.conformoErrors).toEqual([{ code: "XRECHNUNG-ID-UNKNOWN", message: "m" }]);
    const x = summarizeResult({ valid: false, firedCount: 0, results: [], xsd: { ran: true, valid: false, errors: ["e"] }, notices: [] });
    expect(x.text).toBe("INVALID — 0 official rules checked, 0 failed, 0 advisory; the XML schema check failed.");
    expect(x.xsdFailed).toBe(true);
  });

  it("toolkit.validate sets the summary on a file rejected only by XRECHNUNG-ID-UNKNOWN", async () => {
    const r = await validate(badIdXml);
    expect(r.valid).toBe(false);
    expect(r.summary?.conformoErrors.map((c) => c.code)).toEqual(["XRECHNUNG-ID-UNKNOWN"]);
    expect(r.summary?.official.failed).toBe(0);
    expect(r.summary?.text).toMatch(/^INVALID — \d+ official rules checked, 0 failed, \d+ advisory; 1 Conformo check failed \(XRECHNUNG-ID-UNKNOWN\)\.$/);
    expect((await validate(goodXml)).summary?.text).toMatch(/^VALID — \d+ rules checked, 0 failed, 0 advisory\.$/);
  });

  it("the CLI prints that line, and --json only adds the summary field", async () => {
    const text = await cli(["validate", "-"], badIdXml);
    expect(text.code).toBe(1);
    expect(text.out.trimEnd().split("\n").pop()).toMatch(/^INVALID — \d+ official rules checked, 0 failed, \d+ advisory; 1 Conformo check failed \(XRECHNUNG-ID-UNKNOWN\)\.$/);
    const json = JSON.parse((await cli(["validate", "-", "--json"], badIdXml)).out);
    expect(json.valid).toBe(false);
    for (const k of ["valid", "firedCount", "results", "detected", "ruleSets", "xsd", "notices"]) expect(json, k).toHaveProperty(k);
    expect(json.summary.conformoErrors[0].code).toBe("XRECHNUNG-ID-UNKNOWN");
  });
});
