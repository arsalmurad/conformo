# Releasing v0.2.0

Nothing has been pushed, published or deployed by the session that prepared this. Run these yourself, in order, from the repository root, on a machine
with network access to the hosts in `tools/artefacts.manifest.json` (including `downloads.saxonica.com`, which the preparation sandbox could not reach).

## 0. Get the branch and prove it on a real machine

```bash
git fetch origin upgrade/v0.2 && git checkout upgrade/v0.2
```

```bash
npm ci
```

```bash
pip install -r tools/requirements.txt
```

(Windows: `py -m pip install -r tools\requirements.txt`.) Then the gates, one by one. **Check:** each exits 0.

```bash
npm run typecheck
```

```bash
npm run artefacts:fetch -- --group build,corpora,java,browser
```

```bash
npm run schematron:compile
```

```bash
npm run saxonjs:fetch
```

```bash
npm test
```

```bash
npm run build:sample && npm run validate
```

```bash
npm run conformance -- --strict
```

```bash
npm run pack:smoke
```

```bash
npx playwright install --with-deps chromium && npm run e2e
```

These last ones (`saxonjs:fetch`, the tests that need it, `e2e`) never ran in the session that wrote v0.2. `npm test` must now show 0 failures (the one failure seen
there was `validator-page-build`, which needs the SaxonJS runtime). `git status` should show `docs/CONFORMANCE.md` unchanged after `npm run conformance`
(if it changed, commit the regenerated file after reading the diff). If any gate fails, stop and fix it before publishing.

## 1. Publish to npm

Log in first (`npm login`; this is your credential, nothing here handles it). Build and publish each package from its `dist/` in dependency order:
a package's tarball depends on the previous ones being on the registry. The `dist/package.json` of each package is generated with matching versions.

```bash
for p in core formats pdf parse compliance-data validate schema toolkit cli mcp-server server; do npm run build --workspace=packages/$p; done
```

Then, one at a time (stop on the first error):

```bash
(cd packages/core/dist && npm publish --access public)
```

```bash
(cd packages/formats/dist && npm publish --access public)
```

```bash
(cd packages/pdf/dist && npm publish --access public)
```

```bash
(cd packages/parse/dist && npm publish --access public)
```

```bash
(cd packages/compliance-data/dist && npm publish --access public)
```

```bash
(cd packages/validate/dist && npm publish --access public)
```

```bash
(cd packages/schema/dist && npm publish --access public)
```

```bash
(cd packages/toolkit/dist && npm publish --access public)
```

```bash
(cd packages/cli/dist && npm publish --access public)
```

```bash
(cd packages/mcp-server/dist && npm publish --access public)
```

```bash
(cd packages/server/dist && npm publish --access public)
```

**Check after publishing**, from an empty directory:

```bash
mkdir /tmp/conformo-check && cd /tmp/conformo-check && npm init -y && npm install @conformo/toolkit @conformo/cli
```

```bash
npx conformo --version
```

```bash
npx conformo requirements DE
```

Then run the README quickstart (copy it from the published README on npmjs.com) and confirm `valid` is `true`. `npm view @conformo/validate dist.unpackedSize` should
be around 1.5 MB (it was 12.5 MB in 0.1.1). Add `git tag v0.2.0 && git push origin v0.2.0` only after the checks.

## 2. Redeploy the web app, validator page and docs site

I could not see how your three sites are deployed (there is no deploy configuration in the repository), so this lists what each build produces; deploy
them the way you did for 0.1.1 (the README links point at Vercel projects). Build outputs:

| Site | Build | Upload this directory |
|---|---|---|
| Web app | `npm run build --workspace=packages/ui` | `packages/ui/dist` |
| Validator page | `npm run build --workspace=packages/validator-page` | `packages/validator-page/dist` |
| Docs site | `npm run build:compliance-data && npm run docs:build` | `packages/docs-site/dist` |

The app and the validator page need `schematron:compile` and `saxonjs:fetch` to have run (their builds copy the rule sets and the runtime into `public/validator`).

**Checks after each deploy (do them in a real browser; this is where the browser path is finally exercised):**
1. Validator page: drop `fixtures/xrechnung-public-sector.json`'s output (`npx conformo create fixtures/xrechnung-public-sector.json --format xrechnung-ubl`) and confirm "Valid", and that "What ran" lists *EN 16931 (UBL)* and *XRechnung 3.0 CIUS (UBL)* with versions. Drop a CII file: it should list the CII rule sets. Drop a non-invoice XML: it must be rejected, not "valid".
2. Validator page: the "XSD not run" line should appear (the documented browser limitation).
3. Web app: fill an invoice, choose "Germany 2027 (XRechnung profile, KoSIT rules)", download the PDF, and run `npx conformo validate that.pdf`. It should be valid and the attachment `xrechnung.xml` (open the PDF's attachments).
4. Web app, default profile: the downloaded PDF validates with `npx conformo validate`.
5. Docs site: the Germany row shows B2B receiving since 2025-01-01 and issuing from 2027-01-01.
6. Browser network tab: only the rule sets a document needs are downloaded (EN 16931 CII is about 143 KB gzipped).

## 3. If you also run the optional services

HTTP API: `docker build -f Dockerfile.server -t conformo-server .` (never built in the preparation sandbox: no Docker daemon there), then `docker run -p 8788:8788 conformo-server`;
check `curl localhost:8788/healthz` and `/openapi.json`. Put it behind TLS and authentication; it has none. Remote MCP: `conformo-mcp --http --port 8787`, same advice.
