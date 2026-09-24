import { readFile, writeFile } from "node:fs/promises";
import { totals } from "@verinvoice/core";
import type { Invoice } from "@verinvoice/core";
import { validate } from "@verinvoice/validate";
import {
  detectXmlFormat, exportInvoicesToAccountingJson, exportInvoicesToCsv, readInvoiceFromPdf,
} from "@verinvoice/parse";

interface ParsedArgs {
  file?: string;
  country?: "FR";
  csv?: string;
  accounting?: string;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--country") {
      const value = args[++i];
      if (value === "FR") result.country = value;
      else throw new Error(`Unsupported --country "${value}" (only "FR" is compiled today)`);
    } else if (args[i] === "--csv") {
      result.csv = args[++i];
    } else if (args[i] === "--accounting") {
      result.accounting = args[++i];
    } else if (!result.file) {
      result.file = args[i];
    }
  }
  return result;
}

function isPdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

export async function runParse(args: string[]): Promise<void> {
  const { file, country, csv, accounting } = parseArgs(args);
  if (!file) {
    console.error("Usage: verinvoice parse <file.pdf|.xml> [--country FR] [--csv out.csv] [--accounting out.json]");
    process.exitCode = 1;
    return;
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch (err) {
    console.error(`Could not read ${file}: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  let invoice: Invoice;
  let format: string;
  let xmlForValidation: string | undefined;

  try {
    if (isPdf(bytes)) {
      const result = await readInvoiceFromPdf(new Uint8Array(bytes));
      invoice = result.invoice;
      format = result.format;
      console.log(`Extracted ${result.xmlFilename} (${format}) from ${file}`);
      if (!result.visibleTotals.checked) {
        console.log("Visible-totals check: could not find the expected totals on the rendered page (unverified, not necessarily wrong).");
      } else if (result.visibleTotals.mismatches.length === 0) {
        console.log("Visible-totals check: PASS — the PDF's rendered totals match the embedded XML.");
      } else {
        console.log("Visible-totals check: FAILED — the PDF's rendered page disagrees with its own embedded XML:");
        for (const m of result.visibleTotals.mismatches) {
          console.log(`  ${m.label}: page shows ${m.visibleText}, XML says ${(m.expectedMinor / 100).toFixed(2)}`);
        }
        process.exitCode = 1;
      }
      if (format === "cii") xmlForValidation = result.xml;
    } else {
      const xml = bytes.toString("utf-8");
      const result = detectXmlFormat(xml);
      invoice = result.invoice;
      format = result.format;
      console.log(`Detected ${format} in ${file}`);
      if (format === "cii") xmlForValidation = xml;
    }
  } catch (err) {
    console.error(`Failed to parse ${file}: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const t = totals(invoice);
  console.log(
    `Invoice ${invoice.number}: ${invoice.seller.name} -> ${invoice.buyer.name}, ` +
    `${(t.due / 100).toFixed(2)} ${invoice.currency} due${invoice.dueDate ? ` by ${invoice.dueDate}` : ""}.`,
  );

  if (format === "cii" && xmlForValidation) {
    const report = await validate(xmlForValidation, country ? { country } : {});
    const failures = report.results.filter((r) => r.severity === "error" || r.severity === "fatal");
    console.log(`Validation: ${report.valid ? "VALID" : "INVALID"} — ${report.firedCount} rules checked, ${failures.length} failed.`);
    if (!report.valid) process.exitCode = 1;
  } else {
    console.log("Validation: skipped (Schematron validation only covers the CII syntax today; see the project's own tracker).");
  }

  if (csv) {
    await writeFile(csv, exportInvoicesToCsv([invoice]));
    console.log(`Wrote ${csv}`);
  }
  if (accounting) {
    await writeFile(accounting, exportInvoicesToAccountingJson([invoice]));
    console.log(`Wrote ${accounting}`);
  }
}
