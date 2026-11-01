import { useState } from 'react';
import type { Audience } from '../audience.js';
import { useI18n } from '../i18n/I18n.js';
import type { LiveValidation } from '../validation/useLiveValidation.js';
import { describe } from '../validation/messages.js';
import type { Problem } from '../validation/problems.js';

interface Props {
  audience: Audience;
  validation: LiveValidation;
  /** Problems on fields the user has touched (or all, after a download attempt). */
  visible: Problem[];
  labelFor: (key: string) => string;
  onGo: (key: string) => void;
}

/**
 * The compliance seal: one plain verdict on what the official rules say about this invoice right now. "Accepted under
 * XRechnung 3.0" only when the official rule sets actually ran on this exact invoice and found nothing (never claim
 * compliance, show it); otherwise how many problems remain, each a link to its field. Rule ids, rule-set versions and
 * the official wording sit in "Technical details" for accountants.
 */
export function Verdict({ audience, validation, visible, labelFor, onGo }: Props) {
  const { t, lang } = useI18n();
  const { problems, accepted, checking, ready, ruleSets } = validation;
  const [expanded, setExpanded] = useState(false);
  // Three at a time: the seal sits above the preview, and a long list would push the document off the screen.
  const shownList = expanded ? visible : visible.slice(0, 3);
  const allMissing = problems.length > 0 && problems.every((p) => p.kind === 'missing');
  // Calm until it matters: the seal turns to the problem colour only once a problem is actually shown (a field the
  // user left, or a download attempt). Before that it counts what is still needed, neutrally.
  const state = accepted && !checking ? 'ok' : !ready || (checking && problems.length === 0) ? 'checking' : problems.length ? (visible.length ? 'bad' : 'todo') : 'checking';

  return (
    <section className={`seal seal-${state}`} aria-live="polite" aria-labelledby="seal-title">
      <div className="seal-mark" aria-hidden="true">{state === 'ok' ? '✓' : state === 'bad' || state === 'todo' ? problems.length : '…'}</div>
      <div className="seal-body">
        <h2 id="seal-title" className="seal-title">
          {state === 'ok'
            ? t.verdict.ok(audience.standard)
            : state === 'checking'
              ? (ready ? t.verdict.checking : t.verdict.loadingRules)
              : allMissing ? t.verdict.incomplete(problems.length) : t.verdict.problems(problems.length)}
        </h2>
        <p className="seal-sub">{state === 'ok' ? t.verdict.okDetail : state === 'todo' ? t.verdict.startHint : audience.standard}</p>
        {state !== 'ok' && visible.length > 0 && (
          <ul className="seal-list">
            {shownList.map((p) => {
              const d = describe(p, lang);
              return (
                <li key={p.key}>
                  <button type="button" className="seal-link" onClick={() => onGo(p.key)}>
                    <span className="seal-field">{labelFor(p.key)}</span>
                    <span className="seal-text">{d.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {state !== 'ok' && visible.length > 3 && (
          <button type="button" className="btn btn-quiet seal-more" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
            {expanded ? t.verdict.showLess : t.verdict.showMore(visible.length - 3)}
          </button>
        )}
        {(ruleSets.length > 0 || problems.some((p) => p.ruleId)) && (
          <details className="seal-tech">
            <summary>{t.verdict.technical}</summary>
            {ruleSets.length > 0 && (
              <p>
                {t.verdict.ruleSets}: {ruleSets.map((r) => `${r.label} (${r.source})`).join(' · ')}
              </p>
            )}
            {problems.length > 0 && (
              <ul>
                {problems.map((p) => (
                  <li key={p.key}>
                    <code>{p.ruleId ?? p.key}</code> {labelFor(p.key)}{p.official && p.source !== 'input' ? `: ${p.official}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </details>
        )}
      </div>
    </section>
  );
}
