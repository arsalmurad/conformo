# Releasing

## How a release works

A release is a tag. Pushing `vX.Y.Z` runs `.github/workflows/release.yml`, which runs the gates, publishes every package whose version is not on npm yet,
checks that each version is on npm, publishes `@conformo/mcp-server` to the official MCP Registry when its version changed, and creates the GitHub Release
from the CHANGELOG section. There is no npm token anywhere: npm trusts the workflow by OIDC (trusted publishing), and each package is published with provenance.

1. Bump the versions of the packages that changed (`packages/*/package.json`; for `@conformo/mcp-server` also `version` and `packages[0].version` in `packages/mcp-server/server.json`).
   Internal dependency ranges follow the sibling version. Run `npm install --package-lock-only --ignore-scripts` and `npm run openapi:generate`.
2. Add a `## X.Y.Z (date)` section to `CHANGELOG.md`. The GitHub Release body is that section.
3. Run the gates locally: `npm run typecheck`, `npm run schematron:compile`, `npm test`, `npm run conformance -- --strict`, `npm run docs:build`, `npm run pack:smoke`.
4. Commit, push `main`, and wait for the `ci` and `deploy` runs to go green.
5. Push the tag on that commit: `git tag vX.Y.Z && git push origin vX.Y.Z`. The tag has to be on `main`; the workflow refuses it otherwise.

That is all. Watch it with `gh run watch`. If it fails after some packages were published, fix the cause and publish the tag again: delete it on GitHub
(`git push origin :refs/tags/vX.Y.Z`), move it to the fixed commit, push it. Versions already on npm are skipped.
The workflow has no manual trigger on purpose: npm checks the name of the calling workflow, and a manual or reusable workflow can make that check fail.

### One-time setup on npmjs.com

For each published package (`@conformo/core`, `formats`, `pdf`, `parse`, `compliance-data`, `validate`, `schema`, `toolkit`, `cli`, `mcp-server`, `server`):
Settings, Trusted publisher, GitHub Actions. Organization or user `arsalmurad`, Repository `conformo`, Workflow filename `release.yml`, Environment empty,
and under Allowed actions tick `npm publish`. npm does not check the form when it is saved, and a new configuration expires if its first publish does not
happen within 2 days. Afterwards, Publishing access can be set to "Require two-factor authentication and disallow tokens"; that does not affect trusted publishers.

The MCP Registry needs no secret: `mcp-publisher login github-oidc` uses the job's OIDC token for the `io.github.arsalmurad` namespace.

## Fallback: releasing by hand

Only if the workflow cannot be used. Needs an npm login that can publish (a passkey cannot be answered from a non-interactive shell, so run the publish in a normal terminal).

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

## 4. List the MCP server in the official MCP Registry

The registry ([quickstart](https://modelcontextprotocol.io/registry/quickstart)) only stores metadata and points at the npm package, so this runs after
`@conformo/mcp-server` is on npm. `packages/mcp-server/server.json` is the listing; `test/mcp-registry.test.ts` keeps its versions equal to
`packages/mcp-server/package.json`, whose `mcpName` (copied into the published manifest) proves the npm package belongs to the listing.
On every MCP server release, bump `version` and `packages[0].version` in `server.json` together with `package.json`.

Install `mcp-publisher` once (`brew install mcp-publisher`, or the binary from github.com/modelcontextprotocol/registry/releases), then:

```bash
npm view @conformo/mcp-server@$(node -p "require('./packages/mcp-server/package.json').version") mcpName
```

**Check:** it prints `io.github.arsalmurad/conformo`. If it prints nothing, the npm release predates the `mcpName` field; publish a new version first.

```bash
cd packages/mcp-server && mcp-publisher login github && mcp-publisher publish
```

`login github` shows a code to enter at github.com/login/device; sign in as `arsalmurad` (the `io.github.arsalmurad/` prefix only works for that account).

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.arsalmurad/conformo"
```

**Check:** the result lists the version you just published.

## 5. Update the Glama listing

Glama (glama.ai/mcp/servers/arsalmurad/conformo) runs the published npm package. After an MCP server release: in Admin, Dockerfile, change the build
step to the new version (`["npm install -g @conformo/mcp-server@<version>"]`, CMD stays `["conformo-mcp"]`), press Build, and when the test succeeds
use Create Release with the same version. Glama then re-rates the tool descriptions on its own.
