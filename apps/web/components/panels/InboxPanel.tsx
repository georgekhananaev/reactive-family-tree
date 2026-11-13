'use client';

/*
 * The inbox: suggestions to decide, the viewer's own drafts and suggestions,
 * and what has happened to them. Also a person's history, with undo.
 */

import type { EditResult, EditView, NotificationView, Op } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { api } from '@/lib/api';
import type { AppController, PanelArgs } from '@/lib/app-context';
import { useApp } from '@/lib/app-context';
import { when } from '@/lib/format';

import type { PanelDef, PanelProps } from '../Drawer';
import { ConfirmButton } from '../ui';

import type { Retyped, Unticked } from './EditCard';
import { EditCard, adjusted, chosen } from './EditCard';
import { Loading, tryIt, useEdits } from './shared';

/*
 * The way from an edit to the first person it is about. For an edit about
 * nobody who is on the tree this is the number 0, as it was in the demo, and
 * a card that does not filter its buttons shows that 0.
 */
const showOnTree = (app: AppController, edit: EditView) => edit.touched.length > 0 && (
  <button key="show" type="button" className="small" onClick={() => { app.closePanel(); app.select(edit.touched[0], { fly: true }); }}>
    Show on tree
  </button>
);

/* Bring one edit into view once it is on the page: the one the panel was opened for. */
function useScrollTo(editId: PanelArgs['editId'], edits: EditView[] | undefined) {
  const reached = useRef<string | null>(null);
  useEffect(() => {
    if (!editId || reached.current === editId || !edits?.some((edit) => edit.id === editId)) return;
    reached.current = editId;
    document.querySelector(`#drawerBody [data-edit="${editId}"]`)?.scrollIntoView({ block: 'center' });
  }, [editId, edits]);
}

/* A line for saying something about an edit: a reviewer's question, or the author's answer. */
function CommentLine({ editId, placeholder, label }: { editId: string; placeholder: string; label: string }) {
  const app = useApp();
  const [body, setBody] = useState('');
  const send = () => tryIt(app, async () => {
    await api.post(`/api/edits/${editId}/comments`, { body });
    setBody('');
  });
  return (
    <div className="copy">
      <input type="text" placeholder={placeholder} value={body} onChange={(event) => setBody(event.target.value)} />
      <button type="button" className="small" onClick={send}>{label}</button>
    </div>
  );
}

/*
 * A suggestion with everything a reviewer can do to it. `retyped` is what the
 * reviewer has typed over it, or null while it is not being adjusted.
 */
function ReviewCard({ edit, retyped, onRetyped }: { edit: EditView; retyped: Retyped | null; onRetyped(retyped: Retyped | null): void }) {
  const app = useApp();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const noteInput = useRef<HTMLInputElement>(null);
  const review = (body: { action: 'approve'; ops?: Op[] } | { action: 'decline'; note: string }, done: string) =>
    tryIt(app, () => api.post<EditResult>(`/api/edits/${edit.id}/review`, body), done);

  // The first press of Decline asks why, the second sends it
  useEffect(() => {
    if (declining) noteInput.current?.focus();
  }, [declining]);

  return (
    <EditCard
      edit={edit}
      adjusting={retyped ? { value: retyped, onChange: onRetyped } : undefined}
      actions={[
        <button
          key="approve"
          type="button"
          className="primary"
          onClick={() => (retyped ? review({ action: 'approve', ops: adjusted(edit, retyped) }, 'Approved with your adjustments') : review({ action: 'approve' }, 'Approved. It is on the tree.'))}
        >
          {retyped ? 'Approve with these values' : 'Approve'}
        </button>,
        edit.lines.some((line) => line.fields.length) && (
          <button key="adjust" type="button" onClick={() => onRetyped(retyped ? null : {})}>
            {retyped ? 'Cancel adjusting' : 'Edit and approve'}
          </button>
        ),
        <button
          key="decline"
          type="button"
          className="danger"
          onClick={() => (declining ? void review({ action: 'decline', note }, 'Declined. The author has been told why.') : setDeclining(true))}
        >
          Decline
        </button>,
        showOnTree(app, edit),
      ]}
    >
      <input ref={noteInput} type="text" placeholder="Why? The author will see this" hidden={!declining} value={note} onChange={(event) => setNote(event.target.value)} />
      <CommentLine editId={edit.id} placeholder="Ask the author a question" label="Ask" />
    </EditCard>
  );
}

/* One of the viewer's own edits that is not history yet: a draft, to apply whole or in part. */
function DraftCard({ edit }: { edit: EditView }) {
  const app = useApp();
  const [unticked, setUnticked] = useState<Unticked>(new Set());
  const several = edit.lines.length > 1;
  const apply = (indexes: number[] | null) => tryIt(app, async () => {
    const result = await api.post<EditResult>(`/api/edits/${edit.id}/apply`, indexes ? { indexes } : {});
    // What is left of the draft starts out ticked again
    setUnticked(new Set());
    return result;
  }, (result) => `${result.status === 'applied' ? 'Applied to the tree' : 'Sent for review'}${result.remaining ? `. ${result.remaining} left in the draft.` : '.'}`);

  return (
    <EditCard
      edit={edit}
      selectable={several ? { value: unticked, onChange: setUnticked } : undefined}
      actions={[
        <button key="all" type="button" className="primary" onClick={() => apply(null)}>Apply all</button>,
        several && <button key="selected" type="button" onClick={() => apply(chosen(edit, unticked))}>Apply selected</button>,
        <ConfirmButton key="discard" label="Discard" sure="Really discard?" onConfirm={() => tryIt(app, () => api.post(`/api/edits/${edit.id}/discard`), 'Draft discarded')} className="danger" />,
        showOnTree(app, edit),
      ]}
    />
  );
}

/* One of the viewer's own edits that is not history yet: a suggestion, waiting or decided. */
function SentCard({ edit }: { edit: EditView }) {
  const app = useApp();
  const waiting = edit.status === 'suggested';
  return (
    <EditCard
      edit={edit}
      actions={[
        waiting && <ConfirmButton key="withdraw" label="Withdraw" sure="Really withdraw?" onConfirm={() => tryIt(app, () => api.post(`/api/edits/${edit.id}/withdraw`), 'Suggestion withdrawn')} />,
        showOnTree(app, edit),
      ].filter(Boolean)}
    >
      {waiting && edit.comments.length > 0 && <CommentLine editId={edit.id} placeholder="Reply" label="Send" />}
    </EditCard>
  );
}

/* A published edit, with Undo for those who may. */
export function ActivityCard({ edit }: { edit: EditView }) {
  const app = useApp();
  return (
    <EditCard
      edit={edit}
      actions={[
        edit.canRevert && <ConfirmButton key="undo" label="Undo" sure="Really undo?" onConfirm={() => tryIt(app, () => api.post(`/api/edits/${edit.id}/revert`), 'Undone')} className="small" />,
        showOnTree(app, edit),
      ].filter(Boolean)}
    />
  );
}

function Review({ editId }: { editId: PanelArgs['editId'] }) {
  const { data, error } = useEdits('review');
  // One suggestion at a time is being adjusted
  const [adjusting, setAdjusting] = useState<{ id: string; retyped: Retyped } | null>(null);
  useScrollTo(editId, data?.edits);
  if (!data) return <Loading error={error} />;
  if (!data.edits.length) return <p className="empty">Nothing is waiting for you. Suggestions for your branches will appear here.</p>;
  return data.edits.map((edit) => (
    <ReviewCard
      key={edit.id}
      edit={edit}
      retyped={adjusting?.id === edit.id ? adjusting.retyped : null}
      onRetyped={(retyped) => setAdjusting(retyped && { id: edit.id, retyped })}
    />
  ));
}

function Mine({ editId }: { editId: PanelArgs['editId'] }) {
  const { data, error } = useEdits('mine');
  useScrollTo(editId, data?.edits);
  if (!data) return <Loading error={error} />;
  if (!data.edits.length) return <p className="empty">Your drafts and suggestions will appear here. Tap a fact on someone’s card to suggest a fix.</p>;
  return data.edits.map((edit) => (edit.status === 'draft' ? <DraftCard key={edit.id} edit={edit} /> : <SentCard key={edit.id} edit={edit} />));
}

function News() {
  const app = useApp();
  const { data, error } = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ notifications: NotificationView[] }>('/api/notifications') });
  const { unread } = app.session.counts;
  const shown = data !== undefined;
  const refresh = useEffectEvent(() => app.refresh());

  // Once the news has been shown it counts as read
  useEffect(() => {
    // If marking them read fails, they stay unread and the next look tries again
    if (shown && unread) void api.post('/api/notifications/read').then(() => refresh(), () => {});
  }, [shown, unread]);

  if (!data) return <Loading error={error} />;
  if (!data.notifications.length) return <p className="empty">Nothing new.</p>;
  return data.notifications.map((item) => (
    <div key={item.id} className="row">
      <div className="main">
        <strong>{item.body}</strong>
        <small>{when(item.at)}</small>
      </div>
    </div>
  ));
}

function InboxBody({ args }: PanelProps) {
  if (args.tab === 'news') return <News />;
  if (args.tab === 'review') return <Review editId={args.editId} />;
  return <Mine editId={args.editId} />;
}

function HistoryBody({ args }: PanelProps) {
  const { data, error } = useEdits('activity', args.personId);
  if (!data) return <Loading error={error} />;
  if (!data.edits.length) return <p className="empty">No changes recorded yet.</p>;
  return data.edits.map((edit) => <ActivityCard key={edit.id} edit={edit} />);
}

type Tab = readonly [string, string];

export const inbox: PanelDef = {
  title: () => 'Inbox',
  tabs(app) {
    const { counts, user } = app.session;
    const review: Tab = ['review', `To review${counts.review ? ` (${counts.review})` : ''}`];
    const mine: Tab = ['mine', `Mine${counts.drafts ? ` (${counts.drafts})` : ''}`];
    const news: Tab = ['news', `News${counts.unread ? ` (${counts.unread})` : ''}`];
    return counts.review || app.isAdmin || user?.anchors.length ? [review, mine, news] : [mine, news];
  },
  Body: InboxBody,
};

export const history: PanelDef = {
  title: (args) => `History of ${args.name}`,
  Body: HistoryBody,
};
