/**
 * Schema for the e-invoicing compliance dataset .
 * This package's entire value is trustworthiness: every fact traces to a
 * `sourceUrl` that must be a tax authority, ministry, or official EU page —
 * never a vendor blog, law firm summary, or encyclopedia. A fact that cannot
 * be sourced that way is recorded with `status: "unverified"` rather than
 * silently presented as fact (CONTRIBUTING.md invariant 6, "Never claim
 * compliance, show it", applies here just as much as to Schematron results).
 *
 * This is a read-only reference dataset, not a rules engine: it does not
 * decide whether a specific invoice complies (that's `@conformo/validate`'s
 * job, against the EN 16931 Schematron and each CIUS layer). It answers the
 * prior question — does this country require e-invoicing, since when, for
 * whom, and in what format — which the Schematron cannot answer on its own.
 */

export type Scope = 'B2G' | 'B2B' | 'B2C';
export type MandateDirection = 'send' | 'receive' | 'both';

/** What a mandate actually requires today, not a marketing label. */
export type MandateStatus =
  | 'mandatory'
  /** Legally adopted, with a future effective date that hasn't arrived yet. */
  | 'planned'
  /** Permitted but not required. */
  | 'voluntary'
  /** A planned mandate whose effective date has been formally postponed at
   * least once — recorded explicitly because real ones have been (Poland's
   * KSeF, most notably): treating a superseded date as current would be
   * exactly the kind of silent inaccuracy this dataset exists to avoid. */
  | 'delayed'
  /** The fact could not be traced to an authoritative source (see module doc). */
  | 'unverified';

/** Format identifiers this project's serializers produce, plus national
 * formats it does not (yet) implement — recorded anyway because the
 * dataset's job is to describe the requirement, not just this codebase's
 * current coverage. */
export type FormatId =
  | 'cii' | 'factur-x' | 'zugferd' | 'xrechnung' | 'ubl-2.1' | 'peppol-bis-3.0'
  | 'fatturapa' | 'ksef-fa' | 'facturae' | 'other';

/** One requirement window: a country can have several (e.g. B2G mandatory
 * since one date, B2B phased in over several dates by business size — use
 * `thresholdNote` for the phasing, not a separate status). Each mandate can
 * cite its own source when it genuinely differs from the country-level one
 * (B2G and B2B rules are frequently published by different bodies). */
export interface Mandate {
  scope: Scope;
  status: MandateStatus;
  direction?: MandateDirection;
  /** ISO yyyy-mm-dd. Omitted when status is 'planned' with no firm date yet,
   * or when status is 'unverified'. */
  effectiveDate?: string;
  /** Free text for a threshold that isn't a single number — most real
   * mandates are phased by business size, not one revenue cutoff, e.g.
   * "large taxpayers from 2026-02-01, all VAT payers from 2026-04-01". */
  thresholdNote?: string;
  requiredFormats: FormatId[];
  /** The platform/network a sender must transmit through, when the mandate
   * is centralized rather than direct exchange (e.g. "Chorus Pro", "SdI",
   * "KSeF"), omitted for a Peppol-style network model. */
  platform?: string;
  notes?: string;
  /** Overrides the country-level `sourceUrl`/`lastVerified` when this one
   * mandate needed a different or additional authoritative source. */
  sourceUrl?: string;
  lastVerified?: string;
}

export interface CountryCompliance {
  /** ISO 3166-1 alpha-2. */
  country: string;
  name: string;
  mandates: Mandate[];
  /** Business terms a receiving system needs beyond the EN 16931 core to be
   * accepted in this country, in plain language (e.g. "Leitweg-ID, a routing
   * identifier German public-sector buyers require, BR-DE-15") — not a
   * BT/BG list; that lives in packages/formats' country-specific modules and
   * packages/validate's CIUS layers. */
  extraFieldsBeyondEN16931?: string[];
  /** The CIUS/rule-set name and version this dataset was checked against,
   * when the country has one (e.g. "XRechnung 3.0", "BR-FR Flux 2"). */
  ruleSetVersion?: string;
  /** The primary source for this row: a tax authority, ministry, or official
   * EU page. Required even when a mandate below also carries its own —
   * redundant on purpose, so reading only the country level still gives one
   * link to check. */
  sourceUrl: string;
  /** ISO yyyy-mm-dd this row was last checked against its source — not when
   * the row was last edited in git, which `git log` already answers. */
  lastVerified: string;
  /** 'unverified' means at least one mandate below could not be traced to an
   * authoritative source and is recorded as a best-effort placeholder. A
   * consumer must not build a compliance decision on an unverified row. */
  status: 'verified' | 'unverified';
}

export interface ComplianceDataset {
  /** Bumped on any breaking shape change — this dataset is published
   * standalone , so a consumer pinning to a
   * version needs a way to detect an incompatible shape. */
  schemaVersion: 1;
  generatedAt: string;
  countries: CountryCompliance[];
}
