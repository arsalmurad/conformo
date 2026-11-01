import { readFileSync } from "node:fs";

/** Read from package.json (works from src/ and from the published dist/src/). Never hardcoded. */
export function cliVersion(): string {
  for (const rel of ["../package.json", "../../package.json"]) {
    try {
      const pkg = JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf-8")) as { name?: string; version?: string };
      if (pkg.name === "@conformo/cli" && pkg.version) return pkg.version;
    } catch { /* try next */ }
  }
  return "unknown";
}
