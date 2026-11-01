import { useEffect, useId, useState } from 'react';
import { useI18n } from '../i18n/I18n.js';
import { countryName, countryOptions, resolveCountry } from '../countries.js';

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onValue: (code: string) => void;
}

/**
 * Country by name, searchable: a text input with the browser's own suggestion list (a native combobox, keyboard and
 * screen-reader friendly, nothing to download). People type "Deutsch" or "germ" and pick; the model gets the ISO code
 * (BT-40 / BT-55). Text that matches no country leaves the code empty, and the field says so.
 */
export function CountryInput({ value, onValue, onBlur, onFocus, ...rest }: Props) {
  const { lang } = useI18n();
  const listId = useId();
  const [text, setText] = useState(() => (value ? countryName(value, lang) : ''));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value ? countryName(value, lang) : '');
  }, [value, lang, focused]);

  return (
    <>
      <input
        {...rest}
        type="text"
        list={listId}
        autoComplete="country-name"
        value={text}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onChange={(e) => {
          setText(e.target.value);
          const code = resolveCountry(e.target.value, lang);
          if (code) { if (code !== value) onValue(code); } else if (value) onValue('');
        }}
        onBlur={(e) => {
          setFocused(false);
          const code = resolveCountry(text, lang);
          if (code) setText(countryName(code, lang));
          onBlur?.(e);
        }}
      />
      <datalist id={listId}>
        {countryOptions(lang).map((c) => (
          <option key={c.code} value={c.name}>{c.code}</option>
        ))}
      </datalist>
    </>
  );
}
