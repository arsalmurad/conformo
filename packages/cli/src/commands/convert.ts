import { writeFile } from "node:fs/promises";
import { convert, FORMAT_IDS } from "@conformo/toolkit";
import type { FormatId } from "@conformo/toolkit";
import { parseArgs, str, UsageError } from "../args.js";
import { line, readInput } from "../io.js";
import type { Io } from "../io.js";

export const CONVERT_HELP = `conformo convert: read any supported invoice (CII, UBL, XRechnung, Factur-X/ZUGFeRD PDF) and write another XML flavour

Usage:
  conformo convert <file.xml|file.pdf|-> --to <format> [-o out.xml]

Options:
  --to <format>        ${FORMAT_IDS.join(" | ")}
  -o, --output <file>  Output file. Without it, the XML goes to stdout.
  -h, --help           Show this help

Fields the target format does not carry are dropped, never invented. Check the result with "conformo validate".

Exit codes: 0 written, 2 usage or input error (unreadable file, unsupported document, bad flag).

Examples:
  conformo convert invoice-cii.xml --to xrechnung-ubl -o invoice-ubl.xml
  conformo convert hybrid.pdf --to ubl > invoice.xml
`;

export async function convertCommand(argv: string[], io: Io): Promise<number> {
  const a = parseArgs(argv, { to: { type: "string" }, output: { type: "string", short: "o" } }, 1);
  if (a.help) { io.out(CONVERT_HELP); return 0; }
  const file = a.positionals[0];
  if (!file) throw new UsageError("Missing <file.xml|file.pdf> (use - for stdin).");
  const to = str(a, "to");
  if (!to) throw new UsageError(`Missing --to (${FORMAT_IDS.join(", ")}).`);
  if (!(FORMAT_IDS as readonly string[]).includes(to)) throw new UsageError(`Unknown format "${to}". Use one of: ${FORMAT_IDS.join(", ")}.`);

  const bytes = await readInput(file, io);
  const r = await convert(new Uint8Array(bytes), to as FormatId);
  for (const w of r.warnings) io.err(line(`warning: ${w}`));
  const out = str(a, "output");
  if (out) {
    await writeFile(out, r.xml);
    io.err(line(`Wrote ${out} (${r.from} -> ${r.format}).`));
  } else {
    io.out(r.xml);
  }
  return 0;
}
