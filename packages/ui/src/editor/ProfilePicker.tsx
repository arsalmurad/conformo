import { useId, useState } from 'react';
import type { Party } from '@conformo/core';
import type { PartyProfile } from '../profiles/types.js';
import { newProfileId } from '../profiles/types.js';
import { useI18n } from '../i18n/I18n.js';

interface Props {
  party: Party;
  profiles: PartyProfile[];
  onLoad: (party: Party) => void;
  onSave: (profile: PartyProfile) => void;
  onDelete: (id: string) => void;
  /** e.g. "Your business": names the picker for screen readers. */
  sectionLabel: string;
}

/** Saved businesses and customers, kept in the same encrypted draft as the invoice (state/useInvoiceDraft.ts). A
 * compact row in the section header, not a block above the fields. */
export function ProfilePicker({ party, profiles, onLoad, onSave, onDelete, sectionLabel }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState('');
  const id = useId();
  const existing = profiles.find((p) => p.id === selected);

  return (
    <div className="profile-picker">
      {profiles.length > 0 && (
        <>
          <label htmlFor={id} className="visually-hidden">{`${sectionLabel}: ${t.actions.loadProfile}`}</label>
          <select
            id={id}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              const profile = profiles.find((p) => p.id === e.target.value);
              if (profile) onLoad(profile.party);
            }}
          >
            <option value="">{t.actions.loadProfile}</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </>
      )}
      <button
        type="button"
        className="btn btn-quiet"
        disabled={!party.name}
        onClick={() => {
          onSave({ id: existing?.id ?? newProfileId(), label: party.name, party });
          if (!existing) setSelected('');
        }}
      >
        {existing ? t.actions.updateProfile : t.actions.saveProfile}
      </button>
      {existing && (
        <button type="button" className="btn btn-quiet" onClick={() => { onDelete(existing.id); setSelected(''); }}>
          {t.actions.deleteProfile}
        </button>
      )}
    </div>
  );
}
