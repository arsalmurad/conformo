import { useI18n } from '../i18n/I18n.js';
import type { Lang } from '../i18n/strings.js';

/** Where the three sites live. The same header is on the app, the validator page and the docs site. */
export const LINKS = {
  app: 'https://conformo-three.vercel.app/',
  validator: 'https://conformo-validate.vercel.app/',
  docs: 'https://conformo-docs.vercel.app/',
  github: 'https://github.com/arsalmurad/conformo',
};

export function SiteHeader({ current }: { current: 'app' | 'validator' | 'docs' }) {
  const { t, lang, setLang } = useI18n();
  const link = (id: keyof typeof LINKS, label: string) => (
    <a href={LINKS[id]} aria-current={current === id ? 'page' : undefined}>{label}</a>
  );
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a className="brand" href={LINKS.app}>
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">{t.appName}</span>
        </a>
        <p className="site-tagline">{t.tagline}</p>
        <nav aria-label={t.nav.main} className="site-nav">
          {link('app', t.nav.app)}
          {link('validator', t.nav.validator)}
          {link('docs', t.nav.docs)}
          {link('github', t.nav.github)}
        </nav>
        <div className="lang-switch" role="group" aria-label={t.language}>
          {(['de', 'en'] as Lang[]).map((l) => (
            <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
              {l === 'de' ? 'DE' : 'EN'}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
