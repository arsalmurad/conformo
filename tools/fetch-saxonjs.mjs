#!/usr/bin/env node
// Fetches the free SaxonJS 2 browser runtime (SaxonJS2.rt.js) that
// packages/validate/src/browser.ts and test/validate-browser.test.ts need to
// prove the validator runs client-side. Not committed — tools/artefacts/ is
// gitignored, same convention as tools/fetch_artefacts.py — and pinned by
// SHA-256 so a compromised mirror fails loudly instead of silently swapping
// what runs in the browser.
//
// This is the RUNTIME-ONLY build (no XSLT compiler, no Node built-ins:
// `grep -c "require(" SaxonJS2.rt.js` is 0). Schematron is compiled to SEF
// ahead of time by tools/compile-schematron.sh, using the free "XX" compiler
// bundled in the `xslt3` npm package — see that script's header for why no
// Java or Saxon-EE license is needed for either step.
//
// License: SaxonJS 2 is free to use and to bundle into an application (see
// the reproduced notice below and the full text at
// node_modules/saxon-js/LICENSE.txt after `npm install`), but redistributing
// it as a standalone download is not — hence fetching it here rather than
// committing it. Usage: node tools/fetch-saxonjs.mjs
//
//   Copyright Saxonica Ltd. See LICENSE.txt. Provided "AS IS", without
//   warranty of any kind.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_ = "https://downloads.saxonica.com/SaxonJS/2/SaxonJS-2.7.zip";
const SHA256 = "13cbd2e6eb0a80dcf64067e88cb5eab54a52c3a29e01fe0b156346895585845d";
const ENTRY = "saxon-js/SaxonJS2.rt.js";

const root = fileURLToPath(new URL("artefacts/saxon-js", import.meta.url));
const dest = path.join(root, "SaxonJS2.rt.js");

async function main() {
  if (existsSync(dest) && process.argv[2] !== "--force") {
    console.log("SaxonJS2.rt.js already present:", dest);
    return;
  }
  console.log(`fetching ${URL_} (pinned by SHA-256)...`);
  const res = await fetch(URL_);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = createHash("sha256").update(buf).digest("hex");
  if (got !== SHA256) {
    throw new Error(`SHA-256 mismatch for ${URL_}\n  expected: ${SHA256}\n  got:      ${got}\nRefusing to use it.`);
  }
  await extractOne(buf, ENTRY, dest);
  console.log("wrote", dest);
}

/** Minimal ZIP central-directory reader: pulls exactly one stored/deflated
 * entry out of the archive. Avoids adding a zip-library dependency for a
 * script that runs rarely and only needs one file out of one zip. */
async function extractOne(zipBuf, entryName, destPath) {
  const eocdSig = 0x06054b50;
  let eocd = -1;
  for (let i = zipBuf.length - 22; i >= 0; i--) {
    if (zipBuf.readUInt32LE(i) === eocdSig) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error("not a valid zip (no end-of-central-directory record)");
  const cdOffset = zipBuf.readUInt32LE(eocd + 16);
  const cdCount = zipBuf.readUInt16LE(eocd + 10);
  let ptr = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (zipBuf.readUInt32LE(ptr) !== 0x02014b50) throw new Error("corrupt central directory");
    const compMethod = zipBuf.readUInt16LE(ptr + 10);
    const compSize = zipBuf.readUInt32LE(ptr + 20);
    const nameLen = zipBuf.readUInt16LE(ptr + 28);
    const extraLen = zipBuf.readUInt16LE(ptr + 30);
    const commentLen = zipBuf.readUInt16LE(ptr + 32);
    const localHeaderOffset = zipBuf.readUInt32LE(ptr + 42);
    const name = zipBuf.toString("utf-8", ptr + 46, ptr + 46 + nameLen);
    if (name === entryName) {
      const lh = localHeaderOffset;
      const lNameLen = zipBuf.readUInt16LE(lh + 26);
      const lExtraLen = zipBuf.readUInt16LE(lh + 28);
      const dataStart = lh + 30 + lNameLen + lExtraLen;
      const raw = zipBuf.subarray(dataStart, dataStart + compSize);
      const data = compMethod === 0 ? raw : await inflateRaw(raw);
      mkdirSync(path.dirname(destPath), { recursive: true });
      writeFileSync(destPath, data);
      return;
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`entry "${entryName}" not found in zip`);
}

async function inflateRaw(buf) {
  const { inflateRawSync } = await import("node:zlib");
  return inflateRawSync(buf);
}

await main();
