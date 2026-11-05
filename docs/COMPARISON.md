# Conformo compared with other e-invoicing projects

Written 2026-10-30. The goal is a fair map, not a ranking. Every statement about another project links to a file in that project's own repository (pinned
to a commit) or says "not verified". If a project does something that its repository does not show, this page does not claim it.

## How to read this

- **What was inspected** (shallow clones of the default branch on 2026-10-30; published versions from `npm view` / Maven Central where noted):

| Project | Repository | Commit inspected | Version seen |
|---|---|---|---|
| node-zugferd | [jslno/node-zugferd](https://github.com/jslno/node-zugferd/tree/423084b07db19131044eb1c9876721a1586e326a) | `423084b` | `0.1.1-beta.1` ([package.json](https://github.com/jslno/node-zugferd/blob/423084b07db19131044eb1c9876721a1586e326a/packages/node-zugferd/package.json)) |
| @e-invoice-eu/core | [gflohr/e-invoice-eu](https://github.com/gflohr/e-invoice-eu/tree/8e632eca96f6790c04cccdc5af7ea0add44fdb9e) | `8e632ec` | `3.4.2` ([package.json](https://github.com/gflohr/e-invoice-eu/blob/8e632eca96f6790c04cccdc5af7ea0add44fdb9e/packages/core/package.json)) |
| Mustangproject | [ZUGFeRD/mustangproject](https://github.com/ZUGFeRD/mustangproject/tree/32e59732f2846b7f2a22c08b515605c40938e95e) | `32e5973` | `2.26.1-SNAPSHOT` in [pom.xml](https://github.com/ZUGFeRD/mustangproject/blob/32e59732f2846b7f2a22c08b515605c40938e95e/Mustang-CLI/pom.xml); [Maven Central metadata](https://repo1.maven.org/maven2/org/mustangproject/library/maven-metadata.xml) listed `2.26.0` as latest |
| GOBL (Invopop) | [invopop/gobl](https://github.com/invopop/gobl/tree/34ece5d258b6e62c9345b1e925f56d9888d02675), plus [gobl.ubl](https://github.com/invopop/gobl.ubl/tree/540f20165a79bc5a96d6209effae5020fe52a83a), [gobl.cii](https://github.com/invopop/gobl.cii/tree/3216642680e6ca6393964378de15583725c5a8aa), [gobl.dev](https://github.com/invopop/gobl.dev/tree/f72c9312011001d8f85e088a70dee26683895260) | `34ece5d`, `540f201`, `3216642`, `f72c931` | tags seen: gobl `v0.511.1`, gobl.ubl `v0.99.0`, gobl.cii `v0.81.0` |
| Storecove | no public repository found | n/a | n/a |
| Conformo | this repository, branch `upgrade/v0.2` | working tree | packages at `0.1.1`; v0.2 is not published (the npm registry returned 404 for `@conformo/toolkit` on the same day) |

- A cell says **not verified** when we could not find the fact in the project's own repository. That is not a claim that the project lacks the feature.
- "Conformo" cells cite files in this repo. Where a project's documentation says something differently from its code, we quote the documentation.
- The projects solve different problems (see the notes). A longer feature list in one column is not the same as a better fit.

## Table

| | Conformo | node-zugferd | @e-invoice-eu/core | Mustangproject | GOBL (Invopop) | Storecove |
|---|---|---|---|---|---|---|
| Language / runtime | TypeScript, Node and browser ([README](../README.md)) | TypeScript, Node ([README][nz-readme]) | TypeScript; Node and browser ([core README][ei-core]) | Java; JDK 21 recommended for building ([README][mu-readme]) | Go ([README][go-readme]); wasm build for browsers ([gobl.dev README][dev-readme]) | not verified |
| Licence | Apache-2.0 ([LICENSE](../LICENSE)) | MIT ([LICENSE.md][nz-lic]) | WTFPL ([LICENSE][ei-lic]) | Apache-2.0 ([README][mu-readme]) | Apache-2.0 ([README][go-readme]) | not verified |
| CII / Factur-X / ZUGFeRD | EN 16931, XRECHNUNG, EXTENDED\* ([README](../README.md)) | MINIMUM, BASIC WL, BASIC, EN 16931, EXTENDED; CII by default ([README][nz-readme]) | all Factur-X/ZUGFeRD profiles incl. XRECHNUNG ([README][ei-readme]) | ZUGFeRD / Factur-X export and import ([README][mu-readme], [Release notes][mu-notes]) | CII incl. Factur-X, ZUGFeRD, XRechnung via add-on modules ([README][go-readme]) | not verified |
| UBL | UBL 2.1 Invoice and CreditNote ([test/ubl.test.ts](../test/ubl.test.ts)) | not verified (README says CII by default) | yes ([README][ei-readme]) | CLI has a `ubl` action ([Main.java][mu-main]) | yes ([gobl.ubl README][ubl-readme]) | not verified |
| XRechnung | 3.x CII and UBL ([test/xrechnung.test.ts](../test/xrechnung.test.ts)) | not verified | `XRECHNUNG-CII`, `XRECHNUNG-UBL` ([README][ei-readme]) | validation rules for XRechnung bundled ([resources][mu-xr]); generation not verified | `ubl+de-xrechnung-v3`, `cii+de-xrechnung-v3` ([gobl.dev README][dev-readme]) | not verified |
| Peppol BIS 3.0 | UBL documents only ([README](../README.md)) | not verified | not in its format list ([README][ei-readme]) | not verified | `ubl+peppol+bis-v3`, `cii+peppol+bis-v3` ([gobl.dev README][dev-readme]) | not verified |
| Other national formats | none: no FatturaPA, KSeF, Facturae ([README](../README.md)) | not verified | not verified | not verified | Facturae, FatturaPA, KSeF, CFDI, others as separate modules ([README][go-readme]) | not verified |
| Rule validation done by the library itself | Schematron (EN 16931, XRechnung, Peppol, BR-FR) + XSD, reports which ran ([test/validate.test.ts](../test/validate.test.ts)) | XSD only, via optional dependency `xsd-schema-validator` ([factory.ts][nz-factory]); Schematron not verified | none for business rules ([validation doc][ei-val]); input checked against a JSON schema | yes: Schematron and XSD; PDF/A via veraPDF ([validator README][mu-val]) | validates GOBL documents with its own Go rules; Schematron is run only in tests, against an external service ([gobl.ubl README][ubl-readme]) | not verified |
| Validation in a browser | Schematron rules yes, XSD no ([KNOWN-GAPS](KNOWN-GAPS.md), [test](../test/validate-browser.test.ts)) | not verified | library runs in a browser ([core README][ei-core]); it does not check business rules | not verified | wasm build ([gobl.dev README][dev-readme]) | not verified |
| Agreement with official validators, published | 1066/1066 files vs reference, 100% vs KoSIT where it has a scenario ([CONFORMANCE](CONFORMANCE.md)) | not verified | not verified | not verified | not verified | not verified |
| MCP / agent interface | MCP server, 7 tools ([packages/mcp-server/README.md](../packages/mcp-server/README.md)) | no match for "mcp" in checkout | no match for "mcp" in checkout | no match for "mcp" in checkout | `gobl mcp` over stdio ([gobl.dev README][dev-readme]) | not verified |
| CLI / HTTP API | CLI ([docs/cli.md](cli.md)); HTTP API: README says one "may exist", not shipped as evidence here | library only, per README | CLI and REST server ([README][ei-readme]) | CLI ([Main.java][mu-main]) | CLI and HTTP API ([gobl.dev README][dev-readme]) | hosted API: not verified |
| Sending over Peppol or a tax network | no ([README](../README.md)) | not verified | no mention found in READMEs | not verified | KSeF and VERI\*FACTU modules "send" ([README][go-readme]); Peppol sending not verified | the product is a network service, but not verified from a primary source |
| Hosted or self-hosted; account | self-hosted; core and web app need no account ([README](../README.md)) | library ([README][nz-readme]) | library, CLI, web service ([README][ei-readme]) | library, CLI ([README][mu-readme]) | open-source library and tools; Invopop's hosted platform not verified | not verified |

\* EXTENDED is written with EN 16931 content only. See [README](../README.md).

## Notes per project

### node-zugferd
**What it is for.** A Node.js library that builds Factur-X / ZUGFeRD CII XML from typed data and embeds it into a PDF/A-3 you supply ([README][nz-readme]).
It lists all five ZUGFeRD profiles and lets you define your own ([README][nz-readme]); Conformo does not offer MINIMUM or BASIC WL.
**Better choice when** you want the lower profiles (MINIMUM, BASIC WL, BASIC) or a TypeScript-first profile builder, and only CII.
**Caveats from its own README.** Marked "WIP" ([README][nz-readme]). XSD checking depends on an optional package, `xsd-schema-validator`
([package.json](https://github.com/jslno/node-zugferd/blob/423084b07db19131044eb1c9876721a1586e326a/packages/node-zugferd/package.json)),
which describes itself as using Java ([its README, npm `xsd-schema-validator@0.10.0`](https://www.npmjs.com/package/xsd-schema-validator/v/0.10.0)).

### @e-invoice-eu/core (e-invoice-eu)
**What it is for.** Producing EN 16931 invoices (CII, UBL, XRechnung, Factur-X/ZUGFeRD) from JSON or spreadsheets (ods, xlsx, csv), as a library, CLI or REST service
([README][ei-readme]). It documents a mapping layer for spreadsheets and a browser demo ([README][ei-readme]).
**Better choice when** your invoice data lives in spreadsheets, you want ready-made REST and CLI front ends, or you want the full set of Factur-X profiles.
**What it says about validation.** Business rules are not checked by the library; it recommends external validators ([validation doc][ei-val], [contrib/validators][ei-contrib]).
Its README states that its PDF/A handling "is not battle-tested and may fail" ([README][ei-readme]); Conformo's PDF/A claims are limited to what
[docs/pdf-traps.md](pdf-traps.md) and [test/pdfa-traps.test.ts](../test/pdfa-traps.test.ts) cover.

### Mustangproject
**What it is for.** The long-established Java library and CLI for ZUGFeRD / Factur-X: create, extract, combine, visualise and validate
([README][mu-readme], [Release notes][mu-notes]). The validator (ZUV) checks PDF/A-3 with veraPDF and the XML with Schematron
([validator README][mu-val]); its XML validator handles CII and UBL ([XMLValidator.java][mu-xmlval]).
**Better choice when** you are on the JVM, or want PDF/A conformance checking from veraPDF, which Conformo does not run. Conformo is not a Java library.
**Not verified.** UBL/XRechnung generation, Peppol, browser use, and any published agreement figures against other validators.

### GOBL (Invopop)
**What it is for.** An open JSON document model and Go library for invoices in many jurisdictions. It validates and calculates GOBL documents, then
converts them to and from formats through separate modules ([README][go-readme]). `gobl.dev` bundles them into a CLI, HTTP API, MCP server and browser editor
([gobl.dev README][dev-readme]). Conversion modules: [gobl.ubl][ubl-readme] (EN 16931, Peppol BIS 3), [gobl.cii](https://github.com/invopop/gobl.cii/blob/3216642680e6ca6393964378de15583725c5a8aa/README.md)
(EN 16931, Peppol BIS 3; Factur-X, ZUGFeRD and XRechnung via add-ons).
**Better choice when** you need countries Conformo does not cover (Italy, Poland, Spain, Mexico and others are listed in its [README][go-readme]),
want one model across many jurisdictions, or need modules that send to tax authorities (the README lists KSeF and VERI\*FACTU as "send").
**Different design.** The input is GOBL JSON, not an EN 16931 model. Its own Schematron checks run in tests against a separate validation service
([gobl.ubl README][ubl-readme]), which also lists fixtures that "do not currently pass schematron". Invopop's hosted platform and pricing: not verified.

### Storecove
No public repository was reachable (the `storecove` GitHub organisation and likely SDK names returned nothing; the npm registry has no `storecove` package
under that name). Storecove's own documentation sites are not reachable from our build environment. So nothing about Storecove is claimed here:
formats, Peppol access-point role, pricing, accounts and APIs are all **not verified**. If you need to send over Peppol, check their documentation directly.

## Where Conformo is the better fit, and where it is not

- **Fits**: you want one local call that builds and validates XRechnung / UBL / CII / Factur-X PDF with a report of which official rule sets ran, an MCP server
  for agents, and a published comparison against KoSIT and CEN files ([CONFORMANCE](CONFORMANCE.md)).
- **Does not fit**: you must send invoices (no Peppol, PA, KSeF or SdI transmission), you need FatturaPA, Facturae, or KSeF FA(3) beyond writing domestic PLN invoices, you need MINIMUM / BASIC WL
  profiles, or you need PDF/A conformance checking by veraPDF ([README](../README.md)).
- **Open gaps** ([README](../README.md), [KNOWN-GAPS](KNOWN-GAPS.md), [CONFORMANCE](CONFORMANCE.md)): XSD validation does not run in the browser; the official ZUGFeRD /
  Factur-X sample PDFs were not part of the conformance run; the report lists 6 unexplained round-trip findings; v0.2 is not yet published, so the
  published `0.1.1` packages are older than the code described here.

## What we could not verify

- Everything about Storecove (no primary source reachable).
- Invopop's hosted platform (features, pricing, Peppol or other network transmission), since its documentation site and platform pages were not reachable.
- node-zugferd: UBL, XRechnung and Peppol support, browser use, and whether it runs Schematron.
- e-invoice-eu: Peppol BIS support beyond its format list, and whether the hosted documentation says anything on transmission.
- Mustangproject: XRechnung or UBL generation, Peppol, and browser use. The checkout was shallow (one commit, no tags), so release history was not read.
- Performance, correctness rates, maturity and support quality of any project: not assessed.
- Any release published after 2026-10-30. Versions change; re-check the linked files.

[nz-readme]: https://github.com/jslno/node-zugferd/blob/423084b07db19131044eb1c9876721a1586e326a/README.md
[nz-lic]: https://github.com/jslno/node-zugferd/blob/423084b07db19131044eb1c9876721a1586e326a/LICENSE.md
[nz-factory]: https://github.com/jslno/node-zugferd/blob/423084b07db19131044eb1c9876721a1586e326a/packages/node-zugferd/src/profiles/factory.ts
[ei-readme]: https://github.com/gflohr/e-invoice-eu/blob/8e632eca96f6790c04cccdc5af7ea0add44fdb9e/README.md
[ei-core]: https://github.com/gflohr/e-invoice-eu/blob/8e632eca96f6790c04cccdc5af7ea0add44fdb9e/packages/core/README.md
[ei-lic]: https://github.com/gflohr/e-invoice-eu/blob/8e632eca96f6790c04cccdc5af7ea0add44fdb9e/LICENSE
[ei-val]: https://github.com/gflohr/e-invoice-eu/blob/8e632eca96f6790c04cccdc5af7ea0add44fdb9e/packages/docs/en/docs/details/validation.md
[ei-contrib]: https://github.com/gflohr/e-invoice-eu/blob/8e632eca96f6790c04cccdc5af7ea0add44fdb9e/contrib/validators/README.md
[mu-readme]: https://github.com/ZUGFeRD/mustangproject/blob/32e59732f2846b7f2a22c08b515605c40938e95e/README.md
[mu-notes]: https://github.com/ZUGFeRD/mustangproject/blob/32e59732f2846b7f2a22c08b515605c40938e95e/Release_Notes.md
[mu-val]: https://github.com/ZUGFeRD/mustangproject/blob/32e59732f2846b7f2a22c08b515605c40938e95e/validator/README.md
[mu-main]: https://github.com/ZUGFeRD/mustangproject/blob/32e59732f2846b7f2a22c08b515605c40938e95e/Mustang-CLI/src/main/java/org/mustangproject/commandline/Main.java
[mu-xr]: https://github.com/ZUGFeRD/mustangproject/tree/32e59732f2846b7f2a22c08b515605c40938e95e/validator/src/main/resources/xslt/XR_30
[mu-xmlval]: https://github.com/ZUGFeRD/mustangproject/blob/32e59732f2846b7f2a22c08b515605c40938e95e/validator/src/main/java/org/mustangproject/validator/XMLValidator.java
[go-readme]: https://github.com/invopop/gobl/blob/34ece5d258b6e62c9345b1e925f56d9888d02675/README.md
[ubl-readme]: https://github.com/invopop/gobl.ubl/blob/540f20165a79bc5a96d6209effae5020fe52a83a/README.md
[dev-readme]: https://github.com/invopop/gobl.dev/blob/f72c9312011001d8f85e088a70dee26683895260/README.md
