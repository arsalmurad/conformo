## What and why

<!-- What changed, and why — the diff already shows what, focus on why. -->

## Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes, and new behavior has a test that would fail without it
- [ ] `npm run build:sample && npm run validate` both pass
- [ ] No new runtime dependency added to `packages/core` or `packages/formats`
- [ ] If this touches `packages/pdf/src/pdfa.ts` or `packages/formats/src/cii.ts`'s element order, I read `docs/pdf-traps.md` first
- [ ] If this changes `packages/compliance-data/src/data/*.json`, every fact has a real source URL (tax authority, ministry, or official EU page) or is marked `status: "unverified"`, and I ran `npm run build:compliance-data && npm run readme:matrix`

## Anything the reviewer should know

<!-- Trade-offs, things you're unsure about, follow-up you're deliberately not doing here. -->
