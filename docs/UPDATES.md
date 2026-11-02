# How Conformo keeps up with official rule changes

Deutsche Fassung: [UPDATES.de.md](UPDATES.de.md).

## What is pinned

Conformo validates with the official rule files, unmodified: the KoSIT XRechnung configuration, the CEN EN 16931
Schematron, the Peppol BIS Billing 3.0 rules, and the French CTC rules. Each one is pinned to an exact version and a
SHA-256 hash or git commit in `tools/artefacts.manifest.json`, so every result can be reproduced.

You can always see which versions are in use:

- in [CONFORMANCE.md](CONFORMANCE.md), table "Pinned inputs";
- in every validation result: `result.ruleSets` names each rule set with its publisher and version, for example
  "KoSIT validator-configuration-xrechnung 2026-08-31 (XRechnung 3.0.2)".

## The daily check

Every day at 06:17 UTC a GitHub workflow (`.github/workflows/upstream.yml`) asks each publisher for its newest
release: KoSIT and OpenPeppol on GitHub, CEN's GitHub tags, Maven Central and PyPI. It compares that with the pin.

When KoSIT, CEN or OpenPeppol publish a new release:

1. An issue opens, titled `Upstream update: <artefact> <pinned> -> <latest>`. The same update never opens twice, and the
   issue closes itself once the pin catches up.
2. The workflow pins the new release on a branch (new version and freshly computed hash), then runs the full test
   suite and the full KoSIT XRechnung test suite against the official KoSIT validator.
3. It opens a pull request that says plainly whether agreement with the KoSIT validator is still 100%, with the
   conformance table. If any step fails, the pull request is a draft marked "[needs work]" with the failing step and
   its log. Nothing is merged automatically.

KoSIT publishes its validator configuration and its test suite together, with the same date, so Conformo updates
them together.

## The release rule

A new rule version ships only at 100% agreement with the official KoSIT validator, measured on the full KoSIT test
suite and the CEN examples. Anything less stays a draft pull request. The same run also requires Conformo's results to
match the publishers' own rule files on every sample file; any difference that is not explained in writing fails it.

## What is still manual

- **SaxonJS runtime** (the XSLT engine that runs the rules in the browser). Saxonica has no machine-readable release
  feed, so the check marks it "manual check".
- **factur-x major versions.** The factur-x package supplies the French CTC rules and the Factur-X schemas. Version
  7.x renamed the Schematron files Conformo reads, so a major version opens an issue flagged for manual review instead
  of an automatic update.
- The KoSIT validator itself, SchXslt2 and the KSeF documentation are reported and get an issue, but are updated by
  hand: they are tools and references, not rule sources.

To run the check yourself: `node tools/check-upstream.mjs` (it writes `out/upstream.md` and `out/upstream.json`).
