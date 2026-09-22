/**
 * "HTML sanitisation on rich input, paste-to-plain-text"
 * . Every free-text field on an invoice (a note, a
 * line description, a party name) ends up embedded in generated XML and,
 * eventually, wherever this project's own free HTML validator or an invoice
 * preview renders it — so accepting raw HTML from a paste (Word and Google
 * Docs both put a rich `text/html` flavor on the clipboard alongside plain
 * text) is a stored-injection risk against whatever renders it next, not a
 * theoretical one.
 *
 * The fix is two-layered: intercept paste to take the clipboard's
 * `text/plain` flavor explicitly rather than letting the browser insert the
 * `text/html` one, AND strip any HTML that still gets in some other way
 * (typed, dragged, IME) before it's stored. Belt and suspenders on purpose —
 * paste interception alone wouldn't catch someone typing `<img onerror=...>`
 * directly.
 */

/** Strips tags and decodes the small set of entities plain text realistically
 * needs, without ever building a DOM from untrusted input (that's what
 * `innerHTML`-based "sanitizers" get wrong: parsing untrusted HTML as HTML at
 * all re-opens the exact hole you're trying to close). Deliberately not a
 * general HTML sanitizer — it doesn't need to allow any tags through, since
 * every field this is used on is plain text, never rich text, by design. */
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** An onPaste handler that forces plain text: reads `text/plain` from the
 * clipboard directly and inserts it at the cursor, instead of letting the
 * browser's default paste behavior insert whatever the source app's richer
 * clipboard flavor (`text/html`) contained. */
export function pasteAsPlainText(e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>): void {
  e.preventDefault();
  const text = stripHtml(e.clipboardData.getData("text/plain"));
  const el = e.currentTarget;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  const nativeSetter = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value")?.set;
  nativeSetter?.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const caret = start + text.length;
  requestAnimationFrame(() => el.setSelectionRange(caret, caret));
}
