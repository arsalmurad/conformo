#!/usr/bin/env node
// Fetches every third-party artefact listed in tools/artefacts.manifest.json,
// verifies it (SHA-256 for downloads, commit SHA for git checkouts) and unpacks
// it under tools/artefacts/<id>/. Idempotent: an artefact whose marker file
// matches the manifest pin is skipped, and downloads are cached in
// tools/artefacts/.cache (override with CONFORMO_ARTEFACT_CACHE), so a second
// run, or a run with the cache pre-seeded, needs no network.
//
// Usage: node tools/fetch-artefacts.mjs [--group build,corpora,java,browser|all] [--only id,id] [--force]
// Default group: build. Cross-platform: Node + the `git` binary, nothing else.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ARTEFACTS_DIR = path.join(here, "artefacts");
const CACHE = process.env.CONFORMO_ARTEFACT_CACHE ?? path.join(ARTEFACTS_DIR, ".cache");
export const manifest = JSON.parse(readFileSync(path.join(here, "artefacts.manifest.json"), "utf-8"));

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
export const artefactDir = (id) => path.join(ARTEFACTS_DIR, id);

function unzip(buf, dest) {
  const eocd = (() => { for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) return i; throw new Error("not a zip"); })();
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const root = path.resolve(dest);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error("corrupt zip directory");
    const method = buf.readUInt16LE(ptr + 10);
    const csize = buf.readUInt32LE(ptr + 20);
    const nlen = buf.readUInt16LE(ptr + 28), xlen = buf.readUInt16LE(ptr + 30), clen = buf.readUInt16LE(ptr + 32);
    const lho = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf-8", ptr + 46, ptr + 46 + nlen);
    ptr += 46 + nlen + xlen + clen;
    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`zip entry escapes target dir: ${name}`);
    if (name.endsWith("/")) { mkdirSync(target, { recursive: true }); continue; }
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(start, start + csize);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, method === 0 ? raw : inflateRawSync(raw));
  }
}

async function download(id, a) {
  mkdirSync(CACHE, { recursive: true });
  const cached = path.join(CACHE, `${id}-${a.sha256.slice(0, 12)}`);
  if (existsSync(cached) && sha256(readFileSync(cached)) === a.sha256) return readFileSync(cached);
  const local = id === "saxonjs-runtime" ? process.env.CONFORMO_SAXONJS_ZIP : undefined;
  let buf;
  if (local) buf = readFileSync(local);
  else {
    console.log(`  downloading ${a.url}`);
    const res = await fetch(a.url, { redirect: "follow" });
    if (!res.ok) throw new Error(`download of ${id} failed: HTTP ${res.status} ${a.url}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  const got = sha256(buf);
  if (got !== a.sha256) throw new Error(`SHA-256 mismatch for ${id}\n  expected ${a.sha256}\n  got      ${got}\nRefusing to use it.`);
  writeFileSync(cached, buf);
  return buf;
}

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8", env: { ...process.env, GIT_LFS_SKIP_SMUDGE: "1", GIT_TERMINAL_PROMPT: "0" } });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

function fetchGit(id, a, dest) {
  console.log(`  cloning ${a.repo} @ ${a.tag}`);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(path.dirname(dest), { recursive: true });
  // Fetch the tag ref explicitly: some repos also have a branch with the same name.
  git(["init", "--quiet", dest]);
  git(["fetch", "--quiet", "--depth", "1", a.repo, `refs/tags/${a.tag}:refs/tags/${a.tag}`], dest);
  git(["-c", "advice.detachedHead=false", "checkout", "--quiet", `refs/tags/${a.tag}`], dest);
  const head = git(["rev-parse", "HEAD^{commit}"], dest);
  if (head !== a.commit) {
    rmSync(dest, { recursive: true, force: true });
    throw new Error(`commit mismatch for ${id}: tag ${a.tag} is ${head}, manifest pins ${a.commit}. Refusing to use it.`);
  }
}

export async function ensure(id, { force = false } = {}) {
  const a = manifest.artefacts[id];
  if (!a) throw new Error(`unknown artefact ${id}`);
  const dest = artefactDir(id);
  const pin = a.kind === "git" ? a.commit : a.sha256;
  const marker = path.join(dest, ".pinned");
  if (!force && existsSync(marker) && readFileSync(marker, "utf-8").trim() === pin) return false;
  console.log(`fetching ${id} ${a.version}`);
  if (a.kind === "git") fetchGit(id, a, dest);
  else {
    const buf = await download(id, a);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    if (a.extract === "zip") unzip(buf, dest);
    else writeFileSync(path.join(dest, path.basename(new URL(a.url).pathname)), buf);
  }
  writeFileSync(marker, pin + "\n");
  return true;
}

export async function ensureGroups(groups, opts = {}) {
  const ids = Object.entries(manifest.artefacts)
    .filter(([id, a]) => (opts.only ? opts.only.includes(id) : groups.includes("all") || groups.includes(a.group)))
    .map(([id]) => id);
  for (const id of ids) await ensure(id, opts);
  return ids;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
  const groups = (arg("--group") ?? "build").split(",");
  const only = arg("--only")?.split(",");
  try {
    const ids = await ensureGroups(groups, { only, force: process.argv.includes("--force") });
    console.log(`artefacts ready: ${ids.join(", ")}`);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}
