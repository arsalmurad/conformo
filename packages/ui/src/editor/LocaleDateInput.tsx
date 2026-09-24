import { useState } from 'react';
import { formatInvoiceDate } from '@conformo/pdf';

/** ISO yyyy-mm-dd -> the locale's own "how you'd write dd/mm/yyyy" hint, for
 * the empty-state placeholder. Built from Intl's own part order rather than
 * hand-maintaining one string per locale, so a new locale in locale.ts's own
 * map needs nothing added here. */
function placeholderFor(locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    new Date(2000, 0, 1),
  );
  const letters: Record<string, string> = { year: 'YYYY', month: 'MM', day: 'DD' };
  return parts.map((p) => letters[p.type] ?? p.value).join('');
}

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  locale: string;
}

/**
 * the project's own conventions: "Replace every native... date input
 * with styled components" — the one native-chrome item the earlier an earlier pass
 * pass under-scoped. Recoloring `::-webkit-calendar-picker-indicator` (still
 * done, in App.css) fixes the icon, but a native `<input type="date">`'s own
 * displayed text — including "mm/dd/yyyy" for an empty field — is formatted
 * by the OS/browser locale, not the page, and Chrome (unlike Firefox) does
 * not honor the `lang` attribute for it. There is no CSS that reaches it.
 *
 * This keeps the real native input for everything that matters — keyboard
 * entry, the native calendar picker, screen-reader semantics — and only
 * overlays a locale-correct, invoice-aware display (same `formatInvoiceDate`
 * the PDF itself uses) while the field isn't focused. While focused, the
 * overlay steps aside and the native control's own segments (editable
 * per-keystroke) show through normally: overlaying formatted text on top of
 * an *actively edited* date input would show a static string that doesn't
 * update per keystroke, which is worse than the browser default, not better.
 */
export function LocaleDateInput({ value, onChange, locale, className, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const showOverlay = !focused;
  const display = value ? formatInvoiceDate(value, locale) : '';

  return (
    <span className="locale-date">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`${className ?? ''} ${showOverlay ? 'locale-date-native-hidden' : ''}`.trim()}
        {...rest}
      />
      {showOverlay && (
        <span className={`locale-date-overlay${display ? '' : ' locale-date-placeholder'}`} aria-hidden="true">
          {display || placeholderFor(locale)}
        </span>
      )}
    </span>
  );
}
