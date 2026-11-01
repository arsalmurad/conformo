import { explainRule } from "@conformo/toolkit";
import { bool, parseArgs, UsageError } from "../args.js";
import { line } from "../io.js";
import type { Io } from "../io.js";

export const EXPLAIN_HELP = `conformo explain: what a validation rule means, why it exists and how to fix it

Usage:
  conformo explain <rule-id> [--json]

Options:
  --json      Print the explanation as JSON
  -h, --help  Show this help

Prints the plain-language explanation (where one exists), the official wording from the publisher and
which rule set defines the rule.

Exit codes: 0 found, 1 unknown rule id, 2 usage error.

Examples:
  conformo explain BR-CO-15
  conformo explain BR-DE-15 --json
`;

export async function explainCommand(argv: string[], io: Io): Promise<number> {
  const a = parseArgs(argv, { json: { type: "boolean" } }, 1);
  if (a.help) { io.out(EXPLAIN_HELP); return 0; }
  const id = a.positionals[0];
  if (!id) throw new UsageError("Missing <rule-id>, e.g. BR-CO-15.");
  const e = explainRule(id);
  if (bool(a, "json")) {
    io.out(`${JSON.stringify(e, null, 2)}\n`);
    return e.found ? 0 : 1;
  }
  if (!e.found) {
    io.err(line(`Unknown rule "${e.ruleId}": it is in no rule set Conformo ships and has no plain-language entry.`));
    return 1;
  }
  io.out(line(e.ruleId));
  if (e.plainLanguage) {
    io.out(line(`  What it means: ${e.plainLanguage.summary}`));
    io.out(line(`  Why:           ${e.plainLanguage.why}`));
    io.out(line(`  How to fix:    ${e.plainLanguage.fix}`));
  } else {
    io.out(line("  (no plain-language explanation written for this rule yet; see the official wording below)"));
  }
  for (const o of e.official) io.out(line(`  Official wording [${o.ruleSet}]: ${o.text}`));
  if (e.official.length) io.out(line(`  Defined in: ${e.official.map((o) => o.ruleSet).join(", ")}`));
  return 0;
}
