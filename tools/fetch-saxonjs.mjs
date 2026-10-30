#!/usr/bin/env node
// Fetches the free SaxonJS 2 browser runtime (SaxonJS2.rt.js) used by the validator page, the app and
// test/validate-browser.test.ts. The pin (URL + SHA-256) lives in tools/artefacts.manifest.json under
// "saxonjs-runtime"; this is a thin wrapper around tools/fetch-artefacts.mjs.
//
// SaxonJS 2 is free to bundle into an application but may not be redistributed as a standalone download,
// so it is fetched here and never committed. If downloads.saxonica.com is blocked on your network, download
// SaxonJS-2.7.zip another way and run:  CONFORMO_SAXONJS_ZIP=/path/to/SaxonJS-2.7.zip npm run saxonjs:fetch
// (the SHA-256 pin is still enforced).
import { ensure, artefactDir } from "./fetch-artefacts.mjs";
import { existsSync } from "node:fs";
import path from "node:path";

try {
  await ensure("saxonjs-runtime", { force: process.argv.includes("--force") });
  const rt = path.join(artefactDir("saxonjs-runtime"), "saxon-js/SaxonJS2.rt.js");
  if (!existsSync(rt)) throw new Error(`expected ${rt} inside the SaxonJS zip`);
  console.log("SaxonJS runtime ready:", rt);
} catch (e) {
  console.error(String(e.message ?? e));
  process.exit(1);
}
