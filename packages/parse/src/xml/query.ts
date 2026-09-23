import type { XmlElement } from './types.js';

/** Every reader in this package looks elements up by local name + namespace
 * URI, never by prefix — a sender is free to call the CII namespace "ram"
 * or "x" or anything else; the URI is what's actually fixed by the spec.
 *
 * Takes `el: XmlElement | undefined`, like text()/attr()/descend() below, so a
 * reader can chase an optional group (e.g. an absent ApplicableHeaderTradeDelivery)
 * without a null check at every step. */
export function children(el: XmlElement | undefined, name: string, namespaceURI?: string): XmlElement[] {
  if (!el) return [];
  return el.children.filter(
    (c): c is XmlElement => c.type === 'element' && c.name === name && (namespaceURI === undefined || c.namespaceURI === namespaceURI),
  );
}

export function child(el: XmlElement | undefined, name: string, namespaceURI?: string): XmlElement | undefined {
  return children(el, name, namespaceURI)[0];
}

/** Every child that's a text node, in order, concatenated. Handles the
 * (legal but rare) case of text split across CDATA and plain runs — e.g.
 * "foo<![CDATA[bar]]>baz" is one logical text value, "foobarbaz". */
export function text(el: XmlElement | undefined): string | undefined {
  if (!el) return undefined;
  const value = el.children
    .filter((c): c is { type: 'text'; value: string } => c.type === 'text')
    .map((c) => c.value)
    .join('');
  return value === '' ? undefined : value;
}

export function attr(el: XmlElement | undefined, name: string): string | undefined {
  return el?.attributes.find((a) => a.name === name)?.value;
}

/** A single, dotted path of local names, e.g. "ram:SellerTradeParty" ->
 * path('SellerTradeParty') below one element — kept intentionally simple
 * (one level at a time via `child`/`children`) rather than a path-query
 * language: every reader here already knows the exact CII/UBL shape it's
 * walking, the same way the writers in packages/formats do. */
export function descend(el: XmlElement | undefined, ...names: string[]): XmlElement | undefined {
  let current = el;
  for (const name of names) {
    if (!current) return undefined;
    current = child(current, name);
  }
  return current;
}
