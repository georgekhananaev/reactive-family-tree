'use client';

import type { ToastOptions } from '@/lib/app-context';

export interface Toast extends ToastOptions {
  id: number;
  message: string;
  leaving: boolean;
}

/* Short messages at the bottom, each optionally with one action such as Undo. */
export function Toasts({ toasts, onAction }: { toasts: Toast[]; onAction(toast: Toast): void }) {
  return (
    <div id="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={['toast', toast.bad && 'bad', toast.leaving && 'leaving'].filter(Boolean).join(' ')} role={toast.bad ? 'alert' : 'status'}>
          <span>{toast.message}</span>
          {toast.action && <button type="button" onClick={() => onAction(toast)}>{toast.action}</button>}
        </div>
      ))}
    </div>
  );
}
