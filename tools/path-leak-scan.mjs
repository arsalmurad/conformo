// Scans files for strings that must never ship: absolute local paths and build-machine names. Used by
// tools/pack-smoke.mjs on every packed tarball (including the decompressed content of every .gz inside) and on the
// built output of the three sites.
//
// Background: the compiled rule sets once carried the build machine's absolute file path in their base URI, which put
// a user name and a temp folder into a public npm package. The compile step now pins a public base URI
// (tools/rulesets-config.mjs); this scan makes sure nothing like it comes back.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

/** [label, regex]. Applied to the text of every file (latin1, so binary files are scanned too). */
export const FORBIDDEN = [
  ['Windows drive path', /(?<![A-Za-z0-9])[A-Za-z]:[\\/](?![\\/])/],
  ['/Users/ path', /\/Users\//],
  ['/home/ path', /\/home\//],
  ['AppData', /AppData/i],
  ['/tmp/ path', /\/tmp\//],
  ['Temp/ folder', /(?<![A-Za-z])Temp[\\/]/i],
  ['scratchpad', /scratchpad/i],
  ['claude', /claude/i],
];

/**
 * The explicit, minimal allowlist: files that may name Claude Desktop / Claude Code as MCP clients, and only for that
 * pattern. Every other pattern still applies to them. Anything else that contains one of the strings fails the scan.
 */
export const ALLOWED = [
  { pkg: '@conformo/mcp-server', file: 'package/README.md', labels: ['claude'] },
  { pkg: '@conformo/mcp-server', file: 'package/server.json', labels: ['claude'] },
  { pkg: '@conformo/mcp-server', file: 'package/src/server.js', labels: ['claude'] }, // a comment naming the MCP clients
];

/** Built site pages that name Claude Desktop / Claude Code as MCP clients (docs site only). */
export const ALLOWED_SITE_FILES = [
  { site: 'docs-site/dist', file: /^(index|mcp)\.html$/, labels: ['claude'] },
];

function* tarEntries(buf) {
  let off = 0;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const name = header.toString('latin1', 0, 100).replace(/\0.*$/s, '');
    const prefix = header.toString('latin1', 345, 500).replace(/\0.*$/s, '');
    const size = parseInt(header.toString('latin1', 124, 136).replace(/\0.*$/s, '').trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 48);
    off += 512;
    if (type === '0' || type === '\0') yield { name: prefix ? `${prefix}/${name}` : name, data: buf.subarray(off, off + size) };
    off += Math.ceil(size / 512) * 512;
  }
}

/** Fonts and images are random bytes to a text scan; they carry no paths we control. */
const BINARY_MEDIA = /.(ttf|otf|woff2?|png|jpe?g|gif|ico|webp|avif)$/i;

const isGzip = (b) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

/** Findings for one file's content; a gzip inside is decompressed and scanned too (name gets a `!gunzip` suffix). */
export function scanContent(name, data, allowLabels = []) {
  const found = [];
  if (BINARY_MEDIA.test(name)) return found;
  const inspect = (label, buf) => {
    const text = buf.toString('latin1');
    for (const [what, re] of FORBIDDEN) {
      if (allowLabels.includes(what)) continue;
      const m = re.exec(text);
      if (m) found.push(`${label}: ${what}: ...${text.slice(Math.max(0, m.index - 20), m.index + 40).replace(/[^\x20-\x7e]/g, '?')}...`);
    }
  };
  // A gzip stream is compressed noise to a text scan: look at what is inside it, not at the compressed bytes.
  if (isGzip(data)) {
    let inner;
    try { inner = gunzipSync(data); } catch { inner = undefined; }
    inspect(inner ? `${name}!gunzip` : name, inner ?? data);
  } else inspect(name, data);
  return found;
}

/** Scans a .tgz from `npm pack`. `pkgName` selects the allowlist entries. */
export function scanTarball(file, pkgName) {
  const tar = gunzipSync(readFileSync(file));
  const found = [];
  for (const e of tarEntries(tar)) {
    const allow = ALLOWED.filter((a) => a.pkg === pkgName && (a.file instanceof RegExp ? a.file.test(e.name) : a.file === e.name)).flatMap((a) => a.labels);
    found.push(...scanContent(`${path.basename(file)}:${e.name}`, e.data, allow));
  }
  return found;
}

/** Scans a directory tree (built site output). */
export function scanDir(dir, skip = (p) => /node_modules/.test(p), site = '') {
  const found = [];
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (skip(p)) continue;
      if (ent.isDirectory()) walk(p);
      else if (statSync(p).size < 64 * 1024 * 1024) {
        const rel = path.relative(dir, p).replaceAll('\\', '/');
        const allow = ALLOWED_SITE_FILES.filter((a) => a.site === site && a.file.test(rel)).flatMap((a) => a.labels);
        found.push(...scanContent(rel, readFileSync(p), allow));
      }
    }
  };
  walk(dir);
  return found;
}
