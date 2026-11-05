// tools/check-upstream.mjs, tools/upstream-bump.mjs and tools/upstream-issues.mjs, against responses recorded from
// each publisher on 2026-11-02 (test/upstream-fixtures). No live network: `fetch` is never called for real.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs tool without type declarations
import * as up from '../tools/check-upstream.mjs';
// @ts-expect-error plain .mjs tool without type declarations
import * as bump from '../tools/upstream-bump.mjs';
// @ts-expect-error plain .mjs tool without type declarations
import * as issues from '../tools/upstream-issues.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, 'upstream-fixtures');
const fx = (f: string) => readFileSync(path.join(dir, f), 'utf-8');
const json = (f: string) => JSON.parse(fx(f));
const manifest = JSON.parse(readFileSync(path.join(here, '../tools/artefacts.manifest.json'), 'utf-8'));

describe('version comparison', () => {
  const cmp = up.compareVersions;
  it('compares dotted versions numerically, not as strings', () => {
    expect(cmp('1.11.3', '1.9')).toBeGreaterThan(0);
    expect(cmp('1.10', '1.9.9')).toBeGreaterThan(0);
    expect(cmp('7.9', '6.8')).toBeGreaterThan(0);
    expect(cmp('1.11.2', '1.11.2')).toBe(0);
    expect(cmp('1.6', '1.6.0')).toBe(0);
  });
  it('ignores tag prefixes ("v", "validation-", "release-")', () => {
    expect(cmp('3.0.21', 'v3.0.20')).toBeGreaterThan(0); // string order says the opposite
    expect(cmp('v1.6.3', '1.6.3')).toBe(0);
    expect(cmp('validation-1.3.14.2', 'validation-1.3.14')).toBeGreaterThan(0);
    expect(cmp('validation-1.3.15', 'validation-1.3.14.2')).toBeGreaterThan(0);
  });
  it('compares dates, whatever the prefix or suffix', () => {
    expect(cmp('v2026-01-31', 'release-2025-07-10')).toBeGreaterThan(0);
    expect(cmp('2026-08-31 (XRechnung 3.0.2)', 'v2026-08-31')).toBe(0);
    expect(cmp('v2026-12-15', '2026-08-31 (XRechnung 3.0.2)')).toBeGreaterThan(0);
  });
  it('sorts a pre-release before its release', () => {
    expect(cmp('2.0.0-tp2', '2.0.0')).toBeLessThan(0);
    expect(up.isPrerelease('v2.0.0-tp2')).toBe(true);
    expect(up.isPrerelease('v2.0.0-alpha1')).toBe(true);
    expect(up.isPrerelease('1.0-SNAPSHOT')).toBe(true);
    expect(up.isPrerelease('7.0rc1')).toBe(true);
    for (const t of ['v1.6.3', 'validation-1.3.14.2', 'release-2025-07-10', 'v2026-08-31', '3.0.21', '1.11.3']) expect(up.isPrerelease(t)).toBe(false);
  });
});

describe('per-source parsers on recorded responses', () => {
  it('KoSIT configuration: newest release, with its asset', () => {
    const r = up.latestGithubRelease(json('kosit-config-releases.json'));
    expect(r.tag).toBe('v2026-08-31');
    expect(r.assets.map((a: { name: string }) => a.name)).toContain('xrechnung-3.0.2-validator-configuration-2026-08-31.zip');
  });
  it('KoSIT validator: ignores drafts, pre-releases and pre-release tags', () => {
    const recorded = json('kosit-validator-releases.json');
    expect(up.latestGithubRelease(recorded).version).toBe('v1.6.3');
    const withNoise = [
      { tag_name: 'v2.0.0-tp2', draft: false, prerelease: false, assets: [] },
      { tag_name: 'v1.7.0', draft: false, prerelease: true, assets: [] },
      { tag_name: 'v1.8.0', draft: true, prerelease: false, assets: [] },
      ...recorded,
    ];
    expect(up.latestGithubRelease(withNoise).version).toBe('v1.6.3');
  });
  it('KoSIT test suite: releases and dated tags', () => {
    expect(up.latestGithubReleaseOrTag(json('testsuite-releases.json'), json('testsuite-tags.json'), { tagPattern: /\d{4}-\d{2}-\d{2}/ }).tag).toBe('v2026-08-31');
  });
  it('CEN: only validation-* tags count', () => {
    const tags = [{ name: 'v9.9.9', commit: { sha: 'x' } }, ...json('cen-tags.json')];
    const r = up.latestGithubTag(tags, { tagPattern: /^validation-/ });
    expect(r.tag).toBe('validation-1.3.17');
    expect(r.commit).toMatch(/^[0-9a-f]{40}$/);
  });
  it('Peppol: mixed "v3.0.20" / "3.0.21" naming', () => {
    expect(up.latestGithubReleaseOrTag(json('peppol-releases.json'), json('peppol-tags.json'), { tagPattern: /^v?3\.\d+\.\d+$/ }).tag).toBe('3.0.21');
  });
  it('SchXslt2: highest version in maven-metadata.xml, despite the stray "v1.3.4"', () => {
    expect(up.latestMaven(fx('schxslt2-maven-metadata.xml')).version).toBe('1.11.3');
  });
  it('Mustang-CLI: highest stable version, ignoring 2.0.0-alpha3', () => {
    expect(up.latestMaven(fx('mustang-cli-maven-metadata.xml')).version).toBe('2.26.0');
  });
  it('factur-x: highest stable PyPI release', () => {
    expect(up.latestPypi(json('factur-x-pypi.json')).version).toBe('7.9');
    expect(up.latestPypi({ releases: { '7.9': [{ yanked: false }], '8.0': [{ yanked: true }], '8.1b1': [{ yanked: false }] } }).version).toBe('7.9');
  });
  it('ksef-docs: latest commit', () => {
    expect(up.latestCommit(json('ksef-commit.json')).commit).toBe('ce3670ea042de380039de4c5849fd6455811b292');
  });
});

/** A fake fetch serving the recorded responses by URL. */
function recordedGetters(overrides: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    '/repos/itplr-kosit/validator-configuration-xrechnung/releases': json('kosit-config-releases.json'),
    '/repos/itplr-kosit/validator/releases': json('kosit-validator-releases.json'),
    '/repos/itplr-kosit/xrechnung-testsuite/releases': json('testsuite-releases.json'),
    '/repos/itplr-kosit/xrechnung-testsuite/tags': json('testsuite-tags.json'),
    '/repos/ConnectingEurope/eInvoicing-EN16931/tags': json('cen-tags.json'),
    '/repos/OpenPEPPOL/peppol-bis-invoice-3/releases': json('peppol-releases.json'),
    '/repos/OpenPEPPOL/peppol-bis-invoice-3/tags': json('peppol-tags.json'),
    '/repos/CIRFMF/ksef-docs/commits/main': json('ksef-commit.json'),
    '/maven2/name/dmaus/schxslt/schxslt2/maven-metadata.xml': fx('schxslt2-maven-metadata.xml'),
    '/maven2/org/mustangproject/Mustang-CLI/maven-metadata.xml': fx('mustang-cli-maven-metadata.xml'),
    '/pypi/factur-x/json': json('factur-x-pypi.json'),
    ...overrides,
  };
  const fetchImpl = async (url: string) => {
    const body = routes[new URL(url).pathname];
    if (body === undefined) return { ok: false, status: 404 };
    if (body instanceof Error) throw body;
    return { ok: true, status: 200, json: async () => body, text: async () => String(body) };
  };
  return up.makeGetters({ fetchImpl, token: undefined });
}

describe('checkAll', () => {
  it('reports every artefact with the right status', async () => {
    const results = await up.checkAll(manifest, recordedGetters());
    const by = Object.fromEntries(results.map((r: { artefact: string }) => [r.artefact, r]));
    expect(Object.keys(by).sort()).toEqual(Object.keys(manifest.artefacts).sort());
    expect(by['kosit-xrechnung-config'].status).toBe('current');
    expect(by['xrechnung-testsuite'].status).toBe('current');
    expect(by['kosit-validator'].status).toBe('current');
    expect(by['cen-en16931'].status).toBe('current');
    expect(by['peppol-bis-3'].status).toBe('current');
    expect(by.schxslt2).toMatchObject({ status: 'newer available', latest: '1.11.3' });
    expect(by.schxslt2.bump).toBeUndefined(); // not a rule source
    expect(by['factur-x-wheel']).toMatchObject({ status: 'newer available', needsManualReview: true });
    expect(by['factur-x-wheel'].note).toMatch(/renamed the Schematron files/);
    expect(by['saxonjs-runtime'].status).toBe('manual');
    expect(by['ksef-docs']).toMatchObject({ status: 'current', reportOnly: true });
    expect(by['mustang-cli'].status).toBe('current');
    expect(up.bumpUnits(results)).toEqual([]);
    expect(up.toMarkdown(results)).toMatch(/^\| Artefact \| Pinned \| Latest \| Status \|/);
  });

  it('a network error for one artefact does not hide the others', async () => {
    const results = await up.checkAll(manifest, recordedGetters({ '/repos/OpenPEPPOL/peppol-bis-invoice-3/tags': new Error('ECONNRESET') }));
    const by = Object.fromEntries(results.map((r: { artefact: string }) => [r.artefact, r]));
    expect(by['peppol-bis-3']).toMatchObject({ status: 'error', note: 'ECONNRESET' });
    expect(by['cen-en16931'].status).toBe('current');
    expect(results.filter((r: { status: string }) => r.status === 'error')).toHaveLength(1);
  });

  it('a new KoSIT release becomes one "kosit" bump for configuration and test suite together', async () => {
    const rel = (tag: string, asset: string) => ({ tag_name: tag, draft: false, prerelease: false, html_url: `https://x/${tag}`, assets: [{ name: asset, browser_download_url: `https://x/${asset}` }] });
    const results = await up.checkAll(manifest, recordedGetters({
      '/repos/itplr-kosit/validator-configuration-xrechnung/releases': [rel('v2027-01-31', 'xrechnung-3.0.2-validator-configuration-2027-01-31.zip'), ...json('kosit-config-releases.json')],
      '/repos/itplr-kosit/xrechnung-testsuite/releases': [rel('v2027-01-31', 'xrechnung-3.0.2-testsuite-2027-01-31.zip'), ...json('testsuite-releases.json')],
    }));
    const by = Object.fromEntries(results.map((r: { artefact: string }) => [r.artefact, r]));
    expect(by['kosit-xrechnung-config']).toMatchObject({ status: 'newer available', latest: 'v2027-01-31', bump: 'kosit' });
    expect(by['xrechnung-testsuite']).toMatchObject({ status: 'newer available', bump: 'kosit' });
    expect(up.bumpUnits(results)).toEqual(['kosit']);
  });

  it('flags a KoSIT configuration and test suite that are out of step', async () => {
    const results = await up.checkAll(manifest, recordedGetters({
      '/repos/itplr-kosit/validator-configuration-xrechnung/releases': [{ tag_name: 'v2027-01-31', draft: false, prerelease: false, assets: [] }],
    }));
    expect(results.find((r: { artefact: string }) => r.artefact === 'xrechnung-testsuite').note).toMatch(/out of step/);
  });
});

describe('upstream-bump', () => {
  it('derives the KoSIT asset and version label from the release', () => {
    const assets = json('kosit-config-releases.json')[0].assets.map((a: { name: string; browser_download_url: string }) => ({ name: a.name, url: a.browser_download_url }));
    const a = bump.pickKositAsset(assets);
    expect(a.url).toBe(manifest.artefacts['kosit-xrechnung-config'].url);
    expect(bump.kositVersionLabel('v2026-08-31', a.name)).toBe(manifest.artefacts['kosit-xrechnung-config'].version);
  });
  it('updates only the pin fields of a manifest entry', () => {
    const e = manifest.artefacts['cen-en16931'];
    const n = bump.applyGitPin(e, { tag: 'validation-1.3.18', commit: 'a'.repeat(40) });
    expect(n).toEqual({ ...e, version: 'validation-1.3.18', tag: 'validation-1.3.18', commit: 'a'.repeat(40) });
    const k = manifest.artefacts['kosit-xrechnung-config'];
    const h = bump.applyHttpPin(k, { tag: 'v2027-01-31', url: 'https://x/z.zip', sha256: 'b'.repeat(64), version: '2027-01-31 (XRechnung 3.0.2)' });
    expect(h.source).toBe('https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/tag/v2027-01-31');
    expect(h.note).toBe(k.note);
  });
  it('reads the peeled commit of an annotated tag from git ls-remote', () => {
    const out = `${'1'.repeat(40)}\trefs/tags/3.0.22\n${'2'.repeat(40)}\trefs/tags/3.0.22^{}\n`;
    expect(bump.commitFromLsRemote(out, '3.0.22')).toBe('2'.repeat(40));
    expect(bump.commitFromLsRemote(`${'3'.repeat(40)}\trefs/tags/x\n`, 'x')).toBe('3'.repeat(40));
    expect(() => bump.commitFromLsRemote('', 'x')).toThrow(/not found/);
  });
  it('reads KoSIT agreement from the generated conformance report', () => {
    const md = readFileSync(path.join(here, '../docs/CONFORMANCE.md'), 'utf-8');
    const whole = bump.kositAgreement(md);
    expect(whole).toMatchObject({ known: true, full: true });
    // One KoSIT disagreement in the first corpus (86 files) flips "full" to false and costs exactly one file of agreement.
    expect(bump.kositAgreement(md.replace('| n/a | 86/86 (100.0%) |', '| n/a | 85/86 (98.8%) |'))).toMatchObject({ full: false, agree: whole.agree - 1, total: whole.total });
  });
  it('a failed gate makes a draft "[needs work]" PR naming the step', () => {
    const changes = [{ id: 'cen-en16931', from: 'validation-1.3.17', to: 'validation-1.3.18' }];
    const ok = bump.prText({ unit: 'cen-en16931', changes, gates: bump.GATES.map(([name]: [string]) => ({ name, ok: true })), conformanceMd: readFileSync(path.join(here, '../docs/CONFORMANCE.md'), 'utf-8') });
    expect(ok).toMatchObject({ title: 'Upstream update: cen-en16931 validation-1.3.17 -> validation-1.3.18', draft: false });
    expect(ok.body).toMatch(/still 100%/);
    expect(ok.body).toMatch(/\| KoSIT XRechnung test suite \| 86 \|/);
    const bad = bump.prText({ unit: 'cen-en16931', changes, gates: [{ name: 'artefacts:fetch', ok: true }, { name: 'schematron:compile', ok: false, excerpt: 'Error: missing xsl' }], conformanceMd: '' });
    expect(bad.title).toBe('[needs work] Upstream update: cen-en16931 validation-1.3.17 -> validation-1.3.18 (schematron:compile failed)');
    expect(bad.draft).toBe(true);
    expect(bad.body).toMatch(/Error: missing xsl/);
    expect(bad.body).toMatch(/not measured/);
  });
});

describe('upstream-issues', () => {
  const r = (artefact: string, status: string, pinned: string, latest: string, extra = {}) => ({ artefact, status, pinned, latest, feed: 'f', note: '', ...extra });
  it('opens one issue per newer release and never the same title twice', () => {
    const results = [r('schxslt2', 'newer available', '1.11.2', '1.11.3'), r('cen-en16931', 'current', 'validation-1.3.17', 'validation-1.3.17')];
    const first = issues.planIssues(results, []);
    expect(first.create.map((c: { title: string }) => c.title)).toEqual(['Upstream update: schxslt2 1.11.2 -> 1.11.3']);
    expect(issues.planIssues(results, [{ number: 4, title: 'Upstream update: schxslt2 1.11.2 -> 1.11.3' }])).toEqual({ create: [], close: [] });
  });
  it('closes stale issues once the pin catches up, or when superseded', () => {
    const open = [{ number: 1, title: 'Upstream update: cen-en16931 validation-1.3.17 -> validation-1.3.18' }, { number: 2, title: 'Upstream update: schxslt2 1.11.2 -> 1.11.3' }];
    const plan = issues.planIssues([r('cen-en16931', 'current', 'validation-1.3.18', 'validation-1.3.18'), r('schxslt2', 'newer available', '1.11.2', '1.12')], open);
    expect(plan.close.map((c: { number: number }) => c.number)).toEqual([1, 2]);
    expect(plan.create.map((c: { title: string }) => c.title)).toEqual(['Upstream update: schxslt2 1.11.2 -> 1.12']);
  });
  it('leaves errored, manual and report-only artefacts alone', () => {
    const open = [{ number: 9, title: 'Upstream update: peppol-bis-3 3.0.21 -> 3.0.22' }];
    const plan = issues.planIssues([r('peppol-bis-3', 'error', '3.0.21', ''), r('saxonjs-runtime', 'manual', '2.7', '-'), r('ksef-docs', 'newer available', 'a', 'b', { reportOnly: true })], open);
    expect(plan).toEqual({ create: [], close: [] });
  });
});
