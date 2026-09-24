import { readFile } from "node:fs/promises";
import { validate } from "@conformo/validate";
import type { RuleResult } from "@conformo/validate";

const SEVERITY_LABEL: Record<RuleResult["severity"], string> = {
  fatal: "FATAL",
  error: "ERROR",
  warning: "warning",
  info: "info",
};

export async function runValidate(args: string[]): Promise<void> {
  const { file, country } = parseArgs(args);
  if (!file) {
    console.error("Usage: conformo validate <file.xml> [--country FR]");
    process.exitCode = 1;
    return;
  }

  let xml: string;
  try {
    xml = await readFile(file, "utf-8");
  } catch (err) {
    console.error(`Could not read ${file}: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  let result: Awaited<ReturnType<typeof validate>>;
  try {
    result = await validate(xml, country ? { country } : {});
  } catch (err) {
    // e.g. the file isn't CII XML at all — a clear one-line message, not a
    // raw stack trace (this is what "parse" already does for the same class
    // of error; "validate" should behave the same way).
    console.error((err as Error).message);
    process.exitCode = 1;
    return;
  }
  const failures = result.results.filter((r) => r.severity === "error" || r.severity === "fatal");
  const advisory = result.results.filter((r) => r.severity === "warning" || r.severity === "info");

  for (const r of [...failures, ...advisory]) {
    console.log(`\n[${SEVERITY_LABEL[r.severity]}] ${r.ruleId}${r.fields.length ? ` (${r.fields.join(", ")})` : ""}`);
    console.log(`  ${r.message}`);
    if (r.plainLanguage) {
      console.log(`  What it means: ${r.plainLanguage.summary}`);
      console.log(`  Why:           ${r.plainLanguage.why}`);
      console.log(`  How to fix:    ${r.plainLanguage.fix}`);
    }
    if (r.xpath) console.log(`  Location: ${r.xpath}`);
  }

  console.log(
    `\n${result.valid ? "VALID" : "INVALID"} — ${result.firedCount} rules checked, ${failures.length} failed, ${advisory.length} advisory.`,
  );
  process.exitCode = result.valid ? 0 : 1;
}

function parseArgs(args: string[]): { file?: string; country?: "FR" } {
  let file: string | undefined;
  let country: "FR" | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--country") {
      const value = args[++i];
      if (value === "FR") country = value;
      else throw new Error(`Unsupported --country "${value}" (only "FR" is compiled today)`);
    } else if (!file) {
      file = args[i];
    }
  }
  return { file, country };
}
