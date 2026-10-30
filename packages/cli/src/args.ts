/** Tiny hand-written argument parser: no dependency, precise errors. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export interface FlagSpec {
  /** "boolean" flags take no value; "string" flags take exactly one. */
  type: "boolean" | "string";
  /** Single-dash alias, e.g. "o" for -o. */
  short?: string;
}

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
  /** True when -h/--help was present (checked before anything else is validated). */
  help: boolean;
}

/**
 * `-` alone is a positional (stdin). `--name=value` and `--name value` both work. A string flag's value may not
 * look like another flag, except that a lone `-` is accepted as a value.
 */
export function parseArgs(argv: string[], spec: Record<string, FlagSpec>, maxPositionals: number): ParsedArgs {
  const shorts = new Map<string, string>();
  for (const [name, s] of Object.entries(spec)) if (s.short) shorts.set(s.short, name);
  const out: ParsedArgs = { positionals: [], flags: {}, help: false };
  let onlyPositionals = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (onlyPositionals || arg === "-" || !arg.startsWith("-")) {
      out.positionals.push(arg);
      continue;
    }
    if (arg === "--") { onlyPositionals = true; continue; }
    if (arg === "-h" || arg === "--help") { out.help = true; continue; }

    let name: string | undefined;
    let inline: string | undefined;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      if (eq !== -1) inline = arg.slice(eq + 1);
      if (!(name in spec)) throw new UsageError(`Unknown option "--${name}".`);
    } else {
      name = shorts.get(arg.slice(1));
      if (!name) throw new UsageError(`Unknown option "${arg}".`);
    }
    const flag = spec[name]!;
    if (flag.type === "boolean") {
      if (inline !== undefined) throw new UsageError(`Option "--${name}" does not take a value.`);
      out.flags[name] = true;
    } else {
      let value = inline;
      if (value === undefined) {
        const next = argv[i + 1];
        if (next === undefined || (next.startsWith("-") && next !== "-")) {
          throw new UsageError(`Option "--${name}" needs a value.`);
        }
        value = next;
        i++;
      }
      out.flags[name] = value;
    }
  }
  if (out.positionals.length > maxPositionals) {
    throw new UsageError(`Unexpected argument "${out.positionals[maxPositionals]}".`);
  }
  return out;
}

export function str(a: ParsedArgs, name: string): string | undefined {
  const v = a.flags[name];
  return typeof v === "string" ? v : undefined;
}

export function bool(a: ParsedArgs, name: string): boolean {
  return a.flags[name] === true;
}
