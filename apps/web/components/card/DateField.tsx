'use client';

import { formatDate, parseDate } from '@reactive-family-tree/core';

/* A date box that says back how it was understood, so "abt 1890" is seen to mean "about 1890". */
export function DateField({ label, value, onChange, placeholder, hidden = false }: {
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  hidden?: boolean;
}) {
  const date = parseDate(value);
  const spoken = date && date.kind !== 'text' ? formatDate(date) : '';
  const reads = !date || spoken === value.trim() ? '' : spoken ? `Read as ${spoken}` : 'Not read as a date. Kept as you wrote it.';
  return (
    <label hidden={hidden}>
      {label}
      <input type="text" autoComplete="off" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      <small className="reads">{reads}</small>
    </label>
  );
}
