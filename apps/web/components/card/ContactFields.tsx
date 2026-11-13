'use client';

import type { Contact } from '@reactive-family-tree/core';

import { Field } from '../ui';

/* Name and email, asked of a visitor so the family can reach them. */
export function ContactFields({ value, onChange }: { value: Contact; onChange(value: Contact): void }) {
  return (
    <>
      <Field label="Your name">
        <input type="text" autoComplete="name" value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
      </Field>
      <Field label="Your email">
        <input type="email" autoComplete="email" value={value.email} onChange={(event) => onChange({ ...value, email: event.target.value })} />
      </Field>
    </>
  );
}
