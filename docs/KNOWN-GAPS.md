# Known gaps

What is not done or not verified, and why. Nothing here is hidden elsewhere.

## Product gaps

- **No transmission.** Conformo creates and checks documents. It does not send over the Peppol network, to a French *plateforme agréée* (PA, formerly PDP),
  to Poland's KSeF or to Italy's SdI.
- **No FatturaPA or Facturae** serializer, reader or validator. The Agenzia delle Entrate schema is not on a host the build environment could reach, and
  no other source qualifies as primary. Every surface says so (`getRequirements().conformoSupport`, `conformo requirements IT`).
- **KSeF FA(3) is partial**: generation for domestic PLN invoices (S at 23/8/5, Z, E) and validation against the Ministry of Finance XSD only. No reader,
  no credit notes, no foreign currency, no reverse charge/OSS, no KSeF business rules (KSeF applies them on submission), and no submission.
- **XSD validation runs in Node only.** The browser build runs the Schematron rule sets. XSD in the browser would need libxml2-WASM plus roughly 1 MB of
  schemas fetched on demand; that is possible (the Node path already uses libxml2-WASM) but is not built or tested.
- **ZUGFeRD / Factur-X EXTENDED** is written with EN 16931 content only; EXTENDED-only fields are not modelled. Only the EXTENDED XSD is checked for it,
  the EN 16931 business rules are not run (the validator says so in a notice).
- **Several payment-means types in one invoice** (BG-16 repeated with different codes) are not representable; additional accounts of the *same* type are.
- **Extension-only terms** such as the XRechnung extension's third-party payment (BG-DEX-09) are not modelled. Converting such a document reports the total difference.
- **Hungarian-style national rounding of VAT** is not implemented. A document stating VAT that differs from the computed value by more than one minor unit is
  converted with a warning (`parse().totalsCheck`).
- **Other unknown BT-24 values are not rejected.** An identifier that does not name XRechnung (for example `urn:example:foo`) gets the plain EN 16931 rules and a `PROFILE-UNKNOWN` warning, and the document can still be valid. The official KoSIT validator finds no scenario for such a value and rejects it. Conformo does not copy that, because it also supports Peppol BIS and Factur-X / ZUGFeRD identifiers that KoSIT has no scenario for, and a national CIUS can carry its own identifier. Identifiers that name XRechnung (`xrechnung`, `xeinkauf` or `kosit`) are rejected like KoSIT does (`XRECHNUNG-ID-UNKNOWN`).
- **The French CTC rules** are a pinned third-party artefact (factur-x 6.8, FNFE-MPE) that was not cross-checked against a second source in the conformance run.

## Verification gaps (v0.2 build environment)

The session that produced v0.2 ran in a sandbox whose network policy allowed git clones of public GitHub repositories, raw GitHub files, Maven Central, npm and
PyPI, and blocked everything else. Consequences:

- **The SaxonJS browser runtime** (`downloads.saxonica.com`) could not be fetched. So in that session these never ran: the validator-page build, its test,
  `test/validate-browser.test.ts` (skipped), the end-to-end test with Playwright, and therefore the Germany profile choice in the web app is covered by
  typecheck only. They run in CI (`.github/workflows/ci.yml`), which fetches the runtime with its SHA-256 pin. If you build on a network that blocks Saxonica,
  download `SaxonJS-2.7.zip` elsewhere and run `CONFORMO_SAXONJS_ZIP=<zip> npm run saxonjs:fetch`.
- **Primary legal sources were unreachable** (BMF, § 27 UStG, ministry and tax-authority sites, EU pages, FeRD). The compliance dataset keeps the facts that were
  already sourced; new or changed windows supplied by the project owner (Poland's third KSeF window, the Belgian tolerance period, the French PA naming) are
  marked unverified, and no `lastVerified` date was moved. The guide `docs/GERMANY-2027.md` states the German dates with the same caveat.
- **ZUGFeRD profile names and the `xrechnung.xml` attachment name** were confirmed against two implementations (the factur-x library and Mustangproject's source), not
  against the FeRD specification text.
- **Official ZUGFeRD / Factur-X sample PDFs** (FeRD, FNFE) were unreachable, so the conformance report covers the KoSIT test suite, the Peppol examples and the CEN
  examples and unit tests, not PDF samples.
- **Windows**: every RELEASE.md section 0 gate, including the e2e suite and KoSIT via Java, has been run on Windows 10 (Node 24, Python 3.13, Temurin 17) as well as on the Linux CI runner.
- **Storecove** has no public repository, so the comparison page could not verify anything about it.
- **The PDF's own labels are English** ("INVOICE", "BILL TO", "Amount due") whatever the customer's language, although the
  app around it is English and German. Dates and amounts already follow the invoice's country. Translating the labels
  changes the output of every template in `packages/pdf` and needs new reference output for the PDF/A and
  determinism tests.
- **The app does not offer VAT category K** (intra-EU supply of goods): EN 16931 then also needs the delivery date and
  deliver-to country (BR-IC-11/12), which the form does not ask for yet. The library and CLI support K.
- **Conformo's own notices are in English only**, also on the German validator page: the notice text (for example the Leitweg-ID or XRECHNUNG-ID-UNKNOWN message) is shown as written. The labels around it are translated.
