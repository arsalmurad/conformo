import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateXML } from "xmllint-wasm";
import type { Profile, Syntax, XsdRunner } from "./types.js";

const xsdDir = fileURLToPath(new URL("../artefacts/xsd/", import.meta.url));

interface SchemaSet { label: string; main: string; dir: string }

function schemaFor(syntax: Syntax, profile: Profile): SchemaSet {
  if (syntax === "ubl-invoice") return { label: "UBL 2.1 Invoice", dir: "ubl-2.1", main: "maindoc/UBL-Invoice-2.1.xsd" };
  if (syntax === "ubl-creditnote") return { label: "UBL 2.1 CreditNote", dir: "ubl-2.1", main: "maindoc/UBL-CreditNote-2.1.xsd" };
  if (profile === "extended") return { label: "Factur-X EXTENDED", dir: "facturx-extended", main: "Factur-X_EXTENDED.xsd" };
  if (profile === "minimum") return { label: "Factur-X MINIMUM", dir: "facturx-minimum", main: "Factur-X_MINIMUM.xsd" };
  if (profile === "basicwl") return { label: "Factur-X BASIC WL", dir: "facturx-basicwl", main: "Factur-X_BASICWL.xsd" };
  return { label: "UN/CEFACT CII D16B", dir: "cii-d16b", main: "CrossIndustryInvoice_100pD16B.xsd" };
}

const loaded = new Map<string, { main: { fileName: string; contents: string }; preload: { fileName: string; contents: string }[] }>();

function load(set: SchemaSet) {
  let hit = loaded.get(set.dir + set.main);
  if (!hit) {
    let files: string[];
    try {
      files = readdirSync(`${xsdDir}${set.dir}`, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".xsd"));
    } catch {
      throw new Error(`Missing XSD artefacts for ${set.label}. Run: npm run schematron:compile`);
    }
    const all = files.map((f) => ({ fileName: `${set.dir}/${f.replaceAll("\\", "/")}`, contents: readFileSync(`${xsdDir}${set.dir}/${f}`, "utf-8") }));
    const main = all.find((f) => f.fileName === `${set.dir}/${set.main}`);
    if (!main) throw new Error(`Missing XSD ${set.main} in ${set.dir}. Run: npm run schematron:compile`);
    hit = { main, preload: all.filter((f) => f !== main) };
    loaded.set(set.dir + set.main, hit);
  }
  return hit;
}

/** XSD validation in Node, via libxml2 compiled to WebAssembly (no native build, same on Windows and Linux). */
export const nodeXsdRunner: XsdRunner = {
  async validate(syntax, profile, xml) {
    const set = schemaFor(syntax, profile);
    const { main, preload } = load(set);
    const r = await validateXML({ xml: [{ fileName: "invoice.xml", contents: xml }], schema: [main], preload });
    return {
      schema: set.label,
      valid: r.valid,
      errors: (r.errors ?? []).map((e) => e.message.split("\n")[0]!.trim()).filter(Boolean).slice(0, 50),
    };
  },
};
