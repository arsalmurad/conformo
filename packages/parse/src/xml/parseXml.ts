/**
 * A minimal, hand-rolled XML parser for exactly one reason: security. Every
 * invoice this package reads comes from someone else's software, which
 * makes it untrusted input by definition — and the two classic XML attacks
 * (XXE, billion-laughs) both require a DOCTYPE with an internal subset. A
 * real invoice never legitimately has one, so this parser doesn't implement
 * DTD parsing AT ALL and refuses any document that contains a `<!DOCTYPE` or
 * `<!ENTITY` sequence outright — closing the entire attack class by
 * construction, not by finding and setting the right disable-external-
 * entities flag on a general-purpose library (which is exactly the kind of
 * flag that has had real historical CVEs from being wrong, missing, or
 * silently ignored across the XML-library ecosystem).
 *
 * This is not a general-purpose, spec-complete XML 1.0 parser. It handles
 * exactly what real-world e-invoices use: namespaced elements and
 * attributes, text content, CDATA, comments and processing instructions
 * (skipped), the five predefined entities, and numeric character
 * references. It does not support an external subset, notations,
 * processing-instruction targets other than `xml`, or any encoding other
 * than what the JS string already is (the caller decodes bytes to a string
 * first — see pdf.ts and the CLI/UI callers for how).
 */
import { XmlSecurityError, XmlSyntaxError } from './types.js';
import type { XmlAttribute, XmlElement } from './types.js';

export interface ParseXmlOptions {
  /** Hard cap on input size, checked before any parsing work. Default 20 MB
   * — generous for any real invoice (even with embedded attachments as
   * base64 line items), tiny next to what a deliberately huge payload could
   * otherwise force this process to hold in memory. */
  maxBytes?: number;
  /** Defends against a pathologically deep element chain, a different
   * resource-exhaustion shape than entity expansion (which this parser
   * already can't do at all — see the module doc). */
  maxDepth?: number;
  /** Defends against a document built from an enormous number of tiny
   * elements rather than deep nesting. */
  maxNodes?: number;
}

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 200;
const DEFAULT_MAX_NODES = 200_000;

type NsScope = Readonly<Record<string, string>>;

export function parseXml(source: string, options: ParseXmlOptions = {}): XmlElement {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;

  const byteLength = new TextEncoder().encode(source).length;
  if (byteLength > maxBytes) {
    throw new XmlSecurityError(`Input is ${byteLength} bytes; the limit is ${maxBytes}`);
  }
  // The entire XXE / billion-laughs defense: refuse a DOCTYPE (and, for
  // belt-and-suspenders, a bare ENTITY declaration) outright, anywhere in
  // the document. A real invoice never has one.
  if (/<!DOCTYPE/i.test(source) || /<!ENTITY/i.test(source)) {
    throw new XmlSecurityError('DOCTYPE and ENTITY declarations are not allowed in an invoice document');
  }

  let pos = 0;
  let nodeCount = 0;
  const len = source.length;

  function fail(message: string): never {
    throw new XmlSyntaxError(`${message} (at character ${pos})`);
  }

  function isSpace(ch: string): boolean {
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
  }

  function skipSpace(): void {
    while (pos < len && isSpace(source[pos]!)) pos++;
  }

  function isNameStart(ch: string): boolean {
    return /[A-Za-z_:]/.test(ch);
  }
  function isNameChar(ch: string): boolean {
    return /[A-Za-z0-9_:.\-]/.test(ch);
  }

  function parseName(): string {
    if (pos >= len || !isNameStart(source[pos]!)) fail('Expected an element or attribute name');
    const start = pos;
    pos++;
    while (pos < len && isNameChar(source[pos]!)) pos++;
    return source.slice(start, pos);
  }

  function decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (whole, body: string) => {
      if (body === 'amp') return '&';
      if (body === 'lt') return '<';
      if (body === 'gt') return '>';
      if (body === 'quot') return '"';
      if (body === 'apos') return "'";
      // Numeric character references are just Unicode code points — fixed,
      // non-recursive, safe to expand unconditionally.
      const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) return String.fromCodePoint(code);
      return whole;
    });
  }

  function skipMiscAndProlog(): void {
    skipSpace();
    for (;;) {
      if (source.startsWith('<?', pos)) {
        const end = source.indexOf('?>', pos);
        if (end === -1) fail('Unterminated processing instruction');
        pos = end + 2;
      } else if (source.startsWith('<!--', pos)) {
        pos = skipComment(pos);
      } else {
        break;
      }
      skipSpace();
    }
  }

  function skipComment(from: number): number {
    const end = source.indexOf('-->', from + 4);
    if (end === -1) fail('Unterminated comment');
    return end + 3;
  }

  function parseAttributes(): XmlAttribute[] {
    const raw: { name: string; value: string }[] = [];
    for (;;) {
      skipSpace();
      if (pos >= len || source[pos] === '>' || source[pos] === '/' || source[pos] === '?') break;
      const name = parseName();
      skipSpace();
      if (source[pos] !== '=') fail(`Expected "=" after attribute "${name}"`);
      pos++;
      skipSpace();
      const quote = source[pos];
      if (quote !== '"' && quote !== "'") fail(`Expected a quoted value for attribute "${name}"`);
      pos++;
      const valueStart = pos;
      const closeIdx = source.indexOf(quote, pos);
      if (closeIdx === -1) fail(`Unterminated value for attribute "${name}"`);
      const rawValue = source.slice(valueStart, closeIdx);
      pos = closeIdx + 1;
      raw.push({ name, value: decodeEntities(rawValue) });
    }
    return raw.filter((a) => a.name !== 'xmlns' && !a.name.startsWith('xmlns:')).map((a) => ({
      name: localName(a.name),
      value: a.value,
    }));
  }

  function localName(qualified: string): string {
    const i = qualified.indexOf(':');
    return i === -1 ? qualified : qualified.slice(i + 1);
  }
  function prefixOf(qualified: string): string {
    const i = qualified.indexOf(':');
    return i === -1 ? '' : qualified.slice(0, i);
  }

  function resolveNamespaces(rawAttrs: { name: string; value: string }[], parentScope: NsScope): NsScope {
    let scope: NsScope = parentScope;
    let copied = false;
    for (const a of rawAttrs) {
      if (a.name === 'xmlns') {
        if (!copied) { scope = { ...scope }; copied = true; }
        (scope as Record<string, string>)[''] = a.value;
      } else if (a.name.startsWith('xmlns:')) {
        if (!copied) { scope = { ...scope }; copied = true; }
        (scope as Record<string, string>)[a.name.slice('xmlns:'.length)] = a.value;
      }
    }
    return scope;
  }

  function parseElement(depth: number, parentScope: NsScope): XmlElement {
    if (depth > maxDepth) throw new XmlSecurityError(`Element nesting exceeds the limit of ${maxDepth}`);
    if (++nodeCount > maxNodes) throw new XmlSecurityError(`Document has more than ${maxNodes} nodes`);

    if (source[pos] !== '<') fail('Expected "<"');
    pos++;
    const qualifiedName = parseName();

    // Attributes are scanned twice: once (read-only, restores `pos`) to
    // resolve any xmlns declared on this same element, then for real —
    // needed because a prefix can be declared and used on the same start
    // tag, so the scope must be known before attribute names are resolved.
    const rawAttrs = collectRawAttributes();
    const scope = resolveNamespaces(rawAttrs, parentScope);
    const attributes = parseAttributes();

    skipSpace();
    let selfClosing = false;
    if (source.startsWith('/>', pos)) {
      selfClosing = true;
      pos += 2;
    } else if (source[pos] === '>') {
      pos += 1;
    } else {
      fail(`Malformed start tag for <${qualifiedName}>`);
    }

    const element: XmlElement = {
      type: 'element',
      name: localName(qualifiedName),
      // scope[''] holds the default (unprefixed) xmlns, so this one lookup
      // correctly resolves both "rsm:CrossIndustryInvoice" and a bare,
      // unprefixed element name.
      namespaceURI: scope[prefixOf(qualifiedName)],
      attributes,
      children: [],
    };

    if (selfClosing) return element;

    for (;;) {
      if (pos >= len) fail(`Unterminated element <${qualifiedName}>`);
      if (source.startsWith('</', pos)) {
        const closeStart = pos + 2;
        const closeEnd = source.indexOf('>', closeStart);
        if (closeEnd === -1) fail('Unterminated end tag');
        const closeName = source.slice(closeStart, closeEnd).trim();
        if (closeName !== qualifiedName) fail(`Mismatched end tag: expected </${qualifiedName}>, got </${closeName}>`);
        pos = closeEnd + 1;
        return element;
      }
      if (source.startsWith('<!--', pos)) {
        pos = skipComment(pos);
        continue;
      }
      if (source.startsWith('<![CDATA[', pos)) {
        const end = source.indexOf(']]>', pos + 9);
        if (end === -1) fail('Unterminated CDATA section');
        pushText(element, source.slice(pos + 9, end));
        pos = end + 3;
        continue;
      }
      if (source.startsWith('<?', pos)) {
        const end = source.indexOf('?>', pos);
        if (end === -1) fail('Unterminated processing instruction');
        pos = end + 2;
        continue;
      }
      if (source[pos] === '<') {
        element.children.push(parseElement(depth + 1, scope));
        continue;
      }
      const textStart = pos;
      const nextLt = source.indexOf('<', pos);
      pos = nextLt === -1 ? len : nextLt;
      pushText(element, decodeEntities(source.slice(textStart, pos)));
    }
  }

  function pushText(parent: XmlElement, value: string): void {
    if (value === '') return;
    if (++nodeCount > maxNodes) throw new XmlSecurityError(`Document has more than ${maxNodes} nodes`);
    parent.children.push({ type: 'text', value });
  }

  function collectRawAttributes(): { name: string; value: string }[] {
    const saved = pos;
    const raw: { name: string; value: string }[] = [];
    for (;;) {
      skipSpace();
      if (pos >= len || source[pos] === '>' || source[pos] === '/' || source[pos] === '?') break;
      const name = parseName();
      skipSpace();
      if (source[pos] !== '=') fail(`Expected "=" after attribute "${name}"`);
      pos++;
      skipSpace();
      const quote = source[pos];
      if (quote !== '"' && quote !== "'") fail(`Expected a quoted value for attribute "${name}"`);
      pos++;
      const closeIdx = source.indexOf(quote, pos);
      if (closeIdx === -1) fail(`Unterminated value for attribute "${name}"`);
      raw.push({ name, value: source.slice(pos, closeIdx) });
      pos = closeIdx + 1;
    }
    pos = saved;
    return raw;
  }

  skipMiscAndProlog();
  const root = parseElement(0, {});
  skipMiscAndProlog();
  if (pos < len) fail('Unexpected content after the root element');
  return root;
}

export type { XmlElement, XmlNode, XmlAttribute } from './types.js';
export { XmlSecurityError, XmlSyntaxError } from './types.js';
