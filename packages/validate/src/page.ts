import { createBrowserValidator } from "./browser.js";
import type { SaxonJSLike, ValidateOptions, ValidationResult } from "./types.js";

export type { ValidateOptions, ValidationResult, RuleResult } from "./types.js";

/**
 * For a web page that serves the validator assets as static files under `${baseUrl}validator/`:
 * SaxonJS2.rt.js (loaded with a <script> tag), `<ruleset-id>.sef.json` per rule set, and rulesets.json.
 * Everything is loaded lazily and once, and rule sets are fetched only when a document needs them.
 * `prefetch` rule sets are started immediately so the first validation does not wait for the network.
 */
export function createPageValidator(baseUrl: string, prefetch: string[] = []): (xml: string, o?: ValidateOptions) => Promise<ValidationResult> {
  let saxon: Promise<SaxonJSLike> | undefined;
  const sefs = new Map<string, Promise<string>>();
  let info: Promise<Record<string, { label: string; source: string }>> | undefined;

  const loadSaxon = (): Promise<SaxonJSLike> =>
    (saxon ??= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${baseUrl}validator/SaxonJS2.rt.js`;
      script.onload = () => resolve((window as unknown as { SaxonJS: SaxonJSLike }).SaxonJS);
      script.onerror = () => reject(new Error("failed to load the SaxonJS runtime"));
      document.head.appendChild(script);
    }));

  const loadSef = (id: string): Promise<string> => {
    let p = sefs.get(id);
    if (!p) {
      p = fetch(`${baseUrl}validator/${id}.sef.json`).then((r) => {
        if (!r.ok) throw new Error(`missing compiled rule set ${id}.sef.json (run npm run schematron:compile)`);
        return r.text();
      });
      p.catch(() => sefs.delete(id));
      sefs.set(id, p);
    }
    return p;
  };

  const loadInfo = () =>
    (info ??= fetch(`${baseUrl}validator/rulesets.json`)
      .then((r) => (r.ok ? r.json() : { rulesets: {} }))
      .then((j: { rulesets: Record<string, { label: string; source: string }> }) => j.rulesets)
      .catch(() => ({})));

  void loadSaxon().catch(() => undefined);
  for (const id of prefetch) void loadSef(id).catch(() => undefined);

  let validator: Promise<(xml: string, o?: ValidateOptions) => Promise<ValidationResult>> | undefined;
  return async (xml, options) => {
    validator ??= Promise.all([loadSaxon(), loadInfo()]).then(([saxonJs, i]) =>
      createBrowserValidator({ saxonJs, loadRuleset: loadSef, info: i }));
    return (await validator)(xml, options);
  };
}
