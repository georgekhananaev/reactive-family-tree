'use client';

/* What the panels have in common: asking the server, waiting for its answer, and changing something. */

import type { EditView, MembersInfo } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';

import { api, messageOf } from '@/lib/api';
import type { AppController } from '@/lib/app-context';

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
