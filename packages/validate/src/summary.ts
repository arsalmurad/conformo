import type { ValidationResult } from "./types.js";

/**
 * The verdict in numbers, with Conformo's own checks counted apart from the official rule sets. Without that split, a
 * file rejected by a Conformo check (for example XRECHNUNG-ID-UNKNOWN) read as "INVALID, 0 failed".
 */
export interface ResultSummary {
  /** What the official rule sets report: rules that fired, rules that failed (error/fatal), warnings and infos. */
  official: { checked: number; failed: number; advisory: number };
  /** Conformo's own checks that failed: the error-severity notices. */
  conformoErrors: { code: string; message: string }[];
  /** The XML schema check ran and failed. */
  xsdFailed: boolean;
  /** The one-line verdict, worded the same in the CLI, the MCP tool and the API. */
  text: string;
}

export function summarizeResult(r: Pick<ValidationResult, "valid" | "firedCount" | "results" | "xsd" | "notices">): ResultSummary {
  const failed = r.results.filter((x) => x.severity === "error" || x.severity === "fatal").length;
  const advisory = r.results.length - failed;
  const conformoErrors = r.notices.filter((n) => n.severity === "error").map((n) => ({ code: n.code, message: n.message }));
  const xsdFailed = r.xsd.ran && r.xsd.valid === false;
  const extra: string[] = [];
  if (xsdFailed) extra.push("the XML schema check failed");
  if (conformoErrors.length) {
    extra.push(`${conformoErrors.length} Conformo check${conformoErrors.length === 1 ? "" : "s"} failed (${conformoErrors.map((c) => c.code).join(", ")})`);
  }
  const verdict = r.valid ? "VALID" : "INVALID";
  const counts = `${r.firedCount} ${extra.length ? "official rules" : "rules"} checked, ${failed} failed, ${advisory} advisory`;
  return {
    official: { checked: r.firedCount, failed, advisory },
    conformoErrors,
    xsdFailed,
    text: `${verdict} — ${counts}${extra.length ? `; ${extra.join("; ")}` : ""}.`,
  };
}
