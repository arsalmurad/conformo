/**
 * Just enough Markdown for the documentation this site renders (headings, paragraphs, lists, tables, fenced code,
 * inline code, emphasis, links). No dependency: the pages are this repository's own docs, written in a small subset.
 * Rendering the same files the doc-tests execute is what keeps every code sample on the site a sample a test ran.
 */
export interface CodeBlock {
  lang: string;
  flags: string[];
  code: string;
}

export interface RenderOptions {
  /** Rewrites a link target written in the Markdown (relative to the source file) to its URL on the site. */
  link: (href: string) => string;
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function inline(text: string, o: RenderOptions): string {
  const codes: string[] = [];
  let s = text.replace(/`([^`]+)`/g, (_, c: string) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => `<a href="${esc(o.link(href.replace(/&amp;/g, '&')))}">${label}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,:;]|$)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s).,:;]|$)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${esc(codes[Number(i)]!)}</code>`);
}

function cells(row: string): string[] {
  return row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** Code blocks whose fence carries `test-only` are run by the doc-tests but not shown on the site. */
export function renderMarkdown(md: string, o: RenderOptions): { html: string; title: string; blocks: CodeBlock[] } {
  const lines = md.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const out: string[] = [];
  const blocks: CodeBlock[] = [];
  let title = '';
  let i = 0;
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '), o)}</p>`); para = []; } };

  while (i < lines.length) {
    const line = lines[i]!;
    const fence = /^```(.*)$/.exec(line);
    if (fence) {
      flush();
      const info = fence[1]!.trim().split(/\s+/).filter(Boolean);
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) body.push(lines[i++]!);
      i++;
      const block = { lang: info[0] ?? '', flags: info.slice(1), code: body.join('\n') };
      blocks.push(block);
      if (block.flags.includes('test-only')) continue;
      const file = block.flags.find((f) => f.startsWith('file='))?.slice(5);
      out.push(`<figure class="code">${file ? `<figcaption>${esc(file)}</figcaption>` : ''}<pre tabindex="0"><code${block.lang ? ` class="lang-${esc(block.lang)}"` : ''}>${esc(block.code)}</code></pre></figure>`);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const level = h[1]!.length;
      const text = inline(h[2]!, o);
      if (level === 1 && !title) { title = h[2]!.replace(/`/g, ''); out.push(`<h1>${text}</h1>`); }
      else out.push(`<h${level} id="${slug(h[2]!)}">${text}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      flush();
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]!)) rows.push(cells(lines[i++]!));
      out.push(`<div class="table-wrap" tabindex="0" role="region" aria-label="Table"><table><thead><tr>${head.map((c) => `<th>${inline(c, o)}</th>`).join('')}</tr></thead><tbody>${
        rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, o)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const li = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const ordered = /\d/.test(li[2]!);
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]!);
        if (m) { items.push(m[3]!); i++; continue; }
        // A continuation line of the previous item (indented, not blank).
        if (/^\s{2,}\S/.test(lines[i]!) && items.length) { items[items.length - 1] += ` ${lines[i]!.trim()}`; i++; continue; }
        break;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((t) => `<li>${inline(t, o)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (/^\s*$/.test(line)) { flush(); i++; continue; }
    if (/^ {4}\S/.test(line) && !para.length) {
      const body: string[] = [];
      while (i < lines.length && (/^ {4}/.test(lines[i]!) || /^\s*$/.test(lines[i]!))) body.push(lines[i++]!.slice(4));
      out.push(`<pre tabindex="0"><code>${esc(body.join('\n').trimEnd())}</code></pre>`);
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flush();
  return { html: out.join('\n'), title, blocks };
}

export function codeBlocks(md: string): CodeBlock[] {
  return renderMarkdown(md, { link: (h) => h }).blocks;
}
