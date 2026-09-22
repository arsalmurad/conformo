import { useEffect, useState } from 'react';
import { fromMajor, toMajor } from '@invoice-engine/core';

/** A plain `value={toMajor(minor)}` input reformats to a fixed 2-decimal
 * string on every keystroke, which fights the cursor mid-edit (typing "1000"
 * renders "1.00" after the first digit, then loses the rest). This keeps its
 * own draft text instead, and only commits a parse back out on each valid
 * keystroke.
 *
 * That local text has to resync when `minor` changes for a reason OTHER than
 * this field's own typing — e.g. BillingPanel's "replace invoice lines"
 * button setting a line's price programmatically. Confirmed missing, not
 * assumed: without the effect below, that button visibly computed the right
 * amount but the price field kept showing the line's old value (0.00) until
 * the user happened to blur it. The fix only resyncs while NOT focused, so
 * it doesn't fight the user's own in-progress keystrokes the way a plain
 * `value={toMajor(minor)}` would. */
export function MoneyInput({ minor, onChange, className }: { minor: number; onChange: (minor: number) => void; className?: string }) {
  const [text, setText] = useState(() => toMajor(minor));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(toMajor(minor));
  }, [minor, focused]);

  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        setText(e.target.value);
        if (/^\d*\.?\d*$/.test(e.target.value) && e.target.value !== '' && e.target.value !== '.') {
          onChange(fromMajor(e.target.value));
        }
      }}
      onBlur={() => {
        setFocused(false);
        setText(toMajor(minor));
      }}
    />
  );
}
