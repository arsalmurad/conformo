import { useState } from 'react';

interface Props {
  wrongPassphrase: boolean;
  onUnlock: (passphrase: string) => void;
  onDiscard: () => void;
}

export function UnlockScreen({ wrongPassphrase, onUnlock, onDiscard }: Props) {
  const [value, setValue] = useState('');
  return (
    <div className="unlock-screen">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onUnlock(value);
        }}
      >
        <h1>Encrypted draft found on this device</h1>
        <p>Enter the passphrase you protected it with. There is no recovery — the key is never stored anywhere.</p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Passphrase"
        />
        {wrongPassphrase && <p className="unlock-error">That passphrase didn't decrypt the draft. Try again.</p>}
        <button type="submit">Unlock</button>
      </form>
      <button type="button" className="discard" onClick={onDiscard}>
        Discard it and start a new invoice instead
      </button>
    </div>
  );
}
