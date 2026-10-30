# Known gaps

Things that are not done or not verified, and why. Nothing here is hidden elsewhere.

## Sandbox-only (not product gaps)
- The SaxonJS browser runtime (`SaxonJS2.rt.js`) comes from `downloads.saxonica.com`, which the development sandbox could not reach. Browser-side gates (validator page build, `validate-browser` test, e2e) therefore ran only in CI / on a developer machine, never in the session that produced v0.2. See PROGRESS.md for which gates ran where.
- Ministry, EU and FeRD web pages were unreachable from the sandbox. Compliance facts that could not be re-read from a primary source are marked `status: "unverified"`.
