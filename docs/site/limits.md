# What Conformo does not do yet

Said plainly, so nobody finds out the hard way.

- **It does not send invoices.** No Peppol access point, no French PA/PDP, no KSeF, no SdI, no ZRE/OZG-RE upload. It makes and checks documents; you send them.
- **No FatturaPA (Italy) or FacturaE (Spain)** at all. `conformo requirements IT` says so instead of pretending.
- **KSeF FA(3) (Poland) is partial:** domestic PLN invoices only (standard rates, 0 %, exempt), checked against the XSD only, not readable back, and not submitted to KSeF.
- **Belgium's 2026 B2B mandate needs Peppol delivery.** The library writes Peppol BIS Billing 3.0 UBL; delivering it needs an access point.
- **No XSD check in the browser.** The app and the validator page run the full official Schematron; the XML schema check runs in Node (library, CLI, MCP, HTTP API).
- **The PDF's labels are English** ("INVOICE", "BILL TO") for every customer, although the app itself is English and German.
- **The web app does not offer VAT category K** (intra-EU supply of goods), because the form does not yet ask for the delivery date and country it requires. The library supports it.
- **Not a compliance guarantee.** `valid: true` means the listed official rule sets and the XSD passed. Whether a tax authority, buyer or network accepts an invoice also depends on things no validator sees.
- **Not accounting software.** No bookkeeping, payroll, expenses, inventory, CRM or time tracking, and no account or server is required for anything.

The full list of known gaps, with the reasons, is in [docs/KNOWN-GAPS.md](../KNOWN-GAPS.md).
