import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18n.js';
import { formatAmount, formatDecimal, parseAmount, parseDecimal } from '../money.js';

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onValue: (value: number) => void;
  /** money: integer minor units shown as "1.234,50"; decimal: a plain number such as a quantity or a VAT rate. */
  kind: 'money' | 'decimal';
}

/**
 * A number field that accepts what people type in their own language ("120,50" in German) and keeps the text they are
 * typing untouched while focused: reformatting on every keystroke fights the cursor. The value is committed on every
 * keystroke that parses, and the text is re-formatted on blur. It resyncs from outside only while not focused (for
 * example when the deposit calculator replaces a line's price).
 */
export function DecimalInput({ value, onValue, kind, onBlur, onFocus, ...rest }: Props) {
  const { lang } = useI18n();
  const show = (v: number) => (kind === 'money' ? formatAmount(v, lang) : formatDecimal(v, lang));
  const [text, setText] = useState(() => show(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `show` depends only on kind and lang
  }, [value, focused, lang, kind]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = kind === 'money' ? parseAmount(e.target.value, lang) : parseDecimal(e.target.value, lang);
        if (parsed !== undefined) onValue(parsed);
      }}
      onBlur={(e) => {
        setFocused(false);
        setText(show(value));
        onBlur?.(e);
      }}
    />
  );
}
