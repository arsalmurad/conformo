import { useState } from 'react';
import { useI18n } from './i18n/I18n.js';

interface Props {
  wrongPassphrase: boolean;
  onUnlock: (passphrase: string) => void;
  onDiscard: () => void;
}

export function UnlockScreen({ wrongPassphrase, onUnlock, onDiscard }: Props) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  return (
    <div className="unlock-screen">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onUnlock(value);
        }}
      >
        <h1>{t.unlock.title}</h1>
        <p>{t.unlock.body}</p>
        <label className="visually-hidden" htmlFor="unlock-pass">{t.unlock.placeholder}</label>
        <input
          id="unlock-pass"
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t.unlock.placeholder}
        />
        {wrongPassphrase && <p className="unlock-error">{t.unlock.wrong}</p>}
        <button type="submit" className="btn btn-primary">{t.unlock.submit}</button>
      </form>
      <button type="button" className="discard" onClick={onDiscard}>
        {t.unlock.discard}
      </button>
    </div>
  );
}
