/** Kept apart from generate.ts (which builds the site when imported) so tests can read the page list. */
/** Markdown source (repo-relative) -> page on the site. test/docs-site-samples.test.ts runs every sample in these. */
export const PAGES: { src: string; out: string; key: string; description: string }[] = [
  { src: 'docs/site/index.md', out: 'index.html', key: 'home', description: 'Conformo for developers: e-invoices as an npm library, CLI, MCP server and HTTP API.' },
  { src: 'docs/site/library.md', out: 'library.html', key: 'library', description: 'The @conformo/toolkit npm library.' },
  { src: 'docs/site/cli.md', out: 'cli.html', key: 'cli', description: 'The conformo command-line tool.' },
  { src: 'docs/site/mcp.md', out: 'mcp.html', key: 'mcp', description: 'The Conformo MCP server for Claude Desktop, Claude Code and Cursor.' },
  { src: 'docs/site/http.md', out: 'http.html', key: 'http', description: 'The Conformo HTTP API and its OpenAPI description.' },
  { src: 'docs/GERMANY-2027.md', out: 'germany-2027.html', key: 'germany', description: 'Germany 2027 e-invoicing in 10 minutes, with code.' },
  { src: 'docs/CONFORMANCE.md', out: 'conformance.html', key: 'conformance', description: 'How Conformo agrees with the official validators.' },
  { src: 'docs/site/limits.md', out: 'limits.html', key: 'limits', description: 'What Conformo does not do yet.' },
];
