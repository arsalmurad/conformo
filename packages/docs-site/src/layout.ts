/**
 * Hand-rolled static HTML, no framework and no client-side JavaScript. The look is the app's: the design tokens,
 * base styles and the shared header come from packages/ui/src (index.css, chrome/site-header.css) at build time, so
 * the three sites cannot drift apart (docs/DESIGN.md).
 *
 * Every link is relative to the page's depth, never rooted at "/": the site must work from any subpath.
 */
export interface PageOptions {
  title: string;
  description: string;
  /** The nav entry to mark as current (a key of DOC_NAV). */
  active?: string;
  depth: 0 | 1;
}

/** The documentation sections, in reading order. */
export const DOC_NAV: { key: string; href: string; label: string }[] = [
  { key: 'home', href: 'index.html', label: 'Overview' },
  { key: 'library', href: 'library.html', label: 'npm library' },
  { key: 'cli', href: 'cli.html', label: 'CLI' },
  { key: 'mcp', href: 'mcp.html', label: 'MCP server' },
  { key: 'http', href: 'http.html', label: 'HTTP API' },
  { key: 'germany', href: 'germany-2027.html', label: 'Germany 2027' },
  { key: 'conformance', href: 'conformance.html', label: 'Conformance' },
  { key: 'updates', href: 'updates.html', label: 'Rule updates' },
  { key: 'countries', href: 'countries/index.html', label: 'Countries' },
  { key: 'limits', href: 'limits.html', label: 'Not done yet' },
];

export const SITE = {
  app: 'https://conformo-three.vercel.app/',
  validator: 'https://conformo-validate.vercel.app/',
  docs: 'https://conformo-docs.vercel.app/',
  github: 'https://github.com/arsalmurad/conformo',
  npm: 'https://www.npmjs.com/package/@conformo/toolkit',
};

/** Docs-only styles; everything else is the app's stylesheet. */
export const DOCS_CSS = `
.docs { max-width: 1240px; margin: 0 auto; padding: var(--space-6) var(--space-5) var(--space-8); display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: var(--space-6); }
.docs-nav { position: sticky; top: var(--space-4); align-self: start; }
.docs-nav ol { list-style: none; margin: 0; padding: 0; border-left: 1px solid var(--rule); }
.docs-nav a { display: block; padding: 8px 12px; text-decoration: none; margin-left: -1px; border-left: 3px solid transparent; }
.docs-nav a:hover { text-decoration: underline; }
.docs-nav a[aria-current='page'] { border-left-color: var(--seal); font-weight: 700; }
.prose { min-width: 0; max-width: 820px; }
.prose h1 { font-size: 34px; margin-bottom: var(--space-3); }
.prose h2 { font-size: var(--text-xl); margin: var(--space-6) 0 var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--rule); }
.prose h3 { font-size: var(--text-lg); margin: var(--space-5) 0 var(--space-2); }
.prose p, .prose li { max-width: 72ch; }
.prose .lead { font-size: var(--text-lg); color: var(--ink); }
.prose a { color: var(--seal); }
.prose code { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 0.9em; background: var(--paper); border: 1px solid var(--rule); border-radius: 2px; padding: 0 4px; overflow-wrap: anywhere; }
.code { margin: var(--space-3) 0 var(--space-4); }
.code figcaption { font-size: var(--text-sm); font-weight: 700; margin-bottom: 4px; }
.code pre { margin: 0; padding: var(--space-3) var(--space-4); background: var(--paper); border: 1px solid var(--rule); border-left: 4px solid var(--ink); border-radius: var(--radius); overflow-x: auto; }
.code pre code { border: 0; padding: 0; background: none; font-size: 13px; line-height: 1.55; overflow-wrap: normal; white-space: pre; }
.table-wrap { overflow-x: auto; margin: var(--space-3) 0 var(--space-4); }
.prose table { border-collapse: collapse; width: 100%; font-size: var(--text-sm); background: var(--paper); }
.prose th, .prose td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--rule); vertical-align: top; }
.prose th { font-weight: 700; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-3); list-style: none; padding: 0; margin: var(--space-4) 0; }
.cards a { display: block; height: 100%; padding: var(--space-3) var(--space-4); background: var(--paper); border: 1px solid var(--rule); border-top: 3px solid var(--ink); text-decoration: none; color: var(--ink); }
.cards a:hover { border-top-color: var(--seal); }
.cards strong { display: block; }
.cards span { color: var(--graphite); font-size: var(--text-sm); }
.figures { display: flex; flex-wrap: wrap; gap: var(--space-5); margin: var(--space-3) 0; }
.figure { display: flex; flex-direction: column; }
.figure b { font-size: 30px; font-variant-numeric: tabular-nums; color: var(--seal); }
.figure span { font-size: var(--text-sm); color: var(--graphite); max-width: 22ch; }
.badge { display: inline-block; padding: 1px 8px; border: 1.5px solid currentColor; border-radius: 2px; font-size: 12px; font-weight: 700; }
.badge-mandatory, .badge-yes { color: var(--seal); }
.badge-planned { color: var(--ink); }
.badge-delayed, .badge-unverified, .badge-no { color: var(--stamp); }
.badge-voluntary { color: var(--graphite); }
.muted { color: var(--graphite); font-size: var(--text-sm); }
.source-note { font-size: var(--text-sm); color: var(--graphite); margin-top: var(--space-5); padding-top: var(--space-3); border-top: 1px solid var(--rule); overflow-wrap: anywhere; }
.country-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: var(--space-2); margin: var(--space-4) 0; list-style: none; padding: 0; }
.country-grid a { display: block; padding: 10px 12px; background: var(--paper); border: 1px solid var(--rule); text-decoration: none; color: var(--ink); }
.site-footer { max-width: 1240px; margin: 0 auto; padding: var(--space-5); color: var(--graphite); font-size: var(--text-sm); }
@media (max-width: 860px) {
  .docs { grid-template-columns: minmax(0, 1fr); padding: var(--space-4); gap: var(--space-4); }
  .docs-nav { position: static; }
  .docs-nav ol { display: flex; flex-wrap: wrap; border-left: 0; gap: 4px; }
  .docs-nav a { border-left: 0; border: 1px solid var(--rule); background: var(--paper); padding: 8px 10px; margin: 0; min-height: 40px; }
  .docs-nav a[aria-current='page'] { border-color: var(--seal); box-shadow: inset 0 -3px 0 var(--seal); }
  .prose h1 { font-size: 26px; }
}
`;

export function page(opts: PageOptions, body: string): string {
  const root = opts.depth === 0 ? '.' : '..';
  const nav = DOC_NAV.map((n) => `<li><a href="${root}/${n.href}"${opts.active === n.key ? ' aria-current="page"' : ''}>${n.label}</a></li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opts.title} · Conformo docs</title>
<meta name="description" content="${opts.description}">
<link rel="stylesheet" href="${root}/assets/site.css">
</head>
<body>
<a class="skip-link" href="#content">Skip to the content</a>
<header class="site-header">
  <div class="site-header-inner">
    <a class="brand" href="${SITE.app}"><span class="brand-mark" aria-hidden="true"></span><span class="brand-name">Conformo</span></a>
    <p class="site-tagline">Free, private e-invoices that pass the official checks. Nothing leaves your browser.</p>
    <nav class="site-nav" aria-label="Main">
      <a href="${SITE.app}">App</a>
      <a href="${SITE.validator}">Validator</a>
      <a href="${root}/index.html" aria-current="page">Docs</a>
      <a href="${SITE.github}">GitHub</a>
      <a href="${SITE.npm}">npm</a>
    </nav>
  </div>
</header>
<div class="docs">
  <nav class="docs-nav" aria-label="Documentation"><ol>${nav}</ol></nav>
  <main class="prose" id="content">
${body}
  </main>
</div>
<footer class="site-footer">Apache-2.0. Generated by <code>packages/docs-site</code> from this repository's docs and <code>packages/compliance-data</code>; every code sample on these pages is executed by the test suite.</footer>
</body>
</html>
`;
}
