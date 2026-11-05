import { detectDocument } from "./detect.js";
import { parseSvrl } from "./svrl.js";
import { getPlainLanguageMessage } from "./messages/index.js";
import { describeLocation } from "./location.js";
import type {
  CompiledSchematron, DetectedDocument, Notice, Profile, RuleResult, RuleSetRun, RulesetLoader,
  SaxonJSLike, Syntax, ValidateOptions, ValidationResult, XsdRun, XsdRunner,
} from "./types.js";

/** Display metadata for each rule set. Versions come from rulesets.json at build time (see
 * tools/build-rulesets.mjs); this is only the fallback label when that file is not available. */
export interface RulesetInfo { label: string; source: string }

/** Which rule sets apply to a document. Exactly this list is run, and reported back, in order. */
export function planRulesets(syntax: Syntax, profile: Profile, country?: "FR" | "DE"): string[] {
  if (syntax === "ksef-fa3") return [];   // no business-rule set is published for FA(3); KSeF applies its own on submission
  const ubl = syntax !== "cii";
  const base = ubl ? "en16931-ubl" : "en16931-cii";
  const plan: string[] = [];
  // MINIMUM and BASIC WL are not EN 16931 invoices; EXTENDED is a superset the EN 16931 rules were not written for.
  if (profile !== "minimum" && profile !== "basicwl" && profile !== "extended") plan.push(base);
  if (profile === "xrechnung") plan.push(ubl ? "xrechnung-ubl" : "xrechnung-cii");
  if (profile === "peppol" && ubl) plan.push("peppol-ubl");
  if (country === "FR" && !ubl) plan.push("fr-ctc");
  return plan;
}

export interface EngineDeps {
  saxon: SaxonJSLike;
  loadRuleset: RulesetLoader;
  /** Absent => XSD is reported as "not run" with the reason. */
  xsd?: XsdRunner;
  /** Why `xsd` is absent, for the report. */
  xsdUnavailableReason?: string;
  info?: Record<string, RulesetInfo>;
  /** Publisher severity re-levelling per "<syntax>:<variant>" (KoSIT scenarios.xml customLevel), from rulesets.json. */
  levelOverrides?: Record<string, Record<string, string>>;
}

const FALLBACK_INFO: Record<string, RulesetInfo> = {
  "en16931-cii": { label: "EN 16931 (CII)", source: "CEN eInvoicing-EN16931" },
  "en16931-ubl": { label: "EN 16931 (UBL)", source: "CEN eInvoicing-EN16931" },
  "xrechnung-cii": { label: "XRechnung 3.0 CIUS (CII)", source: "KoSIT" },
  "xrechnung-ubl": { label: "XRechnung 3.0 CIUS (UBL)", source: "KoSIT" },
  "peppol-ubl": { label: "Peppol BIS Billing 3.0 (UBL)", source: "OpenPEPPOL" },
  "fr-ctc": { label: "French CTC BR-FR Flux 2 (CII)", source: "FNFE-MPE" },
};

const asText = (sef: CompiledSchematron | string): string => (typeof sef === "string" ? sef : JSON.stringify(sef));

/** One validator, any platform: give it SaxonJS and a way to load compiled rule sets. */
export function createEngine(deps: EngineDeps) {
  const texts = new Map<string, Promise<string>>();
  const info = { ...FALLBACK_INFO, ...deps.info };

  const sefText = (id: string): Promise<string> => {
    let p = texts.get(id);
    if (!p) {
      p = deps.loadRuleset(id).then(asText);
      p.catch(() => texts.delete(id)); // do not cache a failed load
      texts.set(id, p);
    }
    return p;
  };

  async function runRuleset(id: string, xml: string): Promise<{ run: RuleSetRun; results: RuleResult[] }> {
    const stylesheetText = await sefText(id);
    const { principalResult } = await deps.saxon.transform({ stylesheetText, sourceText: xml, destination: "serialized" }, "async");
    const { results, firedCount } = parseSvrl(principalResult);
    for (const r of results) {
      r.ruleSet = id;
      const pl = getPlainLanguageMessage(r.ruleId, "en", r.message);
      if (pl) r.plainLanguage = pl;
      const place = describeLocation(r.xpath);
      if (place) {
        r.element = place.element;
        r.path = place.path;
        if (place.line !== undefined) r.line = place.line;
        if (r.fields.length === 0) r.fields = place.fields;
      }
    }
    const failed = results.filter((r) => r.severity === "error" || r.severity === "fatal").length;
    const meta = info[id] ?? { label: id, source: "" };
    return { run: { id, label: meta.label, source: meta.source, fired: firedCount, failed, advisory: results.length - failed }, results };
  }

  async function validate(xml: string, options: ValidateOptions = {}): Promise<ValidationResult> {
    const detected: DetectedDocument = detectDocument(xml);
    const profile: Profile = options.profile ?? detected.profile;
    const notices: Notice[] = [];

    if (detected.syntax === "ksef-fa3") {
      notices.push({
        severity: "info", code: "KSEF-SCHEMA-ONLY",
        message: "Polish KSeF FA(3): only the Ministry of Finance XSD was checked. KSeF applies further business rules when an invoice is submitted; Conformo does not submit and cannot predict them.",
      });
    } else if (detected.profile === "unknown") {
      notices.push({
        severity: "warning", code: "PROFILE-UNKNOWN",
        message: detected.customizationId
          ? `BT-24 "${detected.customizationId}" is not a profile Conformo recognises; only the plain EN 16931 rules were applied.`
          : "BT-24 (specification identifier) is missing; only the plain EN 16931 rules were applied.",
      });
    }
    if (profile === "minimum" || profile === "basicwl") {
      notices.push({
        severity: options.country === "DE" ? "error" : "warning", code: "NOT-EN16931",
        message: `The ${profile === "minimum" ? "MINIMUM" : "BASIC WL"} profile is not an EN 16931 invoice. ` +
          "It is not accepted as an e-invoice for German B2B (from 2027) and no EN 16931 rules were run.",
      });
    }
    if (profile === "extended") {
      notices.push({
        severity: "warning", code: "EXTENDED-NOT-CHECKED",
        message: "The EXTENDED profile is a superset of EN 16931. Only its XSD was checked, not the EN 16931 business rules.",
      });
    }

    const plan = planRulesets(detected.syntax, profile === "unknown" ? "en16931" : profile, options.country);
    if (options.country === "FR" && detected.syntax !== "cii") {
      notices.push({ severity: "warning", code: "FR-CII-ONLY", message: "The French CTC rules are compiled for CII only; they were not run on this UBL document." });
    }

    const runs: RuleSetRun[] = [];
    const results: RuleResult[] = [];
    for (const id of plan) {
      const r = await runRuleset(id, xml);
      runs.push(r.run);
      results.push(...r.results);
    }

    let xsd: XsdRun;
    if (options.xsd === false) xsd = { ran: false, errors: [], skippedReason: "disabled by caller" };
    else if (!deps.xsd) xsd = { ran: false, errors: [], skippedReason: deps.xsdUnavailableReason ?? "no XSD runner on this platform" };
    else {
      const x = await deps.xsd.validate(detected.syntax, profile, xml);
      xsd = { ran: true, schema: x.schema, valid: x.valid, errors: x.errors };
    }

    const table = deps.levelOverrides?.[`${detected.syntax}:${detected.variant ?? "en16931"}`];
    if (table && (profile === "xrechnung" || profile === "en16931")) {
      for (const r of results) {
        const level = table[r.ruleId];
        const next = level === "information" ? "info" : level === "warning" || level === "error" ? level : undefined;
        if (next && next !== r.severity) { r.originalSeverity = r.severity; r.severity = next; }
      }
      for (const run of runs) {
        const own = results.filter((r) => r.ruleSet === run.id);
        run.failed = own.filter((r) => r.severity === "error" || r.severity === "fatal").length;
        run.advisory = own.length - run.failed;
      }
    }

    const failures = results.filter((r) => r.severity === "error" || r.severity === "fatal");
    const valid = failures.length === 0 && xsd.valid !== false && !notices.some((n) => n.severity === "error");
    return {
      valid, firedCount: runs.reduce((s, r) => s + r.fired, 0), results, detected, ruleSets: runs, xsd, notices,
    };
  }

  return { validate };
}
