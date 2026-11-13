'use client';

/*
 * One edit, shown the same way everywhere: in the review inbox, in a person's
 * history, in a draft from an AI. Plain sentences, each change as before and after.
 */

import { parseDate } from '@reactive-family-tree/core';
import type { EditLineField, EditStatus, EditView, Op } from '@reactive-family-tree/core';
import type { ReactNode } from 'react';

import { when } from '@/lib/format';

const FIELD_LABELS: Readonly<Record<string, string | undefined>> = {
  given: 'Given name', family: 'Family name', birthName: 'Born as', sex: 'Sex', living: 'Living', bio: 'Story', privacy: 'Privacy',
  date: 'Date', place: 'Place', value: 'Detail', note: 'Note', certainty: 'Certainty', since: 'Since', status: 'Status', kind: 'Kind', host: 'Drawn with',
};
const STATUS_LABELS: Readonly<Record<EditStatus, string>> = { draft: 'Draft', suggested: 'Waiting for review', declined: 'Declined', withdrawn: 'Withdrawn', reverted: 'Undone', applied: '' };
/* Fields a reviewer can retype before approving. The rest are choices, not text. */
const ADJUSTABLE = new Set(['given', 'family', 'birthName', 'bio', 'date', 'place', 'value', 'note']);

/* Something the card shows and lets its reader change. Whoever uses the card keeps it. */
interface Held<Value> {
  value: Value;
  onChange(value: Value): void;
}

/* The changes of a draft that are not ticked, by their place in the edit. */
export type Unticked = ReadonlySet<number>;
/* What a reviewer has typed in place of the suggested values, by change and field: { '0.given': 'Anna' }. */
export type Retyped = Readonly<Record<string, string | undefined>>;

const retypedKey = (index: number, field: string) => `${index}.${field}`;

/* The ticked changes of a draft. */
export const chosen = (edit: EditView, unticked: Unticked): number[] => edit.lines.map((_, index) => index).filter((index) => !unticked.has(index));

/* The changes of a suggestion with the reviewer's values. */
export function adjusted(edit: EditView, retyped: Retyped): Op[] {
  const ops = structuredClone(edit.ops ?? []);
  edit.lines.forEach((line, index) => {
    const op = ops[index];
    if (!op || !('set' in op) || !op.set) return;
    const set: Record<string, unknown> = op.set;
    for (const change of line.fields) {
      if (!ADJUSTABLE.has(change.field)) continue;
      const value = retyped[retypedKey(index, change.field)] ?? change.to;
      set[change.field] = change.field === 'date' ? parseDate(value) : value.trim();
    }
  });
  return ops;
}

function flipped(unticked: Unticked, index: number): Unticked {
  const next = new Set(unticked);
  if (!next.delete(index)) next.add(index);
  return next;
}

/* One field of a change: what it was, what it becomes, and what it is now if something else changed it meanwhile. */
function Change({ change, retype }: { change: EditLineField; retype?: Held<string> }) {
  return (
    <>
      <span className="field">{FIELD_LABELS[change.field] ?? change.field}</span>
      <span>
        {change.was !== undefined && <span className="was">{change.was || 'empty'}</span>}
        {change.was !== undefined && ' '}
        {retype ? <input type="text" value={retype.value} onChange={(event) => retype.onChange(event.target.value)} /> : <span className="to">{change.to || 'empty'}</span>}
        {change.now !== undefined && <span className="now">{` (is now ${change.now || 'empty'})`}</span>}
      </span>
    </>
  );
}

/*
 * options:
 *   selectable  show a checkbox per change (for applying part of a draft)
 *   adjusting   let the reviewer retype values before approving
 *   actions     buttons for the foot of the card
 *   children    what comes under the buttons
 * `selectable` holds the changes that are not ticked, and `adjusting` what the
 * reviewer has typed. `chosen()` gives the ticked changes, and `adjusted()`
 * the changes with the reviewer's values.
 */
export function EditCard({ edit, selectable, adjusting, actions = [], children }: {
  edit: EditView;
  selectable?: Held<Unticked>;
  adjusting?: Held<Retyped>;
  actions?: ReactNode[];
  children?: ReactNode;
}) {
  const fromAi = edit.origin === 'mcp';
  const status = STATUS_LABELS[edit.status];

  return (
    <article className={`edit${edit.status === 'suggested' || edit.status === 'draft' ? ' waiting' : ''}`} data-edit={edit.id}>
      <header>
        <strong>{edit.message || 'An edit'}</strong>
        <small>{when(edit.appliedAt ?? edit.createdAt)}</small>
      </header>
      <p className="by">
        {`${edit.author}${edit.byVisitor ? ' (a visitor)' : ''} `}
        {fromAi && <span className="status ai">{`with AI${edit.client ? `, ${edit.client}` : ''}`}</span>}{' '}
        {status && <span className="status">{status}</span>}
        {edit.reviewedBy && edit.status === 'applied' && ` Approved by ${edit.reviewedBy}.`}
      </p>
      {edit.note && <p className="note">{edit.note}</p>}
      <ul>
        {edit.lines.map((line, index) => (
          <li key={index}>
            {selectable ? (
              <label className="check">
                <input type="checkbox" checked={!selectable.value.has(index)} onChange={() => selectable.onChange(flipped(selectable.value, index))} />
                {line.text}
              </label>
            ) : line.text}
            {line.fields.length ? (
              <div className="change">
                {line.fields.map((change) => {
                  const key = retypedKey(index, change.field);
                  const retype = adjusting && ADJUSTABLE.has(change.field)
                    ? { value: adjusting.value[key] ?? change.to, onChange: (value: string) => adjusting.onChange({ ...adjusting.value, [key]: value }) }
                    : undefined;
                  return <Change key={change.field} change={change} retype={retype} />;
                })}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {edit.warnings.map((warning, index) => <p key={index} className="warning">{warning.message}</p>)}
      {edit.status === 'declined' && edit.reviewNote && <p className="note">{`${edit.reviewedBy}: ${edit.reviewNote}`}</p>}
      {edit.comments.map((comment, index) => (
        <p key={index} className="comment">
          <b>{`${comment.author}: `}</b>
          {comment.body}
        </p>
      ))}
      {actions.length ? <div className="form-actions">{actions}</div> : null}
      {children}
    </article>
  );
}
