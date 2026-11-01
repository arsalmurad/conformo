import { writeFile } from "node:fs/promises";
import { totals } from "@conformo/core";
import type { Invoice } from "@conformo/core";
import { validate } from "@conformo/validate";
import {
  detectXmlFormat, exportInvoicesToAccountingJson, exportInvoicesToCsv, readInvoiceFromPdf,
} from "@conformo/parse";
import { bool, parseArgs, str, UsageError } from "../args.js";
import { line, readInput } from "../io.js";
import type { Io } from "../io.js";

export const PARSE_HELP = `conformo parse: read an e-invoice into the EN 16931 model

Usage:
  conformo parse <file.pdf|file.xml|-> [--country FR] [--csv out.csv] [--accounting out.json] [--json]

Parses a Factur-X/ZUGFeRD PDF, CII, UBL or XRechnung file. For a PDF it checks the visible totals against
the embedded XML; for CII it also runs the validator.

Options:
  --country FR          Add the French CTC layer to the CII validation
  --csv <file>          Also write the invoice as CSV
  --accounting <file>   Also write the invoice as accounting JSON
  --json                Print the Invoice as JSON on stdout, and nothing else
  -h, --help            Show this help

Exit codes: 0 ok, 1 the document is invalid or its PDF totals disagree with its XML, 2 usage or input error.

Examples:
  conformo parse hybrid.pdf
  conformo parse invoice.xml --json
  conformo parse invoice.xml --csv invoice.csv --accounting invoice.json
`;

function isPdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

export async function parseCommand(argv: string[], io: Io): Promise<number> {
  const a = parseArgs(argv, {
    country: { type: "string" }, csv: { type: "string" }, accounting: { type: "string" }, json: { type: "boolean" },
  }, 1);
  if (a.help) { io.out(PARSE_HELP); return 0; }
  const file = a.positionals[0];
  if (!file) throw new UsageError("Missing <file.pdf|file.xml> (use - for stdin).");
  const countryRaw = str(a, "country");
  if (countryRaw !== undefined && countryRaw.toUpperCase() !== "FR") {
    throw new UsageError(`Unsupported --country "${countryRaw}" (only "FR" is compiled for parse)`);
  }
  const country = countryRaw ? ("FR" as const) : undefined;
  const csv = str(a, "csv");
  const accounting = str(a, "accounting");
  const json = bool(a, "json");
  // With --json stdout carries the Invoice only; the human narrative goes to stderr.
  const say = (t: string): void => (json ? io.err(line(t)) : io.out(line(t)));
  let exit = 0;

  const bytes = await readInput(file, io);
  let invoice: Invoice;
  let format: string;
  let xmlForValidation: string | undefined;

  try {
    if (isPdf(bytes)) {
      const result = await readInvoiceFromPdf(new Uint8Array(bytes));
      invoice = result.invoice;
      format = result.format;
      say(`Extracted ${result.xmlFilename} (${format}) from ${file}`);
      if (!result.visibleTotals.checked) {
        say("Visible-totals check: could not find the expected totals on the rendered page (unverified, not necessarily wrong).");
      } else if (result.visibleTotals.mismatches.length === 0) {
        say("Visible-totals check: PASS — the PDF's rendered totals match the embedded XML.");
      } else {
        say("Visible-totals check: FAILED — the PDF's rendered page disagrees with its own embedded XML:");
        for (const m of result.visibleTotals.mismatches) {
          say(`  ${m.label}: page shows ${m.visibleText}, XML says ${(m.expectedMinor / 100).toFixed(2)}`);
        }
        exit = 1;
      }
      if (format === "cii") xmlForValidation = result.xml;
    } else {
      const xml = bytes.toString("utf-8");
      const result = detectXmlFormat(xml);
      invoice = result.invoice;
      format = result.format;
      say(`Detected ${format} in ${file}`);
      if (format === "cii") xmlForValidation = xml;
    }
  } catch (err) {
    throw new UsageError(`Failed to parse ${file}: ${(err as Error).message}`);
  }

  const t = totals(invoice);
  say(
    `Invoice ${invoice.number}: ${invoice.seller.name} -> ${invoice.buyer.name}, ` +
    `${(t.due / 100).toFixed(2)} ${invoice.currency} due${invoice.dueDate ? ` by ${invoice.dueDate}` : ""}.`,
  );

  if (format === "cii" && xmlForValidation) {
    const report = await validate(xmlForValidation, country ? { country } : {});
    const failures = report.results.filter((r) => r.severity === "error" || r.severity === "fatal");
    say(`Validation: ${report.valid ? "VALID" : "INVALID"} — ${report.firedCount} rules checked, ${failures.length} failed.`);
    if (!report.valid) exit = 1;
  } else {
    say("Validation: skipped (Schematron validation only covers the CII syntax today; use `conformo validate` for UBL).");
  }

  if (csv) {
    await writeFile(csv, exportInvoicesToCsv([invoice]));
    say(`Wrote ${csv}`);
  }
  if (accounting) {
    await writeFile(accounting, exportInvoicesToAccountingJson([invoice]));
    say(`Wrote ${accounting}`);
  }
  if (json) io.out(`${JSON.stringify(invoice, null, 2)}\n`);
  return exit;
}
