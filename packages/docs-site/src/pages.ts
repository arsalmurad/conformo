/** Kept apart from generate.ts (which builds the site when imported) so tests can read the page list. */
/** Markdown source (repo-relative) -> page on the site. test/docs-site-samples.test.ts runs every sample in these. */
export const PAGES: { src: string; out: string; key: string; description: string }[] = [
  { src: 'docs/site/index.md', out: 'index.html', key: 'home', description: 'Create and check XRechnung, ZUGFeRD and Factur-X e-invoices in JavaScript: npm library, CLI, MCP server and HTTP API. Free, open source, no Java.' },
  { src: 'docs/site/library.md', out: 'library.html', key: 'library', description: 'Create, validate, convert and parse XRechnung, ZUGFeRD, Factur-X and Peppol BIS e-invoices in Node.js or the browser with the @conformo/toolkit npm library.' },
  { src: 'docs/site/cli.md', out: 'cli.html', key: 'cli', description: 'The conformo command line: create, validate, convert and parse XRechnung, ZUGFeRD and Factur-X e-invoices in a terminal or CI, with exit codes and JSON output.' },
  { src: 'docs/site/mcp.md', out: 'mcp.html', key: 'mcp', description: 'Let Claude, Cursor or any MCP client create and check XRechnung, ZUGFeRD and Peppol BIS e-invoices. Runs locally, free, no API key.' },
  { src: 'docs/site/http.md', out: 'http.html', key: 'http', description: 'A stateless, self-hosted HTTP API for creating and validating EN 16931 e-invoices, with an OpenAPI 3.1 description.' },
  { src: 'docs/GERMANY-2027.md', out: 'germany-2027.html', key: 'germany', description: 'Germany\'s 2027 B2B e-invoicing mandate explained in 10 minutes, with working code for XRechnung and ZUGFeRD.' },
  { src: 'docs/CONFORMANCE.md', out: 'conformance.html', key: 'conformance', description: 'How Conformo\'s verdicts compare with the official KoSIT, CEN and Peppol validators on the official test invoices: 100% agreement with KoSIT, measured in CI.' },
  { src: 'docs/UPDATES.md', out: 'updates.html', key: 'updates', description: 'How Conformo tracks KoSIT, CEN and Peppol rule releases every day and ships an update only at 100% agreement with KoSIT.' },
  { src: 'docs/site/limits.md', out: 'limits.html', key: 'limits', description: 'What Conformo does not do yet: no sending over Peppol or tax portals, no FatturaPA or Facturae, limited KSeF, and other known gaps.' },
];
