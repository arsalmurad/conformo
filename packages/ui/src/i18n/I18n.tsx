import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { STRINGS, type Lang, type Strings } from './strings.js';

const KEY = 'conformo.lang';

/** German when the browser's first language is German, English otherwise; an explicit choice is remembered on this
 * device (a per-viewer convenience only, so storage failures are ignored). */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'de') return saved;
  } catch { /* private mode */ }
  const first = (typeof navigator !== 'undefined' ? navigator.languages?.[0] ?? navigator.language : '') || '';
  return first.toLowerCase().startsWith('de') ? 'de' : 'en';
}

interface I18nValue {
  lang: Lang;
  t: Strings;
  setLang: (lang: Lang) => void;
}

const Ctx = createContext<I18nValue>({ lang: 'en', t: STRINGS.en, setLang: () => {} });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo(() => ({ lang, t: STRINGS[lang], setLang }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(Ctx);
}
