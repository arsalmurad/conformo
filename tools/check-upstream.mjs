#!/usr/bin/env node
// Upstream release watcher. For every artefact pinned in tools/artefacts.manifest.json, asks the publisher's own
// source for its newest stable release and compares it with the pin. Pinning is what makes the conformance figures
// reproducible; this is what makes sure a pin never goes stale unnoticed (docs/UPDATES.md).
//
// Usage: node tools/check-upstream.mjs [--out <dir>]      (default out/; writes upstream.json and upstream.md)
//
// GITHUB_TOKEN is used for the GitHub REST API when set (higher rate limit), unauthenticated otherwise.
// Exit code is 0 when updates exist: an update is information, not a failure. Non-zero only on a crash. A network
// error for one artefact is reported as status "error" for that artefact and never hides the others.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------------------------------------
// Version logic. Upstream tags mix conventions: "v2026-08-31", "release-2025-07-10", "validation-1.3.14.2", "3.0.21"
// next to "v3.0.20", Maven's stray "v1.3.4". String order gets all of these wrong ("v3.0.20" > "3.0.21",
// "1.11" < "1.9"), so versions are parsed into a date or a numeric dotted version and compared as numbers.

const PRERELEASE = /(?:^|[-.+_])(?:alpha|beta|rc|pre|preview|tp|snapshot|dev|m\d+|cr)(?:[-.+_]?\d*)/i;

/** True for tags such as v2.0.0-tp2, v2.0.0-alpha1, 1.0-SNAPSHOT, 7.0rc1. */
export function isPrerelease(tag) {
  const s = String(tag).replace(/^[a-z]+[-_]?(?=\d)/i, '');
  return PRERELEASE.test(s) || /\d(?:a|b|rc)\d+$/i.test(s);
}

/** Parses a version-like string into { kind: 'date' | 'num', parts: number[] }, or null if it has no version. */
export function parseVersion(v) {
  const s = String(v ?? '');
  const date = s.match(/(?:^|[^\d])(\d{4})-(\d{2})-(\d{2})(?!\d)/);
  if (date) return { kind: 'date', parts: date.slice(1, 4).map(Number) };
  const num = s.match(/(\d+(?:\.\d+)*)/);
  if (num) return { kind: 'num', parts: num[1].split('.').map(Number) };
  return null;
}

/** Negative if a < b, 0 if equal, positive if a > b. Dates sort after plain numbers (they never mix in one feed). */
export function compareVersions(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b);
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  if (pa.kind !== pb.kind) return pa.kind === 'date' ? 1 : -1;
  const n = Math.max(pa.parts.length, pb.parts.length);
  for (let i = 0; i < n; i++) {
    const d = (pa.parts[i] ?? 0) - (pb.parts[i] ?? 0);
    if (d !== 0) return d;
  }
  // Same numbers: a pre-release sorts before its release.
  return (isPrerelease(a) ? 0 : 1) - (isPrerelease(b) ? 0 : 1);
}

const maxBy = (items, key) => items.reduce((best, x) => (best === undefined || compareVersions(key(x), key(best)) > 0 ? x : best), undefined);

// ---------------------------------------------------------------------------------------------------------------
// Per-source parsers. Pure functions over the publisher's response, so tests can feed them recorded responses.

/** GitHub /releases: newest non-draft, non-pre-release release (also rejecting pre-release-looking tags). */
export function latestGithubRelease(releases, { tagPattern } = {}) {
  const ok = releases.filter((r) => !r.draft && !r.prerelease && !isPrerelease(r.tag_name)
    && (!tagPattern || tagPattern.test(r.tag_name)) && parseVersion(r.tag_name));
  const r = maxBy(ok, (x) => x.tag_name);
  return r && { version: r.tag_name, tag: r.tag_name, url: r.html_url, assets: (r.assets ?? []).map((a) => ({ name: a.name, url: a.browser_download_url })) };
}

/** GitHub /tags: newest tag matching the pattern that is not a pre-release. */
export function latestGithubTag(tags, { tagPattern } = {}) {
  const ok = tags.filter((t) => (!tagPattern || tagPattern.test(t.name)) && !isPrerelease(t.name) && parseVersion(t.name));
  const t = maxBy(ok, (x) => x.name);
  return t && { version: t.name, tag: t.name, commit: t.commit?.sha };
}

/** Releases and tags together: a repo that publishes some versions only as tags (Peppol) is still covered. */
export function latestGithubReleaseOrTag(releases, tags, opts = {}) {
  const candidates = [latestGithubRelease(releases, opts), latestGithubTag(tags, opts)].filter(Boolean);
  return maxBy(candidates, (x) => x.version);
}

/** Maven Central maven-metadata.xml: the highest stable <version>, computed rather than trusting <release>. */
export function latestMaven(xml) {
  const versions = [...String(xml).matchAll(/<version>\s*([^<\s]+)\s*<\/version>/g)].map((m) => m[1]).filter((v) => !isPrerelease(v));
  const v = maxBy(versions, (x) => x);
  return v && { version: v };
}

/** PyPI JSON API: highest stable, non-yanked release. */
export function latestPypi(json) {
  const versions = Object.entries(json.releases ?? {})
    .filter(([v, files]) => !isPrerelease(v) && files.length > 0 && !files.every((f) => f.yanked))
    .map(([v]) => v);
  const v = maxBy(versions, (x) => x) ?? json.info?.version;
  return v && { version: v };
}

/** GitHub /commits/<branch>. */
export function latestCommit(json) {
  return { version: json.sha, commit: json.sha, date: json.commit?.committer?.date };
}

// ---------------------------------------------------------------------------------------------------------------
// Sources. One per manifest id; `pinned` extracts the comparable pin from the manifest entry.

const tagOfUrl = (u) => String(u ?? '').match(/\/(?:releases\/(?:tag|download)\/)([^/]+)/)?.[1];

export const SOURCES = {
  'kosit-xrechnung-config': {
    feed: 'GitHub releases of itplr-kosit/validator-configuration-xrechnung',
    pinned: (a) => tagOfUrl(a.url) ?? a.version,
    fetch: async (get) => latestGithubRelease(await get.github('/repos/itplr-kosit/validator-configuration-xrechnung/releases?per_page=100')),
    bump: 'kosit',
  },
  'xrechnung-testsuite': {
    feed: 'GitHub releases and tags of itplr-kosit/xrechnung-testsuite',
    pinned: (a) => a.tag,
    fetch: async (get) => latestGithubReleaseOrTag(
      await get.github('/repos/itplr-kosit/xrechnung-testsuite/releases?per_page=100'),
      await get.github('/repos/itplr-kosit/xrechnung-testsuite/tags?per_page=100'),
      { tagPattern: /\d{4}-\d{2}-\d{2}/ }),
    bump: 'kosit',
  },
  'kosit-validator': {
    feed: 'GitHub releases of itplr-kosit/validator',
    pinned: (a) => a.version,
    fetch: async (get) => latestGithubRelease(await get.github('/repos/itplr-kosit/validator/releases?per_page=100')),
  },
  'cen-en16931': {
    feed: 'GitHub tags validation-* of ConnectingEurope/eInvoicing-EN16931',
    pinned: (a) => a.tag,
    fetch: async (get) => latestGithubTag(await get.github('/repos/ConnectingEurope/eInvoicing-EN16931/tags?per_page=100'), { tagPattern: /^validation-/ }),
    bump: 'cen-en16931',
  },
  'peppol-bis-3': {
    feed: 'GitHub releases and tags of OpenPEPPOL/peppol-bis-invoice-3',
    pinned: (a) => a.tag,
    fetch: async (get) => latestGithubReleaseOrTag(
      await get.github('/repos/OpenPEPPOL/peppol-bis-invoice-3/releases?per_page=100'),
      await get.github('/repos/OpenPEPPOL/peppol-bis-invoice-3/tags?per_page=100'),
      { tagPattern: /^v?3\.\d+\.\d+$/ }),
    bump: 'peppol-bis-3',
  },
  schxslt2: {
    feed: 'Maven Central maven-metadata.xml (name.dmaus.schxslt:schxslt2)',
    pinned: (a) => a.version,
    fetch: async (get) => latestMaven(await get.text('https://repo1.maven.org/maven2/name/dmaus/schxslt/schxslt2/maven-metadata.xml')),
  },
  'mustang-cli': {
    feed: 'Maven Central maven-metadata.xml (org.mustangproject:Mustang-CLI)',
    pinned: (a) => a.version,
    fetch: async (get) => latestMaven(await get.text('https://repo1.maven.org/maven2/org/mustangproject/Mustang-CLI/maven-metadata.xml')),
  },
  'factur-x-wheel': {
    feed: 'PyPI JSON API (factur-x)',
    pinned: (a) => a.version,
    fetch: async (get) => latestPypi(await get.json('https://pypi.org/pypi/factur-x/json')),
    // 7.x renamed the Schematron files tools/validate.py and the rule-set build read; a major bump is never automatic.
    review: (pinned, latest) => (parseVersion(latest)?.parts[0] ?? 0) > (parseVersion(pinned)?.parts[0] ?? 0)
      ? 'major version: 7.x renamed the Schematron files the scripts use; needs manual review' : undefined,
  },
  'ksef-docs': {
    feed: 'latest commit on main of CIRFMF/ksef-docs (report only)',
    pinned: (a) => a.commit,
    fetch: async (get) => latestCommit(await get.github('/repos/CIRFMF/ksef-docs/commits/main')),
    reportOnly: true,
  },
  'saxonjs-runtime': {
    feed: 'none machine-readable (saxonica.com download page)',
    manual: 'Saxonica publishes no machine-readable release feed; check https://www.saxonica.com/saxon-js/download/ by hand',
  },
};

// ---------------------------------------------------------------------------------------------------------------

export function makeGetters({ fetchImpl = globalThis.fetch, token = process.env.GITHUB_TOKEN } = {}) {
  const req = async (url, headers = {}) => {
    const res = await fetchImpl(url, { headers: { 'user-agent': 'conformo-check-upstream', ...headers }, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res;
  };
  return {
    github: async (p) => (await req(`https://api.github.com${p}`, {
      accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(token ? { authorization: `Bearer ${token}` } : {}),
    })).json(),
    json: async (u) => (await req(u, { accept: 'application/json' })).json(),
    text: async (u) => (await req(u)).text(),
  };
}

/** Checks one artefact; never throws (a failure becomes status "error"). */
export async function checkOne(id, artefact, get, sources = SOURCES) {
  const src = sources[id];
  const base = { artefact: id, pinned: artefact.version, latest: '', status: 'error', feed: src?.feed ?? '', note: '' };
  if (!src) return { ...base, note: 'no upstream source configured in tools/check-upstream.mjs' };
  if (src.manual) return { ...base, status: 'manual', latest: '-', note: src.manual };
  const pin = src.pinned(artefact);
  try {
    const latest = await src.fetch(get);
    if (!latest) return { ...base, note: 'the feed returned no stable release' };
    const result = { ...base, pinned: pin, latest: latest.version, upstream: latest };
    if (src.reportOnly) {
      const same = latest.commit === pin;
      return { ...result, latest: latest.commit.slice(0, 12), pinned: pin.slice(0, 12), status: same ? 'current' : 'newer available',
        note: `report only${latest.date ? `; upstream main committed ${latest.date.slice(0, 10)}` : ''}`, reportOnly: true };
    }
    const cmp = compareVersions(latest.version, pin);
    const review = cmp > 0 ? src.review?.(pin, latest.version) : undefined;
    return { ...result, status: cmp > 0 ? 'newer available' : 'current',
      note: review ?? (cmp < 0 ? 'pin is newer than the newest stable upstream release' : ''),
      ...(review ? { needsManualReview: true } : {}),
      ...(cmp > 0 && src.bump && !review ? { bump: src.bump } : {}) };
  } catch (e) {
    return { ...base, pinned: pin, note: `${e?.message ?? e}`.split('\n')[0] };
  }
}

/** KoSIT ships the configuration and the test suite with matching dates: flag it when the two drift apart. */
export function pairNotes(results) {
  const cfg = results.find((r) => r.artefact === 'kosit-xrechnung-config');
  const ts = results.find((r) => r.artefact === 'xrechnung-testsuite');
  if (!cfg?.latest || !ts?.latest || cfg.status === 'error' || ts.status === 'error') return;
  const d = (v) => parseVersion(v)?.parts.join('-');
  if (d(cfg.latest) !== d(ts.latest)) {
    const msg = `KoSIT pair out of step: configuration ${cfg.latest}, test suite ${ts.latest}`;
    for (const r of [cfg, ts]) r.note = r.note ? `${r.note}; ${msg}` : msg;
  }
}

export async function checkAll(manifest, get, sources = SOURCES) {
  const ids = Object.keys(manifest.artefacts);
  const results = await Promise.all(ids.map((id) => checkOne(id, manifest.artefacts[id], get, sources)));
  pairNotes(results);
  return results;
}

export const bumpUnits = (results) => [...new Set(results.filter((r) => r.status === 'newer available' && r.bump).map((r) => r.bump))];

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
export function toMarkdown(results) {
  return ['| Artefact | Pinned | Latest | Status | Note |', '|---|---|---|---|---|',
    ...results.map((r) => `| ${r.artefact} | ${esc(r.pinned)} | ${esc(r.latest)} | ${r.status} | ${esc(r.note)} |`)].join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const outDir = path.resolve(i >= 0 ? process.argv[i + 1] : path.join(here, '..', 'out'));
  const manifest = JSON.parse(readFileSync(path.join(here, 'artefacts.manifest.json'), 'utf-8'));
  const results = await checkAll(manifest, makeGetters());
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'upstream.json'), JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2) + '\n');
  const md = toMarkdown(results);
  writeFileSync(path.join(outDir, 'upstream.md'), md);
  process.stdout.write(md);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `## Upstream releases\n\n${md}`, { flag: 'a' });
  // The workflow's bump matrix: one entry per rule-source unit with a newer release.
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `bumps=${JSON.stringify(bumpUnits(results))}\n`, { flag: 'a' });
}
