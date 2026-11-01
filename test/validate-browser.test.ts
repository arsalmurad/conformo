// @vitest-environment happy-dom
//
// Proves the validator runs in a browser with no server, for real, not by
// inspection: this file runs under
// happy-dom (a browser-like DOM/window environment, not Node's), loads the
// FREE SaxonJS2.rt.js RUNTIME build (no Node built-ins — see
// tools/fetch-saxonjs.mjs; `grep -c "require(" SaxonJS2.rt.js` is 0, unlike
// the Node `saxon-js` package src/index.ts imports) as a global the way a
// <script> tag would, and calls the same engine the Node
// entry point uses — proving one core implementation genuinely works
// unmodified in both places, not two parallel implementations that happen
// to agree.
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildCII, buildUBL } from "@conformo/formats";
import { createBrowserValidator } from "@conformo/validate/browser";
import type { SaxonJSLike } from "@conformo/validate";
import type { Invoice } from "@conformo/core";
import sample from "../fixtures/sample-invoice.json" with { type: "json" };
import xrechnung from "../fixtures/xrechnung-public-sector.json" with { type: "json" };

// happy-dom replaces the global `URL` with its own DOM implementation, which
// doesn't resolve file paths the way `new URL(relative, import.meta.url)`
// needs — so this resolves paths with node:path instead of the (now
// environment-shadowed) URL constructor.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const runtimePath = path.join(testDir, "../tools/artefacts/saxonjs-runtime/saxon-js/SaxonJS2.rt.js");
const artefacts = path.join(testDir, "../packages/validate/artefacts");
const en16931Path = path.join(artefacts, "en16931-cii.sef.json.gz");

const skip = !existsSync(runtimePath) || !existsSync(en16931Path);
if (skip) {
  console.warn(
    "\nSkipping test/validate-browser.test.ts: run `npm run saxonjs:fetch` and " +
      "`npm run schematron:compile` first (both are gitignored build artefacts, not checked in).\n",
  );
}

describe.skipIf(skip)("the validator inside a browser environment (happy-dom, not Node)", () => {
  let SaxonJS: SaxonJSLike;

  beforeAll(async () => {
    // This is exactly what a page does: fetch the script text and evaluate
    // it, which leaves a `SaxonJS` global — no bundler magic, no Node `fs`
    // inside the runtime itself (we only use `fs` here, in the test harness,
    // to stand in for the browser's own `fetch`).
    const runtimeSource = readFileSync(runtimePath, "utf-8");
    (0, eval)(runtimeSource); // eslint-disable-line no-eval -- loading a script the way a <script> tag would
    SaxonJS = (globalThis as unknown as { SaxonJS: SaxonJSLike }).SaxonJS;
    expect(typeof SaxonJS.transform).toBe("function");
  });

  it("confirms this really is a DOM environment, and the runtime knows it", () => {
    // vitest's happy-dom environment ADDS browser globals into the same
    // process rather than removing Node's (so `typeof process` here proves
    // nothing) — the meaningful check is that the runtime we just loaded
    // reports itself as running outside Node, exactly as it would need to
    // for `document('a-file.xml')`-style resolution to behave like a browser
    // fetch rather than a filesystem read.
    expect(typeof window).toBe("object");
    expect(typeof DOMParser).toBe("function");
    const info = (SaxonJS as unknown as { getProcessorInfo?: () => { platform?: string } }).getProcessorInfo?.();
    if (info?.platform) expect(info.platform.toLowerCase()).not.toContain("node");
  });

  const browserValidate = () =>
    createBrowserValidator({
      saxonJs: SaxonJS,
      // stands in for the browser's fetch of a static file
      loadRuleset: async (id) => gunzipSync(readFileSync(path.join(artefacts, `${id}.sef.json.gz`))).toString("utf-8"),
    });

  it("validates the sample invoice against the pre-compiled EN 16931 SEF, client-side", async () => {
    const xml = buildCII(sample as unknown as Invoice);
    const result = await browserValidate()(xml);
    expect(result.valid).toBe(true);
    expect(result.firedCount).toBeGreaterThan(0);
    expect(result.ruleSets.map((r) => r.id)).toEqual(["en16931-cii"]);
  });

  it("picks the rule sets from the document, exactly like Node: XRechnung UBL runs EN 16931 + XRechnung", async () => {
    const xml = buildUBL(xrechnung as unknown as Invoice, { profile: "xrechnung" });
    const result = await browserValidate()(xml);
    expect(result.detected.syntax).toBe("ubl-invoice");
    expect(result.ruleSets.map((r) => r.id)).toEqual(["en16931-ubl", "xrechnung-ubl"]);
    expect(result.xsd.ran).toBe(false); // documented limitation, reported rather than hidden
    expect(result.xsd.skippedReason).toMatch(/browser/);
  });

  // Regression: the browser entry used to skip the guard the Node entry point has always had, so
  // well-formed non-invoice XML fired zero rules and came back "valid" - the worst possible failure mode for
  // the one artefact (the public validator page) whose entire job is being trustworthy.
  it("rejects well-formed non-invoice XML rather than reporting it valid", async () => {
    await expect(browserValidate()("<hello><world/></hello>")).rejects.toThrow(/Unsupported document/);
  });
});
