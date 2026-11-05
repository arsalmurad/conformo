// The one place the three sites (app, validator page, docs) get their brand files and crawler files from, so they cannot
// drift apart. Each site's build copies these into its web root:
//
//   favicon.ico, favicon.svg      the header's seal mark (site-header.css .brand-mark): ring, white gap, dot
//   apple-touch-icon.png          180 px, white seal on the seal green, full bleed (iOS rounds it)
//   icon-192.png, icon-512.png    PWA icons, same artwork
//   icon-maskable-512.png         PWA maskable icon, the mark kept inside the 40% safe zone
//   og-image.png                  social card (docs/media/social-preview.png, 1280 x 640)
//   robots.txt, sitemap.xml       generated per site
//
// The PNG and ICO files are rendered from the SVGs next to this file (favicon.svg, icon.svg, icon-maskable.svg) and
// committed, so the build needs no image tooling. To change the artwork, edit the SVGs and re-render, e.g.
// `rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png` (ImageMagick `convert` for favicon.ico from 16, 32 and 48 px).
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

export const SITES = {
  app: 'https://conformo-three.vercel.app/',
  validator: 'https://conformo-validate.vercel.app/',
  docs: 'https://conformo-docs.vercel.app/',
};

/** Brand colours, matching --seal and --paper in packages/ui/src/index.css (light and dark). */
export const COLORS = { seal: '#0e6a4e', paper: '#ffffff', paperDark: '#18201e' };

export const ICON_FILES = ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

export const OG_IMAGE = { file: 'og-image.png', width: 1280, height: 640, alt: 'Conformo: free e-invoices checked against the official rules' };

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function robotsTxt(siteUrl) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`;
}

/** `pages` are paths relative to the site root ('' is the home page). No lastmod: a build date would be a guess. */
export function sitemapXml(siteUrl, pages) {
  const urls = pages.map((p) => `  <url><loc>${xmlEscape(siteUrl + p)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** Copies the icons and the social card into `destDir` and writes robots.txt and sitemap.xml for `siteUrl`. */
export function writeBrandFiles(destDir, { siteUrl, pages = [''] }) {
  mkdirSync(destDir, { recursive: true });
  for (const f of ICON_FILES) copyFileSync(path.join(here, f), path.join(destDir, f));
  copyFileSync(path.join(repoRoot, 'docs/media/social-preview.png'), path.join(destDir, OG_IMAGE.file));
  writeFileSync(path.join(destDir, 'robots.txt'), robotsTxt(siteUrl));
  writeFileSync(path.join(destDir, 'sitemap.xml'), sitemapXml(siteUrl, pages));
}
