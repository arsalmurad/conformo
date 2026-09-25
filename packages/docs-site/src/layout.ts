/**
 * Hand-rolled static HTML, no framework: this site is a handful of pages
 * generated from one dataset, not an app — the same reasoning that keeps
 * packages/pdf's templates as plain drawing calls rather than reaching for a
 * layout engine. Zero client-side JS; every page is plain readable HTML.
 */
export interface PageOptions {
  title: string;
  description: string;
  active?: string;
  /** How many directories deep this page is from the site root (0 for
   * index.html, 1 for countries/*.html) — every link is written relative to
   * that, never rooted at "/". A rooted link only works when the site is
   * served from a domain's root; GitHub Pages for a project repo serves at
   * "<user>.github.io/<repo>/", where every "/countries/..." link 404s. */
  depth: 0 | 1;
}

const STYLE = `
  :root { color-scheme: light dark; --ink:#15181d; --mute:#5b6470; --line:#e2e5e9; --accent:#1a56db; --bg:#ffffff; }
  @media (prefers-color-scheme: dark) { :root { --ink:#e8eaed; --mute:#9aa4b2; --line:#2b2f36; --accent:#7aa2ff; --bg:#101215; } }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--ink); background: var(--bg); }
  a { color: var(--accent); }
  header.site { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid var(--line); flex-wrap: wrap; gap: 8px; }
  header.site nav a { margin-left: 16px; font-size: 14px; text-decoration: none; color: var(--mute); }
  header.site nav a.active, header.site nav a:hover { color: var(--ink); }
  main { max-width: 860px; margin: 0 auto; padding: 32px 24px 80px; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  h2 { font-size: 20px; margin: 32px 0 8px; }
  p.lede { color: var(--mute); margin: 0 0 24px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0 28px; font-size: 14px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--mute); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .badge-mandatory { background: #dcfce7; color: #166534; }
  .badge-planned { background: #fef9c3; color: #854d0e; }
  .badge-delayed { background: #fee2e2; color: #991b1b; }
  .badge-voluntary { background: #e2e5e9; color: #5b6470; }
  .badge-unverified { background: #fee2e2; color: #991b1b; }
  .country-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; margin: 16px 0 32px; list-style: none; padding: 0; }
  .country-grid a { display: block; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; text-decoration: none; color: var(--ink); }
  .country-grid a:hover { border-color: var(--accent); }
  .source-note { font-size: 13px; color: var(--mute); margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--line); }
  footer.site { max-width: 860px; margin: 0 auto; padding: 24px; color: var(--mute); font-size: 13px; }
`;

export function page(opts: PageOptions, body: string): string {
  const root = opts.depth === 0 ? '.' : '..';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opts.title} — Conformo docs</title>
<meta name="description" content="${opts.description}">
<style>${STYLE}</style>
</head>
<body>
<header class="site">
  <strong>Conformo</strong>
  <nav>
    <a href="${root}/index.html"${opts.active === 'home' ? ' class="active"' : ''}>Home</a>
    <a href="${root}/countries/index.html"${opts.active === 'countries' ? ' class="active"' : ''}>Countries</a>
    <a href="https://conformo-three.vercel.app">App</a>
    <a href="https://github.com/arsalmurad/conformo">GitHub</a>
  </nav>
</header>
<main>
${body}
</main>
<footer class="site">
  Generated from <code>packages/compliance-data</code> by
  <code>packages/docs-site</code>. Licensed Apache-2.0.
</footer>
</body>
</html>
`;
}
