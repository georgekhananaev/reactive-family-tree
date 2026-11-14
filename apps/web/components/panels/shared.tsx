'use client';

/* What the panels have in common: asking the server, waiting for its answer, changing something, and saying it in the reader's words. */

import type { AdminSettings, EditView, MembersInfo } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';

import { api, messageOf } from '@/lib/api';
import type { AppController } from '@/lib/app-context';
import { when } from '@/lib/format';
import { useT } from '@/lib/i18n';
import type { WebPhrase } from '@/lib/i18n';

/* The page's `t`, for the helpers that are not components. */
export type Say = ReturnType<typeof useT>['t'];


/* Choices for a list, with their words in the reader's language. */
export const inWords = <Value extends string>(t: Say, options: readonly (readonly [Value, WebPhrase])[]) => options.map(([value, label]) => [value, t(label)] as const);

/* When something happened, the way the reader's language says it: "today, 14:05" or "3 Nov 2026". */
export function useWhen(): (isoTime: string | null | undefined) => string {
  const { lang, t } = useT();
  return (isoTime) => when(isoTime, lang, (time) => t('today, {time}', { time }));
}

/* One list of edits: those to review, the viewer's own, or what has been published (about one person, if given). */
export function useEdits(which: 'review' | 'mine' | 'activity', personId?: string) {
  return useQuery({
    queryKey: ['edits', which, personId ?? null],
    queryFn: () => api.get<{ edits: EditView[] }>(`/api/edits?which=${which}${personId ? `&person=${personId}` : ''}`),
  });
}

export function useMembers() {
  return useQuery({ queryKey: ['members'], queryFn: () => api.get<MembersInfo>('/api/members') });
}

/* Until the server has answered, a panel shows nothing. If it could not answer, the panel says why. */
export function Loading({ error }: { error: unknown }) {
  return error ? <p className="empty">{messageOf(error)}</p> : null;
}

/* A tick box with its words beside it, as wide as the form it is in. */
export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange(checked: boolean): void }) {
  return (
    <label className="check wide">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

/*
 * Run something that changes the family, say how it went, and draw everything
 * again. Gives back the server's answer, or null if it went wrong.
 */
/*
 * Save the settings a tab has changed, and say so: only what differs from `current` is sent. Says when nothing changed.
 * True once something is saved.
 */
export async function saveSettings(app: AppController, t: Say, read: AdminSettings, current: AdminSettings): Promise<boolean> {
  // Object.entries gives the names back as plain strings
  const patch = Object.fromEntries(Object.entries(read).filter(([key, value]) => value !== current[key as keyof AdminSettings]));
  if (!Object.keys(patch).length) {
    app.toast(t('Nothing changed'));
    return false;
  }
  return (await tryIt(app, () => api.patch<{ ok: boolean }>('/api/settings', patch), t('Settings saved'))) !== null;
}

export async function tryIt<Result>(app: AppController, work: () => Promise<Result>, done?: string | ((result: Result) => string)): Promise<Result | null> {
  try {
    const result = await work();
    if (done) app.toast(typeof done === 'function' ? done(result) : done);
    await app.refresh();
    return result;
  } catch (error) {
    app.fail(error);
    return null;
  }
}
