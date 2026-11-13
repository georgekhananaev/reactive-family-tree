'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

import { messageOf } from '@/lib/api';

/*
 * A form in the card. Enter saves, the button shows that it is saving and
 * cannot be pressed twice, and a refusal is shown beside it. `onSave` throws
 * whatever should be shown. What is typed counts as unsaved until then.
 */
export function CardForm({ saveLabel, onSave, onDirty, small = false, onCancel, more, children }: {
  saveLabel: string;
  onSave(): Promise<void>;
  /* Something in the form was typed or chosen. */
  onDirty(): void;
  small?: boolean;
  onCancel?(): void;
  /* One more action beside Save and Cancel. */
  more?: ReactNode;
  children: ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');
  return (
    <form
      noValidate
      onInput={onDirty}
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving) return;
        setProblem('');
        setSaving(true);
        try {
          await onSave();
        } catch (error) {
          setProblem(messageOf(error));
        } finally {
          setSaving(false);
        }
      }}
    >
      {children}
      <p className="warning" role="alert" hidden={!problem} ref={(node) => { if (node && problem) node.scrollIntoView({ block: 'nearest' }); }}>{problem}</p>
      <div className="form-actions">
        <button type="submit" className={small ? 'small' : 'primary'} disabled={saving}>{saving ? 'Saving…' : saveLabel}</button>
        {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
        {more}
      </div>
    </form>
  );
}
