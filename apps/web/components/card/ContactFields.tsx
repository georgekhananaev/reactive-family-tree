'use client';

import type { Contact } from '@reactive-family-tree/core';
import type { ReactNode } from 'react';

import { useT } from '@/lib/i18n';

import { Field } from '../ui';

/* Name and email, asked of a visitor so the family can reach them. `check` is where the check that a person is asking shows itself, on an install that has one. */
export function ContactFields({ value, onChange, check }: { value: Contact; onChange(value: Contact): void; check: ReactNode }) {
  const { t } = useT();
  return (
    <>
      <Field label={t('Your name')}>
        <input type="text" autoComplete="name" dir="auto" value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
      </Field>
      <Field label={t('Your email')}>
        <input type="email" autoComplete="email" value={value.email} onChange={(event) => onChange({ ...value, email: event.target.value })} />
      </Field>
      {check}
    </>
  );
}
