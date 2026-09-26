#!/usr/bin/env node
import { runValidate } from "./commands/validate.js";
import { runParse } from "./commands/parse.js";

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "validate":
    await runValidate(rest);
    break;
  case "parse":
    await runParse(rest);
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
      "conformo <command> [options]",
      "",
      "Commands:",
      "  validate <file.xml> [--country FR]   Validate a Factur-X/CII invoice against",
      "                                        EN 16931 (and a country layer, if given)",
      "  parse <file.pdf|.xml> [--country FR] [--csv out.csv] [--accounting out.json]",
      "                                        Parse a Factur-X/ZUGFeRD PDF, CII, UBL or",
      "                                        XRechnung file into an Invoice, checking a",
      "                                        PDF's visible totals against its embedded XML",
      "",
      "More commands (create, convert, render) are planned.",
    ].join("\n"),
  );
}
