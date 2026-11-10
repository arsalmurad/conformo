#!/usr/bin/env node
// Re-pins one rule source to its newest upstream release and proves it, the way .github/workflows/upstream.yml does:
//
//   1. update the manifest entry (version, tag or URL, and a freshly computed SHA-256 or commit);
//   2. run every gate that depends on the rule sources: artefacts:fetch, schematron:compile, saxonjs:fetch, test,
//      conformance --strict (which runs the full KoSIT test suite through the official KoSIT validator);
//   3. with --publish: commit the manifest and the regenerated docs/CONFORMANCE.md on upstream/<artefact>-<latest>,
//      push, and open a pull request. A failing gate still opens the PR, as a draft titled "[needs work]".
//
// Usage: node tools/upstream-bump.mjs <unit> [--to <tag>] [--publish] [--skip-gates]
//   unit: kosit (KoSIT configuration + KoSIT test suite, always together) | cen-en16931 | peppol-bis-3
//   --to: pin this tag instead of the newest one (re-pinning the current tag must reproduce the manifest exactly).
// Never merges anything.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkOne, compareVersions, makeGetters, parseVersion, SOURCES } from './check-upstream.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(root, 'tools/artefacts.manifest.json');
const AUTHOR = { name: 'Muhammad Arsal Murad', email: 'hello@arsalmurad.com' };

export const UNITS = {
  kosit: ['kosit-xrechnung-config', 'xrechnung-testsuite'],
  'cen-en16931': ['cen-en16931'],
  'peppol-bis-3': ['peppol-bis-3'],
};

export const GATES = [
  ['artefacts:fetch', ['run', 'artefacts:fetch', '--', '--group', 'build,corpora,java']],
  ['schematron:compile', ['run', 'schematron:compile']],
  ['saxonjs:fetch', ['run', 'saxonjs:fetch']],
  ['test', ['run', 'test']],
  ['conformance --strict', ['run', 'conformance', '--', '--strict']],
];

// ---------------------------------------------------------------------------------------------------------------
// Manifest updates (pure, so they are unit-tested).

/** The KoSIT configuration release's asset is the one validator-configuration zip. */
export function pickKositAsset(assets) {
  const zips = assets.filter((a) => /validator-configuration.*\.zip$/i.test(a.name));
  if (zips.length !== 1) throw new Error(`expected exactly one validator-configuration zip, found ${zips.map((a) => a.name).join(', ') || 'none'}`);
  return zips[0];
}

/** "2026-08-31 (XRechnung 3.0.2)" from tag v2026-08-31 and asset xrechnung-3.0.2-validator-configuration-2026-08-31.zip. */
export function kositVersionLabel(tag, assetName) {
  const date = parseVersion(tag);
  const xr = assetName.match(/xrechnung[-_](\d+(?:\.\d+)+)/i)?.[1];
  const d = date?.kind === 'date' ? date.parts.map((n, i) => String(n).padStart(i ? 2 : 4, '0')).join('-') : tag;
  return xr ? `${d} (XRechnung ${xr})` : d;
}

export function applyHttpPin(entry, { tag, url, sha256, version, releaseUrl }) {
  return { ...entry, version, source: releaseUrl ?? entry.source.replace(/[^/]+$/, tag), url, sha256 };
}

export function applyGitPin(entry, { tag, commit }) {
  return { ...entry, version: tag, tag, commit };
}

/** Peeled commit of a tag from `git ls-remote` output (an annotated tag's ^{} line wins). */
export function commitFromLsRemote(out, tag) {
  const lines = String(out).trim().split(/\r?\n/).map((l) => l.split(/\s+/));
  const peeled = lines.find(([, ref]) => ref === `refs/tags/${tag}^{}`);
  const plain = lines.find(([, ref]) => ref === `refs/tags/${tag}`);
  const sha = (peeled ?? plain)?.[0];
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) throw new Error(`tag ${tag} not found`);
  return sha;
}

/** KoSIT agreement from the generated docs/CONFORMANCE.md summary table: every "a/b" in that column must have a === b. */
export function kositAgreement(conformanceMd) {
  const lines = conformanceMd.split('\n');
  const head = lines.findIndex((l) => l.startsWith('| Corpus |'));
  if (head < 0) return { known: false };
  const col = lines[head].split('|').map((c) => c.trim()).indexOf('KoSIT agreement');
  let agree = 0, total = 0;
  for (const l of lines.slice(head + 2)) {
    if (!l.startsWith('|')) break;
    const m = l.split('|').map((c) => c.trim())[col]?.match(/^(\d+)\/(\d+)/);
    if (m) { agree += Number(m[1]); total += Number(m[2]); }
  }
  return { known: total > 0, agree, total, full: total > 0 && agree === total };
}

/**
 * What to do when the branch for this release is already on origin. Only an existing pull request (open, merged or
 * closed) means the update was handled. A branch without one, as left by a run whose `gh pr create` was refused, is
 * reused: the gates run again and the pull request is opened from it. Skipping it silently left the run green and the
 * update unproposed for days.
 */
export function existingBranchAction(branchOnOrigin, prUrl) {
  if (!branchOnOrigin) return 'new';
  return prUrl ? 'skip' : 'reuse';
}

export function summarySection(conformanceMd) {
  const m = conformanceMd.match(/## Summary\n([\s\S]*?Overall reference agreement:[^\n]*)/);
  return m ? m[1].trim() : '';
}

export function prText({ unit, changes, gates, conformanceMd }) {
  const primary = changes[0];
  const failed = gates.find((g) => !g.ok);
  const base = `Upstream update: ${primary.id} ${primary.from} -> ${primary.to}`;
  const title = failed ? `[needs work] ${base} (${failed.name} failed)` : base;
  const k = conformanceMd ? kositAgreement(conformanceMd) : { known: false };
  const kositLine = !k.known
    ? '**Agreement with the official KoSIT validator: not measured**, because the run did not reach a regenerated conformance report.'
    : k.full
      ? `**Agreement with the official KoSIT validator is still 100%** (${k.agree}/${k.total} files).`
      : `**Agreement with the official KoSIT validator is NOT 100%**: ${k.agree}/${k.total} files. This version must not ship until it is.`;
  const body = [
    `Automated re-pin of the \`${unit}\` rule source by \`.github/workflows/upstream.yml\` (\`tools/upstream-bump.mjs\`).`, '',
    '| Artefact | Pinned | New |', '|---|---|---|',
    ...changes.map((c) => `| ${c.id} | ${c.from} | ${c.to} |`), '',
    kositLine, '',
    '### Gates (run inside the workflow job, because a PR opened with GITHUB_TOKEN does not trigger CI)', '',
    '| Step | Result |', '|---|---|',
    ...GATES.map(([name]) => { const g = gates.find((x) => x.name === name); return `| ${name} | ${g ? (g.ok ? 'pass' : '**FAIL**') : 'not run'} |`; }), '',
  ];
  if (conformanceMd && summarySection(conformanceMd)) body.push('### Conformance summary', '', summarySection(conformanceMd), '');
  if (failed) body.push(`### ${failed.name} failed`, '', 'Last lines of the log:', '', '```', failed.excerpt.slice(-6000), '```', '');
  body.push('Release rule: a new rule version ships only at 100% agreement with the KoSIT validator (docs/UPDATES.md). This PR is never merged automatically.');
  return { title, body: body.join('\n'), draft: Boolean(failed) || (k.known && !k.full) };
}

// ---------------------------------------------------------------------------------------------------------------

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: root, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024, ...opts });
const must = (cmd, args, opts) => {
  const r = run(cmd, args, opts);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status}): ${r.stderr || r.stdout}`);
  return r.stdout.trim();
};
const git = (...args) => must('git', ['-c', `user.name=${AUTHOR.name}`, '-c', `user.email=${AUTHOR.email}`, ...args]);

async function sha256Of(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex');
}

async function newPins(unit, toTag, manifest, get) {
  const changes = [];
  for (const id of UNITS[unit]) {
    const entry = manifest.artefacts[id];
    const check = toTag ? null : await checkOne(id, entry, get);
    if (check && check.status === 'error') throw new Error(`${id}: ${check.note}`);
    // KoSIT ships configuration and test suite with the same date: --to applies to both.
    const tag = toTag ?? check.upstream.tag;
    const from = SOURCES[id].pinned(entry);
    if (!toTag && compareVersions(tag, from) <= 0) continue;
    let next;
    if (entry.kind === 'git') {
      next = applyGitPin(entry, { tag, commit: commitFromLsRemote(must('git', ['ls-remote', entry.repo, `refs/tags/${tag}`, `refs/tags/${tag}^{}`]), tag) });
    } else {
      const rel = await get.github(`/repos/itplr-kosit/validator-configuration-xrechnung/releases/tags/${tag}`);
      const asset = pickKositAsset(rel.assets.map((a) => ({ name: a.name, url: a.browser_download_url })));
      next = applyHttpPin(entry, { tag, url: asset.url, sha256: await sha256Of(asset.url), version: kositVersionLabel(tag, asset.name), releaseUrl: rel.html_url });
    }
    manifest.artefacts[id] = next;
    changes.push({ id, from, to: tag });
  }
  return changes;
}

function runGates(logDir) {
  mkdirSync(logDir, { recursive: true });
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const gates = [];
  for (const [name, args] of GATES) {
    console.log(`::group::${name}`);
    const r = run(npm, args, { shell: process.platform === 'win32' });
    const log = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    writeFileSync(path.join(logDir, `${name.replace(/[^\w]+/g, '-')}.log`), log);
    process.stdout.write(log.slice(-4000));
    console.log('::endgroup::');
    const ok = r.status === 0;
    gates.push({ name, ok, excerpt: ok ? '' : log.split('\n').slice(-80).join('\n') });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
    if (!ok) break; // every later gate depends on this one
  }
  return gates;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const unit = process.argv[2];
  if (!UNITS[unit]) { console.error(`usage: upstream-bump.mjs <${Object.keys(UNITS).join('|')}> [--to <tag>] [--publish] [--skip-gates]`); process.exit(2); }
  const i = process.argv.indexOf('--to');
  const toTag = i >= 0 ? process.argv[i + 1] : undefined;
  const publish = process.argv.includes('--publish');
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf-8'));
  const get = makeGetters();
  const changes = await newPins(unit, toTag, manifest, get);
  if (changes.length === 0) { console.log(`${unit}: already at the newest upstream release, nothing to do`); process.exit(0); }
  const primary = changes[0];
  const branch = `upstream/${primary.id}-${primary.to}`;
  let reuseBranch = false;
  if (publish) {
    const onOrigin = run('git', ['ls-remote', '--exit-code', '--heads', 'origin', branch]).status === 0;
    const prUrl = onOrigin ? run('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'url', '--jq', '.[0].url // empty']).stdout.trim() : '';
    const action = existingBranchAction(onOrigin, prUrl);
    if (action === 'skip') {
      console.log(`${branch} already exists on origin and has a pull request (${prUrl}), not opening another`);
      process.exit(0);
    }
    if (action === 'reuse') {
      console.log(`${branch} exists on origin but has no pull request (an earlier run could not open it): running the gates again and opening it`);
      must('git', ['fetch', 'origin', branch]);
      reuseBranch = true;
    }
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`re-pinned: ${changes.map((c) => `${c.id} ${c.from} -> ${c.to}`).join(', ')}`);
  if (process.argv.includes('--skip-gates')) process.exit(0);

  const gates = runGates(path.join(root, 'out/upstream-gates'));
  const conformanceRan = gates.some((g) => g.name === 'conformance --strict');
  const conformanceMd = conformanceRan ? readFileSync(path.join(root, 'docs/CONFORMANCE.md'), 'utf-8') : '';
  const pr = prText({ unit, changes, gates, conformanceMd });
  mkdirSync(path.join(root, 'out'), { recursive: true });
  writeFileSync(path.join(root, 'out/upstream-pr.md'), `# ${pr.title}\n\n${pr.body}\n`);
  console.log(`\n${pr.title}\n\n${pr.body}`);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `## ${pr.title}\n\n${pr.body}\n`, { flag: 'a' });
  if (!publish) process.exit(0);

  git('checkout', '-B', branch);
  // Reusing a pushed branch: move the branch to its remote tip but keep the files just produced, so the push is a
  // fast-forward (no force) and a commit is only made if the result differs from what is already there.
  if (reuseBranch) git('reset', '--soft', `origin/${branch}`);
  git('add', 'tools/artefacts.manifest.json', ...(conformanceRan ? ['docs/CONFORMANCE.md'] : []));
  if (reuseBranch && run('git', ['diff', '--cached', '--quiet']).status === 0) console.log('the pushed branch already holds exactly this result');
  else git('commit', '-m', `${pr.title}\n\n${changes.map((c) => `${c.id}: ${c.from} -> ${c.to}`).join('\n')}`);
  git('push', 'origin', branch);
  const bodyFile = path.join(root, 'out/upstream-pr-body.md');
  writeFileSync(bodyFile, pr.body);
  const created = run('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', pr.title, '--body-file', bodyFile, ...(pr.draft ? ['--draft'] : [])]);
  if (created.status !== 0) {
    // Most likely cause: the repository setting "Allow GitHub Actions to create and approve pull requests" is off.
    // The branch is pushed and the issue is open, so the update is not lost; the run goes red so it is noticed.
    const repo = process.env.GITHUB_REPOSITORY ?? 'OWNER/REPO';
    console.error(`could not open the pull request: ${created.stderr || created.stdout}\nbranch ${branch} is pushed: https://github.com/${repo}/compare/main...${branch}?expand=1\n(Settings > Actions > General > "Allow GitHub Actions to create and approve pull requests" must be on.)`);
    process.exit(1);
  }
  console.log(`opened ${created.stdout.trim()}`);
  // A failing gate still opens the (draft) PR, and also turns the run red so it is noticed.
  if (pr.draft) process.exit(1);
}
