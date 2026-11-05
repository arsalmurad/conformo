import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { main } from '../packages/cli/src/main.js';
import type { Io } from '../packages/cli/src/io.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const fx = (name: string): string => path.join(root, 'fixtures', name);
const cliEntry = path.join(root, 'packages', 'cli', 'src', 'cli.ts');

let dir: string;
beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), 'conformo-cli-cmd-')); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

interface Run { code: number; out: string; err: string }

async function run(argv: string[], stdin = ''): Promise<Run> {
  let out = '';
  let err = '';
  const io: Io = {
    out: (t) => { out += t; },
    err: (t) => { err += t; },
    readStdin: async () => Buffer.from(stdin, 'utf-8'),
  };
  const code = await main(argv, io);
  return { code, out, err };
}

function child(argv: string[], input?: string): Run {
  const r = spawnSync(process.execPath, ['--import', 'tsx', cliEntry, ...argv], {
    cwd: root, encoding: 'utf-8', input, timeout: 120_000,
  });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
}

const XML_FORMATS = ['cii', 'cii-extended', 'ubl', 'xrechnung-cii', 'xrechnung-ubl', 'peppol-ubl'] as const;

describe('conformo create -> validate round trip', () => {
  for (const format of XML_FORMATS) {
    const input = format === 'peppol-ubl' ? fx('peppol-belgium-full.json') : fx('xrechnung-public-sector.json');
    it(`${format} validates with exit 0`, async () => {
      const out = path.join(dir, `${format}.xml`);
      const created = await run(['create', input, '--format', format, '-o', out]);
      expect(created.err).not.toMatch(/problem/);
      expect(created.code).toBe(0);
      const v = await run(['validate', out, '--json']);
      const result = JSON.parse(v.out) as { valid: boolean; ruleSets: unknown[]; notices: { code: string }[] };
      expect(result.valid).toBe(true);
      if (format === 'cii-extended') {
        // EXTENDED is a superset of EN 16931: only its XSD runs, and the result says so instead of claiming more.
        expect(result.ruleSets).toHaveLength(0);
        expect(result.notices.map((n) => n.code)).toContain('EXTENDED-NOT-CHECKED');
      } else {
        expect(result.ruleSets.length).toBeGreaterThan(0);
      }
      expect(v.code).toBe(0);
    }, 60_000);
  }

  it('is deterministic: the same invoice yields byte-identical XML', async () => {
    const a = await run(['create', fx('xrechnung-public-sector.json'), '--format', 'xrechnung-ubl']);
    const b = await run(['create', fx('xrechnung-public-sector.json'), '--format', 'xrechnung-ubl']);
    expect(a.out).toBe(b.out);
    expect(a.out.startsWith('<?xml')).toBe(true);
  });

  it('reads the invoice from stdin with "-" and writes XML to stdout', async () => {
    const json = readFileSync(fx('xrechnung-public-sector.json'), 'utf-8');
    const r = await run(['create', '-', '--format', 'ubl'], json);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Invoice');
    const v = await run(['validate', '-'], r.out);
    expect(v.code).toBe(0);
    expect(v.out).toMatch(/^VALID|\nVALID/);
    expect(v.out).toContain('Rule sets run:');
  }, 60_000);
});

describe('conformo create --pdf', () => {
  const cases: Array<[string, string]> = [['en16931', 'factur-x.xml'], ['xrechnung', 'xrechnung.xml'], ['extended', 'factur-x.xml']];
  for (const [profile, xmlName] of cases) {
    it(`profile ${profile} embeds ${xmlName} and validates with exit 0`, async () => {
      const out = path.join(dir, `${profile}.pdf`);
      const created = await run(['create', fx('xrechnung-public-sector.json'), '--pdf', '--profile', profile, '--template', 'compact', '-o', out]);
      expect(created.code).toBe(0);
      expect(readFileSync(out).subarray(0, 5).toString('latin1')).toBe('%PDF-');
      const v = await run(['validate', out, '--json']);
      const result = JSON.parse(v.out) as { valid: boolean; origin: string; embeddedFilename: string };
      expect(result.origin).toBe('pdf');
      expect(result.embeddedFilename).toBe(xmlName);
      expect(result.valid).toBe(true);
      expect(v.code).toBe(0);
    }, 120_000);
  }

  it('requires -o', async () => {
    const r = await run(['create', fx('xrechnung-public-sector.json'), '--pdf']);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/-o/);
  });

  it('--language de prints German labels and the PDF still validates', async () => {
    const out = path.join(dir, 'rechnung.pdf');
    const created = await run(['create', fx('xrechnung-public-sector.json'), '--pdf', '--profile', 'xrechnung', '--language', 'de', '-o', out]);
    expect(created.code).toBe(0);
    const v = await run(['validate', out, '--json']);
    expect((JSON.parse(v.out) as { valid: boolean }).valid).toBe(true);
    const parsed = await run(['parse', out, '--json']);
    expect(parsed.code).toBe(0);
  }, 120_000);

  it('rejects an unknown --language and --language without --pdf', async () => {
    const bad = await run(['create', fx('xrechnung-public-sector.json'), '--pdf', '--language', 'it', '-o', path.join(dir, 'x.pdf')]);
    expect(bad.code).toBe(2);
    expect(bad.err).toMatch(/Unknown language "it"/);
    const xml = await run(['create', fx('xrechnung-public-sector.json'), '--format', 'cii', '--language', 'de']);
    expect(xml.code).toBe(2);
    expect(xml.err).toMatch(/only apply with --pdf/);
  });
});

describe('conformo validate', () => {
  it('exits 1 on the broken invoice and --json is parseable with valid:false', async () => {
    const r = await run(['validate', fx('negative/broken-invoice.xml'), '--json']);
    expect(r.code).toBe(1);
    const result = JSON.parse(r.out) as { valid: boolean; results: unknown[] };
    expect(result.valid).toBe(false);
    expect(result.results.length).toBeGreaterThan(0);
  }, 60_000);

  it('human output lists rule sets, XSD and failures with plain-language text', async () => {
    const r = await run(['validate', fx('negative/broken-invoice.xml')]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Rule sets run:');
    expect(r.out).toMatch(/XSD:/);
    expect(r.out).toMatch(/\[(ERROR|FATAL)\] BR-/);
    expect(r.out).toContain('INVALID');
  }, 60_000);

  it('--no-xsd skips XSD', async () => {
    const r = await run(['validate', fx('negative/broken-invoice.xml'), '--no-xsd', '--json']);
    expect((JSON.parse(r.out) as { xsd: { ran: boolean } }).xsd.ran).toBe(false);
  }, 60_000);

  it('exit 2: missing file, non-invoice, bad flag, bad country, missing value, no argument', async () => {
    expect((await run(['validate', path.join(dir, 'nope.xml')])).code).toBe(2);
    const junk = path.join(dir, 'junk.xml');
    writeFileSync(junk, '<hello/>');
    const j = await run(['validate', junk]);
    expect(j.code).toBe(2);
    expect(j.err).not.toMatch(/\n\s+at /);
    const flag = await run(['validate', junk, '--bogus']);
    expect(flag.code).toBe(2);
    expect(flag.err).toContain('Unknown option "--bogus"');
    expect((await run(['validate', junk, '--country', 'XX'])).code).toBe(2);
    const missing = await run(['validate', junk, '--country']);
    expect(missing.code).toBe(2);
    expect(missing.err).toContain('needs a value');
    expect((await run(['validate'])).code).toBe(2);
  });
});

describe('conformo create input errors', () => {
  it('prints every issue as "path [BT-x]: message" to stderr and exits 2', async () => {
    const bad = path.join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ number: '' }));
    const r = await run(['create', bad, '--format', 'cii']);
    expect(r.code).toBe(2);
    expect(r.out).toBe('');
    const lines = r.err.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.some((l) => /^\S+ \[BT-\d+\]: /.test(l))).toBe(true);
  });

  it('exits 2 for invalid JSON, unknown format, missing format, --pdf with --format', async () => {
    const bad = path.join(dir, 'notjson.json');
    writeFileSync(bad, '{nope');
    expect((await run(['create', bad, '--format', 'cii'])).code).toBe(2);
    expect((await run(['create', fx('sample-invoice.json'), '--format', 'fatturapa'])).code).toBe(2);
    expect((await run(['create', fx('sample-invoice.json')])).code).toBe(2);
    expect((await run(['create', fx('sample-invoice.json'), '--pdf', '--format', 'cii', '-o', 'x.pdf'])).code).toBe(2);
  });
});

describe('conformo convert', () => {
  it('CII -> UBL -> validates; PDF input works too', async () => {
    const cii = path.join(dir, 'conv-src.xml');
    await run(['create', fx('xrechnung-public-sector.json'), '--format', 'cii', '-o', cii]);
    const out = path.join(dir, 'conv-out.xml');
    const r = await run(['convert', cii, '--to', 'ubl', '-o', out]);
    expect(r.code).toBe(0);
    expect(readFileSync(out, 'utf-8')).toContain('<Invoice');
    expect((await run(['validate', out])).code).toBe(0);
    const pdf = path.join(dir, 'en16931.pdf');
    await run(['create', fx('xrechnung-public-sector.json'), '--pdf', '-o', pdf]);
    const fromPdf = await run(['convert', pdf, '--to', 'xrechnung-cii']);
    expect(fromPdf.code).toBe(0);
    expect(fromPdf.out).toContain('CrossIndustryInvoice');
  }, 120_000);

  it('exits 2 without --to, with a bad target, or for a missing file', async () => {
    expect((await run(['convert', fx('sample-invoice.json')])).code).toBe(2);
    expect((await run(['convert', fx('sample-invoice.json'), '--to', 'nope'])).code).toBe(2);
    expect((await run(['convert', path.join(dir, 'missing.xml'), '--to', 'ubl'])).code).toBe(2);
  });
});

describe('conformo parse', () => {
  it('--json prints the Invoice and nothing else on stdout', async () => {
    const cii = path.join(dir, 'parse-src.xml');
    await run(['create', fx('xrechnung-public-sector.json'), '--format', 'cii', '-o', cii]);
    const r = await run(['parse', cii, '--json']);
    expect(r.code).toBe(0);
    const inv = JSON.parse(r.out) as { number: string; seller: { name: string } };
    expect(inv.number).toBeTruthy();
    expect(inv.seller.name).toBeTruthy();
  });

  it('human output, --csv and --accounting still work', async () => {
    const cii = path.join(dir, 'parse-src.xml');
    const csv = path.join(dir, 'p.csv');
    const acc = path.join(dir, 'p.json');
    const r = await run(['parse', cii, '--csv', csv, '--accounting', acc]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Detected cii');
    expect(readFileSync(csv, 'utf-8').length).toBeGreaterThan(0);
    expect(() => JSON.parse(readFileSync(acc, 'utf-8'))).not.toThrow();
  });

  it('exits 2 for an unreadable or unparseable file', async () => {
    expect((await run(['parse', path.join(dir, 'missing.xml')])).code).toBe(2);
    const junk = path.join(dir, 'junk2.xml');
    writeFileSync(junk, '<hello/>');
    expect((await run(['parse', junk])).code).toBe(2);
  });
});

describe('conformo explain', () => {
  it('explains a known rule in plain language with the official wording and rule set', async () => {
    const r = await run(['explain', 'BR-CO-15']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('What it means:');
    expect(r.out).toContain('Official wording');
    expect(r.out).toContain('Defined in:');
    const j = JSON.parse((await run(['explain', 'BR-CO-15', '--json'])).out) as { found: boolean; official: unknown[] };
    expect(j.found).toBe(true);
    expect(j.official.length).toBeGreaterThan(0);
  });

  it('unknown rule id exits 1 with a message', async () => {
    const r = await run(['explain', 'BR-NOPE-999']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('Unknown rule');
  });
});

describe('conformo requirements', () => {
  it('DE shows mandates, source and Conformo support', async () => {
    const r = await run(['requirements', 'de']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Germany');
    expect(r.out).toContain('What Conformo supports:');
    expect(r.out).toMatch(/Source: https?:\/\//);
    expect(r.out).toMatch(/xrechnung: generate yes, read yes, validate yes/);
  });

  it('IT says FatturaPA is not supported', async () => {
    const r = await run(['requirements', 'IT']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/fatturapa: generate no, read no, validate no/);
    expect(r.out).toContain('Not supported');
    const j = JSON.parse((await run(['requirements', 'IT', '--json'])).out) as { conformoSupport: Record<string, { generate: boolean }> };
    expect(j.conformoSupport.fatturapa?.generate).toBe(false);
  });

  it('--list lists countries; an unknown country exits 2 and lists the supported ones', async () => {
    const list = await run(['requirements', '--list']);
    expect(list.code).toBe(0);
    expect(list.out.split('\n')).toContain('DE');
    const bad = await run(['requirements', 'ZZ']);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain('Supported:');
    expect(bad.err).toContain('DE');
  });
});

describe('help, version, unknown command', () => {
  it('top-level help no longer says commands are planned', async () => {
    const r = await run(['--help']);
    expect(r.code).toBe(0);
    expect(r.out).not.toMatch(/planned/i);
    for (const c of ['create', 'convert', 'validate', 'parse', 'explain', 'requirements']) expect(r.out).toContain(c);
  });

  it('every command has --help with examples and exit codes where relevant', async () => {
    for (const c of ['create', 'convert', 'validate', 'parse', 'explain', 'requirements']) {
      const r = await run([c, '--help']);
      expect(r.code).toBe(0);
      expect(r.out).toContain('Examples:');
      expect(r.out).toContain(`conformo ${c}`);
    }
    expect((await run(['validate', '-h'])).out).toMatch(/0 {2}valid[\s\S]*1 {2}invalid[\s\S]*2 {2}usage/);
  });

  it('--version prints the package.json version', async () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'packages/cli/package.json'), 'utf-8')) as { version: string };
    const r = await run(['--version']);
    expect(r.out.trim()).toBe(pkg.version);
  });

  it('unknown command exits 2', async () => {
    const r = await run(['frobnicate']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('Unknown command "frobnicate"');
  });
});

// One real child process per command: proves the bin entry, stdout/stderr split and exit codes end to end.
describe('child-process smoke (real CLI)', () => {
  it('create + validate + convert + parse + explain + requirements + version', () => {
    const xml = path.join(dir, 'smoke.xml');
    const c = child(['create', fx('xrechnung-public-sector.json'), '--format', 'xrechnung-cii', '-o', xml]);
    expect(c.code).toBe(0);

    const v = child(['validate', xml]);
    expect(v.code).toBe(0);
    expect(v.out).toContain('VALID');

    const vj = child(['validate', fx('negative/broken-invoice.xml'), '--json']);
    expect(vj.code).toBe(1);
    expect((JSON.parse(vj.out) as { valid: boolean }).valid).toBe(false);

    const cv = child(['convert', xml, '--to', 'xrechnung-ubl']);
    expect(cv.code).toBe(0);
    expect(cv.out).toContain('<Invoice');

    const p = child(['parse', xml, '--json']);
    expect(p.code).toBe(0);
    expect(() => JSON.parse(p.out)).not.toThrow();

    expect(child(['explain', 'BR-CO-15']).code).toBe(0);
    expect(child(['requirements', 'IT']).out).toContain('fatturapa');
    expect(child(['--version']).out.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(child(['nonsense']).code).toBe(2);
  }, 180_000);

  it('stdin "-" works through a real pipe', () => {
    const json = readFileSync(fx('xrechnung-public-sector.json'), 'utf-8');
    const r = child(['create', '-', '--format', 'cii'], json);
    expect(r.code).toBe(0);
    const v = child(['validate', '-'], r.out);
    expect(v.code).toBe(0);
  }, 120_000);
});


describe('conformo validate: repeated hits of one rule are grouped in the text, not in --json', () => {
  const neg = fx('negative/currency-id-on-amounts.xml');

  it('prints one block for CII-DT-031 with the places, the plain-language text and no raw "- " artefact', async () => {
    const r = await run(['validate', neg]);
    expect(r.code).toBe(1);
    expect(r.out.match(/CII-DT-031/g)!.length).toBe(1);
    expect(r.out).toMatch(/\[FATAL\] CII-DT-031, 15 places: ChargeAmount \(lines 1, 2, 3\), LineTotalAmount \(lines 1, 2, 3\), /);
    expect(r.out).toContain('LineTotalAmount (document level)');
    expect(r.out.split('\n').find((l) => l.startsWith('[FATAL]'))).not.toContain('TaxTotalAmount');
    expect(r.out).toMatch(/\n  currencyID should not be present\n/);
    expect(r.out).toMatch(/What it means: An amount carries a currencyID attribute/);
    expect(r.out).toMatch(/INVALID — \d+ rules checked, 15 failed/);
  });

  it('--json keeps one result per hit, each with element, path and line', async () => {
    const r = await run(['validate', neg, '--json']);
    const json = JSON.parse(r.out) as { results: { ruleId: string; element?: string; path?: string; line?: number; xpath: string }[] };
    const hits = json.results.filter((x) => x.ruleId === 'CII-DT-031');
    expect(hits).toHaveLength(15);
    expect(hits.every((x) => x.element && x.path && x.xpath)).toBe(true);
    expect(hits.some((x) => x.line === 3)).toBe(true);
  });
});
