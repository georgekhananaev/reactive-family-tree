'use client';

/* Small pieces every form and panel is built from. Plain on purpose: the tree is the one bold thing. */

import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';

import { useT } from '@/lib/i18n';

/* A labelled control. */
export function Field({ label, wide = false, hidden = false, children }: { label: string; wide?: boolean; hidden?: boolean; children: ReactNode }) {
  return (
    <label className={wide ? 'wide' : undefined} hidden={hidden}>
      {label}
      {children}
    </label>
  );
}

export function Select<Value extends string>({
  options,
  value,
  onChange,
  ...rest
}: { options: readonly (readonly [Value, string])[]; value: Value; onChange(value: Value): void } & Omit<ComponentProps<'select'>, 'value' | 'onChange'>) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as Value)} {...rest}>
      {options.map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}

/* A value with a button that copies it. */
export function CopyRow({ value }: { value: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // No clipboard here (an insecure address, or an old browser): select it so it can be copied by hand
      input.current?.select();
    }
    setCopied(true);
  };
  return (
    <div className="copy">
      <input ref={input} type="text" readOnly value={value} onFocus={(event) => event.target.select()} />
      <button type="button" className="small" onClick={copy}>
        {copied ? t('Copied') : t('Copy')}
      </button>
    </div>
  );
}

/* A button that asks once more before doing something that is hard to take back. */
export function ConfirmButton({ label, sure, onConfirm, className }: { label: string; sure: string; onConfirm(): void; className?: string }) {
  const [armed, setArmed] = useState(false);
  // Confirmed once for each time it is armed: a press too many does not do the thing again
  const done = useRef(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  const press = () => {
    if (!armed) {
      done.current = false;
      setArmed(true);
    } else if (!done.current) {
      done.current = true;
      onConfirm();
    }
  };
  return (
    <button type="button" className={className} onClick={press}>
      {armed ? sure : label}
    </button>
  );
}

/* Read a file the person picks, as text. */
export function pickFile(accept: string, onText: (text: string, name: string) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.hidden = true;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (file) onText(await file.text(), file.name);
    input.remove();
  });
  document.body.append(input);
  input.click();
}

/* Arrow keys move through a list of buttons, Home and End jump to its ends. Returns true if the key was used. */
export function arrowThrough(event: { key: string; preventDefault(): void }, buttons: HTMLElement[]): boolean {
  const moves: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
  const at = buttons.indexOf(document.activeElement as HTMLElement);
  let next: HTMLElement | undefined;
  if (event.key in moves) next = buttons[(at + (moves[event.key] ?? 0) + buttons.length) % buttons.length];
  else if (event.key === 'Home') next = buttons[0];
  else if (event.key === 'End') next = buttons[buttons.length - 1];
  if (!next) return false;
  event.preventDefault();
  next.focus();
  return true;
}
