import { getRequirements, SUPPORTED_COUNTRIES } from "@conformo/toolkit";
import { bool, parseArgs, UsageError } from "../args.js";
import { line } from "../io.js";
import type { Io } from "../io.js";

export const REQUIREMENTS_HELP = `conformo requirements: e-invoicing mandates for a country, and what Conformo supports of them

Usage:
  conformo requirements <country> [--json]
  conformo requirements --list

Options:
  --list      List the supported country codes
  --json      Print as JSON
  -h, --help  Show this help

Shows each mandate (scope, issuing vs receiving, dates, thresholds, formats, status), the source URL and
when it was last verified, plus whether Conformo can generate, read and validate each required format.
A format Conformo does not support (e.g. FatturaPA) is stated as such.

Exit codes: 0 ok, 2 usage error or unknown country (the supported ones are listed).

Examples:
  conformo requirements DE
  conformo requirements IT --json
  conformo requirements --list
`;

const DIRECTION: Record<string, string> = { send: "issuing", receive: "receiving", both: "issuing and receiving" };
const yn = (b: boolean): string => (b ? "yes" : "no");

export async function requirementsCommand(argv: string[], io: Io): Promise<number> {
  const a = parseArgs(argv, { list: { type: "boolean" }, json: { type: "boolean" } }, 1);
  if (a.help) { io.out(REQUIREMENTS_HELP); return 0; }
  const json = bool(a, "json");

  if (bool(a, "list")) {
    if (a.positionals.length) throw new UsageError("--list takes no country.");
    io.out(json ? `${JSON.stringify(SUPPORTED_COUNTRIES, null, 2)}\n` : line(SUPPORTED_COUNTRIES.join("\n")));
    return 0;
  }
  const code = a.positionals[0];
  if (!code) throw new UsageError(`Missing <country>. Supported: ${SUPPORTED_COUNTRIES.join(", ")}.`);
  const r = getRequirements(code);
  if (!r) throw new UsageError(`Unknown country "${code}". Supported: ${SUPPORTED_COUNTRIES.join(", ")}.`);
  if (json) { io.out(`${JSON.stringify(r, null, 2)}\n`); return 0; }

  io.out(line(`${r.name} (${r.country})${r.status === "unverified" ? " — UNVERIFIED: do not base a compliance decision on this" : ""}`));
  for (const m of r.mandates) {
    io.out(line(`\n${m.scope} — ${m.status}${m.direction ? `, ${DIRECTION[m.direction] ?? m.direction}` : ""}${m.effectiveDate ? `, from ${m.effectiveDate}` : ""}`));
    if (m.thresholdNote) io.out(line(`  Threshold/phasing: ${m.thresholdNote}`));
    io.out(line(`  Required formats: ${m.requiredFormats.join(", ") || "(none named)"}`));
    if (m.platform) io.out(line(`  Platform: ${m.platform}`));
    if (m.notes) io.out(line(`  Notes: ${m.notes}`));
    if (m.sourceUrl) io.out(line(`  Source: ${m.sourceUrl}${m.lastVerified ? ` (verified ${m.lastVerified})` : ""}`));
  }
  if (r.extraFieldsBeyondEN16931?.length) {
    io.out(line("\nExtra fields beyond EN 16931:"));
    for (const f of r.extraFieldsBeyondEN16931) io.out(line(`  - ${f}`));
  }
  if (r.ruleSetVersion) io.out(line(`\nRule set: ${r.ruleSetVersion}`));
  io.out(line("\nWhat Conformo supports:"));
  for (const [fmt, s] of Object.entries(r.conformoSupport)) {
    io.out(line(`  ${fmt}: generate ${yn(s.generate)}, read ${yn(s.read)}, validate ${yn(s.validate)} — ${s.note}`));
  }
  io.out(line(`\nSource: ${r.sourceUrl} (last verified ${r.lastVerified})`));
  return 0;
}
