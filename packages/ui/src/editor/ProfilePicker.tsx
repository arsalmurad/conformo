import { useState } from 'react';
import type { Party } from '@verinvoice/core';
import type { PartyProfile } from '../profiles/types.js';
import { newProfileId } from '../profiles/types.js';

interface Props {
  party: Party;
  profiles: PartyProfile[];
  onLoad: (party: Party) => void;
  onSave: (profile: PartyProfile) => void;
  onDelete: (id: string) => void;
}

/** The "seller/buyer profiles as saved entities" hard requirement: a picker
 * to load a previously-saved party into the form, and a one-click save of
 * whatever's currently filled in. Profiles are encrypted alongside the
 * invoice draft (see state/useInvoiceDraft.ts) — there's no separate
 * passphrase or storage location for the address book. */
export function ProfilePicker({ party, profiles, onLoad, onSave, onDelete }: Props) {
  const [selected, setSelected] = useState('');

  return (
    <div className="profile-picker">
      <select
        value={selected}
        onChange={(e) => {
          const id = e.target.value;
          setSelected(id);
          const profile = profiles.find((p) => p.id === id);
          if (profile) onLoad(profile.party);
        }}
      >
        <option value="">Load a saved profile…</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!party.name}
        onClick={() => {
          const existing = profiles.find((p) => p.id === selected);
          onSave({ id: existing?.id ?? newProfileId(), label: party.name, party });
          if (!existing) setSelected('');
        }}
      >
        {profiles.some((p) => p.id === selected) ? 'Update profile' : 'Save as profile'}
      </button>
      {selected && (
        <button
          type="button"
          className="profile-delete"
          onClick={() => {
            onDelete(selected);
            setSelected('');
          }}
        >
          Delete
        </button>
      )}
    </div>
  );
}
