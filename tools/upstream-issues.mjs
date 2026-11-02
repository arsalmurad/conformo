#!/usr/bin/env node
// Turns out/upstream.json (tools/check-upstream.mjs) into GitHub issues, via the `gh` CLI:
// - one open issue per newer upstream release, titled "Upstream update: <artefact> <pinned> -> <latest>", label
//   upstream-update; an identical open title is never opened twice;
// - an open issue for an artefact whose pin has caught up, or that a still newer release has superseded, is closed.
// Report-only and manual artefacts never open issues; an artefact whose check errored is left alone.
//
// Usage: node tools/upstream-issues.mjs [out/upstream.json] [--dry-run]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toMarkdown } from './check-upstream.mjs';

export const LABEL = 'upstream-update';
export const issueTitle = (r) => `Upstream update: ${r.artefact} ${r.pinned} -> ${r.latest}`;
const prefix = (id) => `Upstream update: ${id} `;

export function issueBody(r, results) {
  const how = r.bump
    ? 'This is a rule source. The same workflow run re-pins it on a branch, runs every gate including the full KoSIT test suite against the official KoSIT validator, and opens a pull request with the result.'
    : r.needsManualReview
      ? 'This needs a manual review before it can be pinned (see the note). Nothing is changed automatically.'
      : 'Not auto-bumped: update `tools/artefacts.manifest.json` by hand and re-run `npm run conformance -- --strict`.';
  return [`**${r.artefact}**: pinned ${r.pinned}, newest upstream ${r.latest} (${r.feed}).`, '',
    ...(r.note ? [`Note: ${r.note}`, ''] : []), how, '', 'All pinned artefacts at the time of this check:', '', toMarkdown(results),
    'Opened by `.github/workflows/upstream.yml`. This issue closes itself once the pin catches up. See docs/UPDATES.md.'].join('\n');
}

/** Pure: what to open and what to close, given the check results and the currently open upstream-update issues. */
export function planIssues(results, openIssues) {
  const create = [], close = [];
  for (const r of results) {
    if (r.status === 'error' || r.status === 'manual' || r.reportOnly) continue;
    const mine = openIssues.filter((i) => i.title.startsWith(prefix(r.artefact)));
    const want = r.status === 'newer available' ? issueTitle(r) : null;
    for (const i of mine) if (i.title !== want) close.push({ number: i.number, title: i.title, reason: want ? `superseded by "${want}"` : `the pin is now ${r.pinned}, which is the newest upstream release` });
    if (want && !mine.some((i) => i.title === want)) create.push({ title: want, body: issueBody(r, results) });
  }
  return { create, close };
}

const gh = (args) => {
  const r = spawnSync('gh', args, { encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`gh ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'out/upstream.json';
  const dry = process.argv.includes('--dry-run');
  const { results } = JSON.parse(readFileSync(file, 'utf-8'));
  const open = JSON.parse(gh(['issue', 'list', '--label', LABEL, '--state', 'open', '--limit', '200', '--json', 'number,title']));
  const plan = planIssues(results, open);
  if (!dry) gh(['label', 'create', LABEL, '--color', '0e8a16', '--description', 'A pinned official artefact has a newer upstream release', '--force']);
  for (const c of plan.close) {
    console.log(`close #${c.number} ${c.title} (${c.reason})`);
    if (!dry) gh(['issue', 'close', String(c.number), '--comment', `Closing: ${c.reason}.`]);
  }
  for (const c of plan.create) {
    console.log(`open "${c.title}"`);
    if (!dry) gh(['issue', 'create', '--title', c.title, '--label', LABEL, '--body', c.body]);
  }
  if (!plan.create.length && !plan.close.length) console.log('issues already up to date');
}
