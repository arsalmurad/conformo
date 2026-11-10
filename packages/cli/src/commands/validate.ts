import { groupHeading, groupResults, validate } from "@conformo/toolkit";
import type { ValidatedDocument } from "@conformo/toolkit";
import { bool, parseArgs, str, UsageError } from "../args.js";
import { line, readInput } from "../io.js";
import type { Io } from "../io.js";

type Severity = ValidatedDocument["results"][number]["severity"];
const SEVERITY_LABEL: Record<Severity, string> = { fatal: "FATAL", error: "ERROR", warning: "warning", info: "info" };

export const VALIDATE_HELP = `conformo validate: check an e-invoice against the rules that apply to it

Usage:
  conformo validate <file.xml|file.pdf|-> [--country FR|DE] [--profile en16931|xrechnung|peppol] [--no-xsd] [--json]

The syntax (CII or UBL) and the profile (BT-24) are detected from the document. A Factur-X/ZUGFeRD PDF has
its embedded XML validated. The output lists exactly which rule sets ran.

Options:
  --country <FR|DE>    Add a country layer (FR: French CTC rules, CII only; DE: German B2B profile check)
  --profile <name>     Force the profile instead of reading it from BT-24: en16931 | xrechnung | peppol
  --no-xsd             Skip XSD validation
  --json               Print the complete result as one JSON document on stdout, and nothing else
  -h, --help           Show this help

Exit codes:
  0  valid
  1  invalid (a rule or the XSD failed)
  2  usage or input error (unreadable file, unsupported document, bad flag)

Examples:
  conformo validate invoice.xml
  conformo validate hybrid.pdf --country DE --json
  cat invoice.xml | conformo validate - --profile xrechnung
`;

export async function validateCommand(argv: string[], io: Io): Promise<number> {
  const a = parseArgs(argv, {
    country: { type: "string" }, profile: { type: "string" }, "no-xsd": { type: "boolean" }, json: { type: "boolean" },
  }, 1);
  if (a.help) { io.out(VALIDATE_HELP); return 0; }
  const file = a.positionals[0];
  if (!file) throw new UsageError("Missing <file.xml|file.pdf> (use - for stdin).");

  const countryRaw = str(a, "country")?.toUpperCase();
  if (countryRaw !== undefined && countryRaw !== "FR" && countryRaw !== "DE") {
    throw new UsageError(`Unsupported --country "${str(a, "country")}". Use FR or DE.`);
  }
  const profile = str(a, "profile");
  if (profile !== undefined && profile !== "en16931" && profile !== "xrechnung" && profile !== "peppol") {
    throw new UsageError(`Unsupported --profile "${profile}". Use en16931, xrechnung or peppol.`);
  }

  const bytes = await readInput(file, io);
  let result: ValidatedDocument;
  try {
    result = await validate(new Uint8Array(bytes), {
      ...(countryRaw ? { country: countryRaw } : {}),
      ...(profile ? { profile } : {}),
      ...(bool(a, "no-xsd") ? { xsd: false } : {}),
    });
  } catch (err) {
    // Not an invoice / not XML / a PDF without embedded XML: a clean one-line message, not a stack trace.
    throw new UsageError((err as Error).message);
  }

  if (bool(a, "json")) {
    io.out(`${JSON.stringify(result, null, 2)}\n`);
    return result.valid ? 0 : 1;
  }

  const failures = result.results.filter((r) => r.severity === "error" || r.severity === "fatal");
  const advisory = result.results.filter((r) => r.severity === "warning" || r.severity === "info");
  const d = result.detected;
  const src = result.origin === "pdf" ? ` (XML embedded in PDF${result.embeddedFilename ? `: ${result.embeddedFilename}` : ""})` : "";
  io.out(line(`Document: ${d.syntax}, profile ${d.profile}${d.customizationId ? `, ${d.customizationId}` : ""}${src}`));
  io.out(line("Rule sets run:"));
  if (result.ruleSets.length === 0) io.out(line("  (none)"));
  for (const rs of result.ruleSets) {
    io.out(line(`  ${rs.id}: ${rs.label} [${rs.source}] — ${rs.fired} rules checked, ${rs.failed} failed, ${rs.advisory} advisory`));
  }
  if (!result.xsd.ran) io.out(line(`XSD: not run${result.xsd.skippedReason ? ` (${result.xsd.skippedReason})` : ""}`));
  else if (result.xsd.valid) io.out(line(`XSD: passed (${result.xsd.schema ?? "schema"})`));
  else {
    io.out(line(`XSD: FAILED (${result.xsd.schema ?? "schema"})`));
    for (const e of result.xsd.errors) io.out(line(`  ${e}`));
  }
  for (const n of result.notices) io.out(line(`Notice [${n.severity}] ${n.code}: ${n.message}`));

  // One block per rule: repeated hits of one rule are grouped ("CII-DT-031, 12 places: ..."). --json keeps one entry per hit.
  for (const g of groupResults([...failures, ...advisory])) {
    const fields = g.fields.length ? ` (${g.fields.join(", ")})` : "";
    io.out(`\n[${SEVERITY_LABEL[g.severity]}] ${g.count > 1 ? groupHeading(g) : g.ruleId}${g.count > 1 ? "" : fields}\n`);
    io.out(line(`  ${g.message}`));
    if (g.plainLanguage) {
      io.out(line(`  What it means: ${g.plainLanguage.summary}`));
      io.out(line(`  Why:           ${g.plainLanguage.why}`));
      io.out(line(`  How to fix:    ${g.plainLanguage.fix}`));
    }
    if (g.count === 1) {
      const p = g.places[0]!;
      if (p.path) io.out(line(`  Where: ${p.path}`));
      if (p.xpath) io.out(line(`  Location: ${p.xpath}`));
    } else {
      io.out(line(`  Fields: ${g.fields.length ? g.fields.join(", ") : "-"}; use --json for the exact location of every place.`));
    }
  }

  io.out(`\n${result.valid ? "VALID" : "INVALID"} — ${result.firedCount} rules checked, ${failures.length} failed, ${advisory.length} advisory.\n`);
  return result.valid ? 0 : 1;
}

/**
 * Legacy console entry point kept for test/cli-validate.test.ts, which pins the older contract (a non-invoice
 * file exits 1 with exactly one console.error line). The real CLI goes through validateCommand and exits 2 there.
 */
export async function runValidate(args: string[]): Promise<void> {
  const io: Io = {
    out: (t) => { console.log(t.replace(/\n$/, "")); },
    err: (t) => { console.error(t.replace(/\n$/, "")); },
    readStdin: async () => Buffer.alloc(0),
  };
  try {
    process.exitCode = await validateCommand(args, io);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    io.err(err.message);
    process.exitCode = 1;
  }
}
