import { UsageError } from "./args.js";
import { convertCommand, CONVERT_HELP } from "./commands/convert.js";
import { createCommand, CREATE_HELP } from "./commands/create.js";
import { explainCommand, EXPLAIN_HELP } from "./commands/explain.js";
import { parseCommand, PARSE_HELP } from "./commands/parse.js";
import { requirementsCommand, REQUIREMENTS_HELP } from "./commands/requirements.js";
import { validateCommand, VALIDATE_HELP } from "./commands/validate.js";
import { line, processIo } from "./io.js";
import type { Io } from "./io.js";
import { cliVersion } from "./version.js";

type Handler = (argv: string[], io: Io) => Promise<number>;

const COMMANDS: Record<string, { run: Handler; help: string }> = {
  create: { run: createCommand, help: CREATE_HELP },
  convert: { run: convertCommand, help: CONVERT_HELP },
  validate: { run: validateCommand, help: VALIDATE_HELP },
  parse: { run: parseCommand, help: PARSE_HELP },
  explain: { run: explainCommand, help: EXPLAIN_HELP },
  requirements: { run: requirementsCommand, help: REQUIREMENTS_HELP },
};

export const USAGE = `conformo <command> [options]

Commands:
  create <invoice.json|->    Write an invoice as XML (6 formats) or a Factur-X/ZUGFeRD PDF/A-3
  convert <file> --to <fmt>  Convert an XML or PDF invoice to another XML format
  validate <file|->          Validate CII, UBL, XRechnung, Peppol or a hybrid PDF; show which rules ran
  parse <file|->             Read an invoice into the EN 16931 model (--json, --csv, --accounting)
  explain <rule-id>          What a rule means, why it exists, how to fix it
  requirements <country>     E-invoicing mandates for a country and what Conformo supports

Options:
  -h, --help                 Show help (also: conformo <command> --help)
  --version                  Print the version

Exit codes: 0 success / valid, 1 invalid or not found, 2 usage or input error.
`;

/** Runs the CLI and returns the exit code. Never calls process.exit, so it is testable in-process. */
export async function main(argv: string[], io: Io = processIo): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === "-h" || command === "--help" || command === "help") {
    io.out(USAGE);
    return 0;
  }
  if (command === "--version" || command === "-v") {
    io.out(line(cliVersion()));
    return 0;
  }
  const entry = Object.prototype.hasOwnProperty.call(COMMANDS, command) ? COMMANDS[command]! : undefined;
  if (!entry) {
    io.err(line(`Unknown command "${command}".`));
    io.err(USAGE);
    return 2;
  }
  try {
    return await entry.run(rest, io);
  } catch (err) {
    if (err instanceof UsageError) {
      io.err(line(`conformo ${command}: ${err.message}`));
      io.err(line(`Run "conformo ${command} --help" for usage.`));
      return 2;
    }
    // Anything else that the toolkit throws for bad input (corrupt PDF, unsupported document) is an input error.
    io.err(line(`conformo ${command}: ${(err as Error).message}`));
    return 2;
  }
}
