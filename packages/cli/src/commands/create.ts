import { writeFile } from "node:fs/promises";
import { createPdf, createXml, FORMAT_IDS, InvoiceInputError, PDF_PROFILES } from "@conformo/toolkit";
import type { FormatId } from "@conformo/toolkit";
import { bool, parseArgs, str, UsageError } from "../args.js";
import { line, readInput } from "../io.js";
import type { Io } from "../io.js";

const TEMPLATES = ["classic", "modern", "compact"] as const;

export const CREATE_HELP = `conformo create: write an invoice (JSON) as e-invoice XML or a Factur-X/ZUGFeRD PDF/A-3

Usage:
  conformo create <invoice.json|-> --format <format> [-o out.xml]
  conformo create <invoice.json|-> --pdf [--profile <profile>] [--template <template>] -o out.pdf

Options:
  --format <format>    ${FORMAT_IDS.join(" | ")}
  --pdf                Create a hybrid PDF/A-3 with the XML embedded (requires -o)
  --profile <profile>  PDF only: ${PDF_PROFILES.join(" | ")} (default en16931)
  --template <name>    PDF only: ${TEMPLATES.join(" | ")} (default classic)
  -o, --output <file>  Output file. Without it, XML goes to stdout.
  -h, --help           Show this help

"-" reads the invoice JSON from stdin. Money fields are integer minor units.

Exit codes: 0 written, 2 usage or input error (including an invoice that cannot be written; every
problem is printed as "path [BT-x]: message" on stderr).

Examples:
  conformo create fixtures/xrechnung-public-sector.json --format xrechnung-cii -o invoice.xml
  conformo create invoice.json --pdf --profile xrechnung --template modern -o invoice.pdf
  cat invoice.json | conformo create - --format ubl > invoice.xml
`;

export async function createCommand(argv: string[], io: Io): Promise<number> {
  const a = parseArgs(argv, {
    format: { type: "string" }, pdf: { type: "boolean" }, profile: { type: "string" },
    template: { type: "string" }, output: { type: "string", short: "o" },
  }, 1);
  if (a.help) { io.out(CREATE_HELP); return 0; }

  const file = a.positionals[0];
  if (!file) throw new UsageError("Missing <invoice.json> (use - for stdin).");
  const format = str(a, "format");
  const pdf = bool(a, "pdf");
  const out = str(a, "output");
  if (pdf && format) throw new UsageError("--pdf and --format cannot be combined; --pdf writes a PDF with its own embedded XML (choose it with --profile).");
  if (!pdf && !format) throw new UsageError(`Missing --format (${FORMAT_IDS.join(", ")}) or --pdf.`);
  if (!pdf && (str(a, "profile") || str(a, "template"))) throw new UsageError("--profile and --template only apply with --pdf.");
  if (format && !(FORMAT_IDS as readonly string[]).includes(format)) {
    throw new UsageError(`Unknown format "${format}". Use one of: ${FORMAT_IDS.join(", ")}.`);
  }
  const profile = str(a, "profile");
  if (profile && !(PDF_PROFILES as readonly string[]).includes(profile)) {
    throw new UsageError(`Unknown profile "${profile}". Use one of: ${PDF_PROFILES.join(", ")}.`);
  }
  const template = str(a, "template");
  if (template && !(TEMPLATES as readonly string[]).includes(template)) {
    throw new UsageError(`Unknown template "${template}". Use one of: ${TEMPLATES.join(", ")}.`);
  }
  if (pdf && !out) throw new UsageError("--pdf needs -o <out.pdf>: a PDF is not written to stdout.");

  const raw = (await readInput(file, io)).toString("utf-8");
  let invoice: unknown;
  try {
    invoice = JSON.parse(raw);
  } catch (err) {
    throw new UsageError(`${file === "-" ? "stdin" : file} is not valid JSON: ${(err as Error).message}`);
  }

  try {
    if (pdf) {
      const r = await createPdf(invoice as Parameters<typeof createPdf>[0], {
        ...(profile ? { profile: profile as (typeof PDF_PROFILES)[number] } : {}),
        ...(template ? { template: template as (typeof TEMPLATES)[number] } : {}),
      });
      await writeFile(out!, r.pdf);
      io.err(line(`Wrote ${out} (PDF/A-3b, embedded ${r.xmlFilename}, profile ${r.profile}, ${r.conformanceLevel}). Run "conformo validate ${out}" to check it.`));
    } else {
      const r = createXml(invoice as Parameters<typeof createXml>[0], format as FormatId);
      for (const w of r.warnings) io.err(line(`warning: ${w}`));
      if (out) {
        await writeFile(out, r.xml);
        io.err(line(`Wrote ${out} (${r.format}). Run "conformo validate ${out}" to check it.`));
      } else {
        io.out(r.xml);
      }
    }
  } catch (err) {
    if (err instanceof InvoiceInputError) {
      for (const i of err.issues) io.err(line(`${i.path || "(invoice)"}${i.bt ? ` [${i.bt}]` : ""}: ${i.message}`));
      return 2;
    }
    throw err;
  }
  return 0;
}
