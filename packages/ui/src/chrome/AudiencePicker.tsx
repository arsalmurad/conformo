import { AUDIENCE_ORDER, type AudienceId } from '../audience.js';
import { useI18n } from '../i18n/I18n.js';
import type { ComplianceCountry } from '../useComplianceCountries.js';

interface Props {
  value: AudienceId;
  onChange: (id: AudienceId) => void;
  countries: ComplianceCountry[];
}

/** The plain question that replaces the old jargon profile selector. Countries the dataset lists but this app cannot
 * produce a valid e-invoice for are named separately, never offered as a choice. */
export function AudiencePicker({ value, onChange, countries }: Props) {
  const { t, lang } = useI18n();
  const unsupported = countries.filter((c) => !c.supported);
  const names = (() => {
    try {
      const dn = new Intl.DisplayNames([lang], { type: 'region' });
      return unsupported.map((c) => dn.of(c.country) ?? c.name);
    } catch {
      return unsupported.map((c) => c.name);
    }
  })();
  const list = new Intl.ListFormat(lang, { type: 'conjunction' }).format(names);
  return (
    <fieldset className="audience">
      <legend className="audience-question">{t.audience.question}</legend>
      <div className="audience-options">
        {AUDIENCE_ORDER.map((id) => (
          <label key={id} className={`audience-option${value === id ? ' is-selected' : ''}`}>
            <input type="radio" name="audience" value={id} checked={value === id} onChange={() => onChange(id)} />
            <span className="audience-title">{t.audience[id].title}</span>
            <span className="audience-detail">{t.audience[id].detail}</span>
          </label>
        ))}
      </div>
      {names.length > 0 && (
        <p className="audience-unsupported">
          <strong>{t.audience.unsupportedTitle}:</strong> {t.audience.unsupported(list)}
        </p>
      )}
    </fieldset>
  );
}
