# Contributing to Conformo

Thanks for considering it. This project has a narrow, deliberately-guarded
mission — read `CONTRIBUTING.md` first. It is the actual contract for this repo,
not a style guide: every non-negotiable invariant there (integer money, zero
runtime dependencies in `core`/`formats`, deterministic output, no headless
browser in the PDF path, "never claim compliance, show it") is enforced in
review, and a PR that violates one will be asked to change regardless of how
good the rest of it is.

## Before you write code

1. **Check `the project's own tracker`** for what's already built, what's known to be
   missing, and open questions. It is more current than this file.
2. **For a compliance-data change** (`packages/compliance-data`), read the
   "Note on accuracy" in `the project's own conventions`: every fact needs
   a source URL from a tax authority, ministry, or official EU page — never
   a vendor blog, law firm summary, or encyclopedia. A fact you can't source
   that way goes in with `status: "unverified"`, not omitted and not guessed.
   Run `npm run build:compliance-data && npm run readme:matrix` after editing
   any file under `packages/compliance-data/src/data/` — the README's
   compliance table is generated, never hand-edited.
3. **For a new invoice format or CIUS**, don't add a format-specific field to
   `packages/core`. Every format is a serializer/reader over the one EN 16931
   model; if a format needs something the model doesn't have, it either maps
   from the existing model or it doesn't ship (CONTRIBUTING.md invariant 2).
4. **Money is always integer minor units.** If you touch anything that
   multiplies or divides an amount, route it through
   `packages/core/src/money.ts`'s exact-decimal helpers. A float anywhere in
   that path is a bug even if the tests you wrote happen to pass.

## Development

    npm install
    npm run typecheck
    npm run test
    npm run build:sample && npm run validate

The last command needs Python 3 and a few packages:

    pip install factur-x pikepdf lxml saxonche

To run the app:

    npm run schematron:compile   # once, or after changing a Schematron
    npm run saxonjs:fetch        # once
    npm run dev --workspace=packages/ui

To run the end-to-end gate (creates an invoice through the real UI):

    npx playwright install --with-deps chromium
    npm run e2e

## Definition of done (from `CONTRIBUTING.md`)

- `npm run typecheck` clean, strict mode, no `any` added to public APIs
- `npm run test` passes, and new behavior has a test that would fail without it
- `npm run build:sample && npm run validate` both pass
- No new runtime dependency in `packages/core` or `packages/formats`
- Public API documented with the BT/BG identifier it maps to, where one applies

## Pull requests

- Keep a PR to one logical change. A bug fix doesn't need a drive-by refactor
  next to it.
- Explain *why*, not just what — the diff already shows what changed.
- If you're touching `packages/pdf/src/pdfa.ts` or `packages/formats/src/cii.ts`'s
  element order, read `docs/pdf-traps.md` first and rerun
  `npm run build:sample && npm run validate` after — both files encode
  non-obvious requirements found the hard way, each commented with which trap
  it is.
- Anti-goals are listed in `CONTRIBUTING.md` and won't be reconsidered in a PR
  thread: double-entry accounting, payroll, expenses, inventory, CRM,
  time tracking, becoming an ERP, a mandatory account, a mandatory server,
  or any feature that needs a headless browser to produce a PDF.

## Reporting a security issue

See `SECURITY.md`. Do not open a public issue for a vulnerability.

## License

By contributing, you agree your contribution is licensed under the
project's Apache License 2.0 (see `LICENSE`).
