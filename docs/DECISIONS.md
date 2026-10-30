# Decisions

One line of reasoning each, newest last.

- Work in `/home/user/arsalmurad/conformo` cloned read-only (shallow). Push access was declined by the harness and the brief says never push; commits stay local on `upgrade/v0.2`.
- Fetch official corpora with `git clone --depth 1` + tag pin, because GitHub zip/API hosts are blocked here but the git lane works; pins are by commit SHA and recorded in the manifest.
- SchXslt2 is pinned from Maven Central (hash 5251979...), verified against Maven's own published .sha256/.sha1; the earlier Codeberg pin is dropped because Codeberg is unreachable from some networks. (An interim hash I first noted was the body of a rate-limit page; the fetcher's checksum verification caught it, which is the point of pinning.)
- All third-party artefacts are declared once in `tools/artefacts.manifest.json` and fetched by `tools/fetch-artefacts.mjs` (Node, no Python), replacing `tools/fetch_artefacts.py` and the inline URLs in the compile script.
- Git artefacts are pinned by the commit a tag peels to and fetched via `refs/tags/<tag>` because some upstream repos have a branch with the same name as a tag.
- `Invoice.payment` (BG-16) is optional: EN 16931 makes it 0..1 and official corpus documents omit it; `checkInvoice` warns, and XRechnung's own check (BR-DE-1) is left to the KoSIT rules. The README crash was a missing-field TypeError; the fix is a typed `InvoiceInputError` listing every problem.
- `unitPriceMinor` may be fractional (minor units) because BT-146 allows more decimals than the currency; arithmetic stays in exact BigInt decimals, only output formatting changed (`priceToMajor`).
- EN 16931 base rules now come from CEN's own release (validation-1.3.17), not the factur-x pip package's adaptation, per the brief; the pip package is kept pinned only for the French CTC rules and the Factur-X profile XSDs.
- BT-29/BT-46 with a scheme are written as CII `ram:GlobalID` (the EN 16931 binding), without a scheme as `ram:ID`.
- BT-90 (SEPA creditor id) is stored under `payment.directDebit.creditorId` and written as CII `CreditorReferenceID` / UBL seller `PartyIdentification` with schemeID `SEPA`, per the syntax bindings.
