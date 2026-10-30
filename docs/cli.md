# Conformo CLI

`conformo` is the command-line front end of `@conformo/toolkit`. Every command works on Windows and Linux,
reads `-` as stdin where a file is expected, and gives the same answer for the same input (output is
deterministic). Conformo shows what a document passes and fails; it never claims compliance on its own.

Run `conformo --help` or `conformo <command> --help` for the built-in help. `conformo --version` prints the version.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success; for `validate`, the document is valid |
| 1 | `validate`: invalid (a rule or the XSD failed). `parse`: invalid or PDF totals disagree with the XML. `explain`: unknown rule id |
| 2 | Usage or input error: unreadable file, unsupported document, unknown command, unknown or valueless flag, unknown country, an invoice that cannot be written |

## create

Writes an invoice (JSON, money as integer minor units) as XML, or as a Factur-X/ZUGFeRD PDF/A-3 with the XML embedded.

Formats: `cii`, `cii-extended`, `ubl`, `xrechnung-cii`, `xrechnung-ubl`, `peppol-ubl`.
Without `-o`, XML goes to stdout (messages go to stderr). A PDF requires `-o`.
PDF options: `--profile en16931|xrechnung|extended` (default `en16931`), `--template classic|modern|compact` (default `classic`).
With `--profile xrechnung` the embedded file is `xrechnung.xml`, otherwise `factur-x.xml`.

If the invoice cannot be written, every problem is printed to stderr as `path [BT-x]: message` and the exit code is 2.

```bash
conformo create fixtures/xrechnung-public-sector.json --format xrechnung-cii -o invoice.xml
```

```bash
conformo create fixtures/peppol-belgium-full.json --format peppol-ubl -o peppol.xml
```

```bash
conformo create fixtures/xrechnung-public-sector.json --pdf --profile xrechnung --template modern -o invoice.pdf
```

```bash
cat fixtures/xrechnung-public-sector.json | conformo create - --format ubl > invoice-ubl.xml
```

## convert

Reads CII, UBL, XRechnung or a hybrid PDF and writes another XML flavour (`--to` takes the same format names as `create`).
Fields the target does not carry are dropped, never invented. Without `-o` the XML goes to stdout.

```bash
conformo convert invoice.xml --to ubl -o invoice-ubl.xml
```

```bash
conformo convert invoice.pdf --to xrechnung-cii -o xrechnung.xml
```

## validate

`conformo validate <file.xml|file.pdf|-> [--country FR|DE] [--profile en16931|xrechnung|peppol] [--no-xsd] [--json]`

Syntax (CII or UBL) and profile are detected from the document; a PDF has its embedded XML validated. Human output lists
the rule sets that ran, the XSD result, notices, then each failure with its official message and a plain-language
explanation. Some profiles run fewer rules (for example `EXTENDED` only gets its XSD, and a notice says so).
`--json` prints the complete result as a single JSON document on stdout and nothing else.

```bash
conformo validate invoice.xml
```

```bash
conformo validate invoice.pdf --country DE
```

```bash
conformo validate invoice.xml --profile peppol --no-xsd
```

```bash
conformo validate fixtures/negative/broken-invoice.xml --json
```

```bash
cat invoice.xml | conformo validate -
```

## parse

`conformo parse <file.pdf|file.xml|-> [--country FR] [--csv out.csv] [--accounting out.json] [--json]`

Reads an invoice into the EN 16931 model. For a PDF the visible totals are checked against the embedded XML. CII
documents are validated too. `--json` prints the Invoice on stdout and nothing else (the summary goes to stderr).

```bash
conformo parse invoice.pdf
```

```bash
conformo parse invoice.xml --json
```

```bash
conformo parse invoice.xml --csv invoice.csv --accounting invoice.json
```

## explain

`conformo explain <rule-id> [--json]`: what a rule means, why it exists, how to fix it, the publisher's official wording and
which rule set defines it. An unknown id exits 1.

```bash
conformo explain BR-CO-15
```

```bash
conformo explain BR-DE-15 --json
```

## requirements

`conformo requirements <country> [--json]` and `conformo requirements --list`

Shows each mandate (scope, issuing vs receiving, dates, thresholds, required formats, status), the source URL and the date
it was last verified, plus a line per required format saying whether Conformo can generate, read and validate it. A format
Conformo does not support (for example FatturaPA for Italy) is reported as not supported. An unknown country exits 2 and
lists the supported ones.

```bash
conformo requirements DE
```

```bash
conformo requirements IT --json
```

```bash
conformo requirements --list
```
