import type { PlainLanguageMessage } from "../types.js";
import { en } from "./en.js";
import { syntaxMessage } from "./syntax.js";

/** Locale data lives one file per language beside this one (see en.ts); this
 * is the only place that knows which locale is "current". Only "en" exists
 * today, but a caller asking for "fr" against this function, rather than
 * importing en.ts directly, is what makes adding fr.ts later a one-line
 * change instead of a refactor. */
const locales: Record<string, Record<string, PlainLanguageMessage>> = { en };

/** The French CTC Schematron gives each assertion an id like "BR-FR-01_BT-1"
 * or "BR-FR-32-LEGALID" — the field or context it fired in, appended to the
 * human rule number. We key messages by the rule number alone. */
function baseRuleId(ruleId: string): string {
  return ruleId.split(/[_/]/)[0]!.replace(/-(?:LEGALID|GLOBALID)$/, "");
}

/** The hand-written entry for the rule, else (for the syntax rules CII-DT/SR, UBL-CR/DT/SR) a message built from the
 * rule's family and the official sentence, when the caller passes that sentence. */
export function getPlainLanguageMessage(ruleId: string, locale = "en", officialMessage?: string): PlainLanguageMessage | undefined {
  const table = locales[locale] ?? locales.en!;
  return table[ruleId] ?? table[baseRuleId(ruleId)] ?? syntaxMessage(ruleId, officialMessage);
}
