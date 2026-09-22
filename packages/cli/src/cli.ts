#!/usr/bin/env node
import { runValidate } from "./commands/validate.js";

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "validate":
    await runValidate(rest);
    break;
  case undefined:
  case "-h":
  case "--help":
    printUsage();
    break;
  default:
    console.error(`Unknown command "${command}".\n`);
    printUsage();
    process.exit(1);
}

function printUsage(): void {
  console.log(
    [
      "invoice-engine <command> [options]",
      "",
      "Commands:",
      "  validate <file.xml> [--country FR]   Validate a Factur-X/CII invoice against",
      "                                        EN 16931 (and a country layer, if given)",
      "",
      "More commands (create, convert, render) land in later phases — see the project's own tracker.",
    ].join("\n"),
  );
}
