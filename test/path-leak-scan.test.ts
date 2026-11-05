import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
// @ts-expect-error plain .mjs helper shared with tools/pack-smoke.mjs
import { scanContent } from "../tools/path-leak-scan.mjs";

const scan = (name: string, text: string | Buffer, allow: string[] = []): string[] =>
  scanContent(name, Buffer.isBuffer(text) ? text : Buffer.from(text), allow);

describe("path-leak scan (what must never ship in a package or a site)", () => {
  it("flags absolute local paths and build-machine names", () => {
    expect(scan("a.json", '"baseUri":"file://C:/Users/Someone/code/x"').length).toBeGreaterThan(0);
    expect(scan("a.json", "C:\\Users\\Someone\\code").length).toBeGreaterThan(0);
    expect(scan("a.json", "/home/runner/work/x").length).toBeGreaterThan(0);
    expect(scan("a.json", "/tmp/build-1234/rel").length).toBeGreaterThan(0);
    expect(scan("a.json", "...\\AppData\\Local\\Temp\\x").length).toBeGreaterThan(0);
    expect(scan("a.json", "work in the scratchpad folder").length).toBeGreaterThan(0);
    expect(scan("a.json", "C--Users-ME-claude-session").length).toBeGreaterThan(0);
  });

  it("looks inside gzip content, which is how the compiled rule sets ship", () => {
    const hit = scan("rules.sef.json.gz", gzipSync(Buffer.from('{"baseUri":"file://C:/Users/Someone/x"}')));
    expect(hit.some((f) => f.includes("!gunzip"))).toBe(true);
  });

  it("does not flag URLs, the pinned public base URI or ordinary text", () => {
    expect(scan("a.json", '{"baseUri":"https://conformo.invalid/rulesets/xrechnung-cii.xsl"}')).toEqual([]);
    expect(scan("a.md", "See http://example.org/ and https://github.com/arsalmurad/conformo/blob/main/docs/X.md")).toEqual([]);
    expect(scan("a.md", "The template/ folder and an attempt to read it")).toEqual([]);
  });

  it("an allowlisted label is excused for that pattern only", () => {
    expect(scan("README.md", "Add it to Claude Desktop", ["claude"])).toEqual([]);
    expect(scan("README.md", "Add it to Claude Desktop, config in C:\\Users\\Someone\\x", ["claude"]).length).toBeGreaterThan(0);
  });

  it("skips fonts and images (random bytes, no paths of ours)", () => {
    expect(scan("fonts/x.ttf", "B:/ random bytes C:/Users/")).toEqual([]);
  });
});
