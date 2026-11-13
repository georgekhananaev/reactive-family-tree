'use client';

/*
 * The person card. It grows out of the tapped leaf and is where one person is
 * read, edited, corrected, and given relatives. On a phone it is a sheet that
 * can be pulled taller or flicked away.
 */

import { describeKinship } from '@reactive-family-tree/core';
import type { EditView, Op, PersonDetail, Relation, Relationship, TreePerson } from '@reactive-family-tree/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode, Ref } from 'react';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import type { CardMode } from '@/lib/app-context';
import { displayName, lifespan, when } from '@/lib/format';
import { usePresence } from '@/lib/hooks';

import { AddForm } from './card/AddForm';
import { CardForm } from './card/CardForm';
import { CardHead } from './card/CardHead';
import { EditForm } from './card/EditForm';
import { Icon } from './Icon';

const CLOSE_MS = 260;
const PHONE = '(max-width: 640px)';

export interface CardTarget {
  person: TreePerson;
  mode: CardMode;
  relation?: Relation;
}

export interface CardHandle {
  /*
   * Run `go` once it is fine to move on. Typing that has not been saved is not
   * thrown away silently: the card asks first. `force` skips the question.
   */
  leave(go: () => void, force?: boolean): void;
  /* Put the card beside its leaf again, after the tree has moved. */
  place(): void;
}

/* What the card is showing: a person, and everything that was fetched about them. */
interface Shown {
  target: CardTarget;
  detail: PersonDetail | null;
  /* What this person is to the viewer, in a word or two. */
  kin: string | null;
  pendingEdit: EditView | null;
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function PersonCard({ target, onSwitch, ref }: {
  target: CardTarget | null;
  /* Go to another way of showing the same person: reading, editing, adding a relative. */
  onSwitch(mode: CardMode, relation?: Relation): void;
  ref: Ref<CardHandle>;
}) {
  const app = useApp();
  const el = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);            // something typed here has not been saved
  const returnTo = useRef<Element | null>(null);
  const [asking, setAsking] = useState<(() => void) | null>(null);
  const [settled, setSettled] = useState(false);
  const [tall, setTall] = useState(false);

  /* ---------- What to show ---------- */

  const person = target?.person ?? null;
  const personId = person?.id ?? null;
  const full = Boolean(person && !person.masked && !person.pending);
  const pendingEditId = person && !person.masked ? person.pending?.editId ?? null : null;
  const me = app.session.user?.personId ?? null;

  const detail = useQuery({
    queryKey: ['person', personId],
    queryFn: () => api.get<PersonDetail>(`/api/people/${personId}`),
    enabled: full,
    placeholderData: keepPreviousData,
  });
  const related = useQuery({
    queryKey: ['relationship', me, personId],
    queryFn: () => api.get<Relationship>(`/api/relationship?from=${me}&to=${personId}`),
    enabled: full && Boolean(me) && me !== personId && app.people.has(me ?? ''),
    retry: false,
  });
  const pendingEdit = useQuery({
    queryKey: ['edit', pendingEditId],
    queryFn: () => api.get<EditView>(`/api/edits/${pendingEditId}`),
    enabled: Boolean(pendingEditId),
    retry: false,
  });

  // Until the new person has loaded, what is still showing stays, steps back and cannot be pressed
  const [shown, setShown] = useState<Shown | null>(null);
  let ready: Shown | null = null;
  if (target && person) {
    const kin = related.data?.connected ? describeKinship(related.data.steps) ?? 'related to you' : null;
    if (person.masked) ready = { target, detail: null, kin: null, pendingEdit: null };
    else if (person.pending) ready = pendingEdit.isPending ? null : { target, detail: null, kin: null, pendingEdit: pendingEdit.data ?? null };
    else if (detail.data && detail.data.id === personId && (!related.isEnabled || !related.isPending)) ready = { target, detail: detail.data, kin, pendingEdit: null };
  }
  const changed = ready && (ready.target !== shown?.target || ready.detail !== shown?.detail || ready.kin !== shown?.kin || ready.pendingEdit !== shown?.pendingEdit);
  if (changed) setShown(ready);
  if (!target && shown) setShown(null);
  const loading = Boolean(target && shown && !ready);

  const failed = full && detail.isError ? detail.error : null;
  useEffect(() => {
    if (!failed) return;
    app.fail(failed);
    app.select(null, { force: true });
  }, [failed, app]);

  const { present, shown: opened } = usePresence(shown !== null, CLOSE_MS);
  // While it closes there is nothing to show any more, so the last content stays drawn
  const last = useRef(shown);
  if (shown) last.current = shown;
  const drawn = present ? last.current : null;

  /* ---------- Placing ---------- */

  /*
   * Beside the leaf on a wide screen, on the side away from the trunk so it
   * hangs off the outside of the tree and not across its middle. It follows
   * the leaf when the tree moves. On a phone it is a sheet, and with `reveal`
   * the tree moves so the leaf stays in view above it.
   */
  const place = (reveal = false) => {
    const card = el.current, view = app.view, who = last.current?.target.person;
    if (!card || !view || !who || card.hidden) return;
    const leaf = view.leafRect(who.id);
    if (!leaf) return;
    if (matchMedia(PHONE).matches) {
      card.style.left = card.style.top = card.style.transformOrigin = '';
      if (!reveal) return;
      const dy = Math.min(0, card.offsetTop - 16 - leaf.bottom);
      const dx = leaf.left < 12 ? 12 - leaf.left : leaf.right > innerWidth - 12 ? innerWidth - 12 - leaf.right : 0;
      if (dx || dy) view.panBy(dx, dy);
      return;
    }
    const free = view.freeWidth, width = card.offsetWidth, height = card.offsetHeight;
    const cx = leaf.left + leaf.width / 2, cy = leaf.top + leaf.height / 2;
    const gap = view.editing ? 150 : 44;        // in edit mode the + buds around the leaf stay uncovered
    const sides = { left: cx - gap - width, right: cx + gap };
    const fits = (x: number) => x >= 12 && x + width <= free - 12;
    const outward = cx < view.trunkX ? 'left' : 'right', inward = outward === 'left' ? 'right' : 'left';
    const left = Math.max(12, Math.min(free - width - 12, fits(sides[outward]) || !fits(sides[inward]) ? sides[outward] : sides[inward]));
    const top = Math.max(76, Math.min(innerHeight - height - 92, cy - height / 2));
    Object.assign(card.style, { left: `${left}px`, top: `${top}px`, transformOrigin: `${cx - left}px ${cy - top}px` });
  };

  const shownKey = shown ? `${shown.target.person.id}:${shown.target.mode}:${shown.target.relation ?? ''}` : null;
  useLayoutEffect(() => {
    if (!shownKey) return;
    place(true);
    // Placed again whenever what is shown changes
  }, [shownKey]);

  useEffect(() => {
    if (shown) {
      // From here on, following its leaf is a glide and not a jump
      const frame = requestAnimationFrame(() => setSettled(true));
      return () => cancelAnimationFrame(frame);
    }
    setSettled(false);
    setTall(false);
    setAsking(null);
    dirty.current = false;
  }, [shown !== null]); // only when the card appears or goes

  useEffect(() => {
    if (!present && el.current) el.current.style.transform = '';
  }, [present]);

  /* ---------- The keyboard ---------- */

  // Opened from the keyboard: the keyboard moves into the card, and goes back to the leaf afterwards
  const cameFromKeys = useRef(false);
  useLayoutEffect(() => {
    const active = document.activeElement;
    cameFromKeys.current = Boolean(personId && active?.matches('.leaf-node:focus-visible'));
    if (cameFromKeys.current) returnTo.current = active;
  }, [personId]);
  useEffect(() => {
    if (shownKey && cameFromKeys.current) {
      cameFromKeys.current = false;
      el.current?.focus({ preventScroll: true });
    }
  }, [shownKey]);
  useEffect(() => {
    if (shown || !el.current?.contains(document.activeElement)) return;
    // The keyboard goes back to the leaf it came from, or to the tree if that leaf has been redrawn
    const back = returnTo.current;
    if (back instanceof SVGElement && back.isConnected) back.focus({ preventScroll: true });
    else app.view?.focus();
  }, [shown, app.view]);

  useImperativeHandle(ref, () => ({
    leave(go, force = false) {
      if (force || !dirty.current) {
        dirty.current = false;
        setAsking(null);
        go();
        return;
      }
      setAsking(() => go);
    },
    place: () => place(),
  }));

  /* ---------- On a phone the card is a sheet: pull it up to read more, down to put it away ---------- */

  const drag = useRef<{ y: number; dy: number; at: number; onGrab: boolean } | null>(null);
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const from = event.target as Element;
    if (!matchMedia(PHONE).matches || !from.closest('.card-grab, .head') || from.closest('button')) return;
    drag.current = { y: event.clientY, dy: 0, at: performance.now(), onGrab: Boolean(from.closest('.card-grab')) };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.style.transition = 'none';
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const held = drag.current;
    if (!held) return;
    held.dy = event.clientY - held.y;
    // Pulled up it resists: the sheet grows when let go, it does not chase the finger
    event.currentTarget.style.transform = `translateY(${held.dy > 0 ? held.dy : held.dy / 4}px)`;
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const held = drag.current;
    if (!held) return;
    const card = event.currentTarget;
    const flicked = Math.abs(held.dy) > 24 && performance.now() - held.at < 220;
    drag.current = null;
    card.style.transition = card.style.transform = '';
    if (Math.abs(held.dy) < 6) { if (held.onGrab) setTall((was) => !was); return; }
    if (held.dy < -40 || (flicked && held.dy < 0)) return setTall(true);
    if (held.dy < 70 && !flicked) return;
    if (tall) return setTall(false);
    // Gone, unless there was unsaved typing and the card stays to ask about it
    const willAsk = dirty.current;
    app.select(null);
    if (!willAsk) card.style.transform = 'translateY(110%)';
  };

  /* ---------- Drawing ---------- */

  const setDirty = (value: boolean) => { dirty.current = value; };
  /* After a save: show the person again, as they now are. */
  const saved = () => {
    dirty.current = false;
    onSwitch('view');
  };

  let content: ReactNode = null;
  if (drawn) {
    const { target: at, detail: d, kin } = drawn;
    if (at.person.masked) content = <MaskedView person={at.person} />;
    else if (at.person.pending) content = <PendingView person={at.person} edit={drawn.pendingEdit} />;
    else if (d && at.mode === 'edit') content = <EditForm person={at.person} detail={d} onDirty={setDirty} onDone={saved} onCancel={saved} />;
    else if (d && at.mode === 'add' && at.relation) content = <AddForm person={at.person} detail={d} relation={at.relation} onDirty={setDirty} onDone={saved} onCancel={saved} />;
    else if (d) content = <PersonView person={at.person} detail={d} kin={kin} onSwitch={onSwitch} onDirty={setDirty} />;
  }

  const classes = [opened && 'open', settled && 'settled', tall && 'tall', loading && 'loading'].filter(Boolean).join(' ');
  return (
    <div
      ref={el}
      id="card"
      role="dialog"
      aria-label={drawn ? displayName(drawn.target.person) : 'Person'}
      tabIndex={-1}
      className={classes || undefined}
      hidden={!present}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="card-grab" aria-hidden="true" />
      <button type="button" className="close" aria-label="Close" onClick={() => app.select(null)}>×</button>
      <div ref={body} key={drawn ? `${drawn.target.person.id}:${drawn.target.mode}:${drawn.target.relation ?? ''}` : 'empty'} className="card-body swap">
        {content}
      </div>
      {asking && (
        <div className="card-ask" role="alertdialog" aria-label="Unsaved changes">
          <span>Leave without saving?</span>
          <button type="button" className="small" autoFocus onClick={() => setAsking(null)}>Keep editing</button>
          <button type="button" className="small danger" onClick={() => { dirty.current = false; const go = asking; setAsking(null); go(); }}>Discard</button>
        </div>
      )}
    </div>
  );
}

/* ---------- The parts ---------- */

function MaskedView({ person }: { person: TreePerson }) {
  const app = useApp();
  return (
    <>
      <CardHead person={person} name={displayName(person)} lines={['Details are private']} />
      <p className="hint-line">Living people are shown only to relatives who sign in.</p>
      {!app.session.user && (
        <div className="form-actions">
          <button type="button" className="primary" onClick={() => app.openPanel('signin')}>Sign in</button>
        </div>
      )}
    </>
  );
}

/* Someone who is only suggested or drafted so far. */
function PendingView({ person, edit }: { person: TreePerson; edit: EditView | null }) {
  const app = useApp();
  if (person.masked || !person.pending) return null;
  const draft = person.pending.status === 'draft';
  const lines = [person.born ? `born ${person.born}` : '', draft ? 'A draft, not on the tree yet' : `Suggested by ${person.pending.by}`].filter(Boolean);
  const editId = person.pending.editId;
  return (
    <>
      <CardHead person={person} name={displayName(person)} bornAs={person.birthName} lines={lines} />
      {edit?.note && <p className="pencil">{edit.note}</p>}
      <p className="hint-line">{draft ? 'Only you can see this until you apply it.' : 'Waiting for a steward or admin to decide.'}</p>
      <div className="form-actions">
        <button type="button" className="primary" onClick={() => app.openPanel('inbox', { tab: draft || !edit?.canReview ? 'mine' : 'review', editId })}>
          {draft ? 'Review the draft' : edit?.canReview ? 'Review it' : 'See the suggestion'}
        </button>
      </div>
    </>
  );
}

function PersonView({ person, detail: d, kin, onSwitch, onDirty }: {
  person: TreePerson;
  detail: PersonDetail;
  kin: string | null;
  onSwitch(mode: CardMode, relation?: Relation): void;
  onDirty(dirty: boolean): void;
}) {
  const app = useApp();
  // The branch may be folded or shown from here, and the button has to say which it is now
  const [, redraw] = useState(0);
  const birth = d.facts.find((fact) => fact.type === 'birth');
  const death = d.facts.find((fact) => fact.type === 'death');
  const life = [birth?.dateText && `born ${birth.dateText}`, death?.dateText && `died ${death.dateText}`].filter(Boolean).join(', ') || lifespan(d);
  const others = d.facts.filter((fact) => fact.type !== 'birth' && fact.type !== 'death');
  const go = (relative: PersonDetail['parents'][number], key: number) => (relative.id
    ? <button key={key} type="button" className="link" onClick={() => app.select(relative.id, { fly: true })}>{relative.name}</button>
    : <span key={key}>{relative.name}</span>);
  const sentence = (label: string, people: PersonDetail['parents']) => (people.length ? (
    <li>
      {label}{' '}
      {people.flatMap((relative, index) => [index ? (index === people.length - 1 ? ' and ' : ', ') : '', go(relative, index)])}
    </li>
  ) : null);
  const branch = app.view?.hasBranch(d.id) ?? null;
  const self = !person.masked && !person.pending ? person : null;

  return (
    <>
      <CardHead person={person} name={d.name} bornAs={d.birthName} lines={[life, birth?.place ?? ''].filter(Boolean)}>
        {/* What they are to the person reading: tap it to see the way between the two leaves */}
        {d.isSelf ? <p className="kin">This is you</p> : kin && self && (
          <p className="kin"><button type="button" className="link" onClick={() => app.showRelationship(self)}>{capital(kin)}</button></p>
        )}
      </CardHead>
      {d.waiting.map((edit) => (
        <div key={edit.id} className="pencil">
          <div>{edit.author} suggests: {edit.lines.map((line) => [line.text, ...line.fields.map((field) => `${field.was ?? ''} → ${field.to}`)].join(' ')).join('; ')}</div>
          {edit.note && <div>“{edit.note}”</div>}
          <div className="form-actions">
            <button type="button" className="small" onClick={() => app.openPanel('inbox', { tab: edit.canReview ? 'review' : 'mine', editId: edit.id })}>
              {edit.canReview ? 'Review' : 'Open'}
            </button>
          </div>
        </div>
      ))}

      {others.length > 0 && (
        <ul className="facts">
          {others.map((fact) => (
            <li key={fact.id}>
              <span className="kind">{fact.type}</span>
              <span className="what">{[fact.value, fact.dateText, fact.place].filter(Boolean).join(', ')}</span>
            </li>
          ))}
        </ul>
      )}

      <h3>Family</h3>
      <ul className="relatives">
        {sentence('Child of', d.parents)}
        {d.unions.map((union) => (
          <UnionLines key={union.id}>
            {union.partner && <li>{union.status === 'ended' ? 'Was partner of ' : 'Partner of '}{go(union.partner, 0)}{union.since ? ` since ${union.since}` : ''}</li>}
            {sentence(union.children.length === 1 ? 'Child:' : 'Children:', union.children)}
          </UnionLines>
        ))}
        {sentence(d.siblings.length === 1 ? 'Sibling:' : 'Siblings:', d.siblings)}
        {!d.parents.length && !d.unions.length && <li>Nobody is connected yet.</li>}
      </ul>

      {d.bio && <><h3>Story</h3><p className="story">{d.bio}</p></>}

      {(d.memories.length > 0 || app.session.user) && <h3>Memories</h3>}
      {d.memories.map((memory) => (
        <div key={memory.id} className="memory">
          <p>{memory.body}</p>
          <small>{memory.author}, {when(memory.at)}</small>
        </div>
      ))}
      {app.session.user && <MemoryForm detail={d} onDirty={onDirty} />}

      <div className="form-actions">
        {d.editing !== 'none' && <button type="button" className="primary" onClick={() => onSwitch('edit')}>{d.editing === 'apply' ? 'Edit' : 'Suggest a fix'}</button>}
        <button type="button" onClick={() => void app.focusOn(d.id)}>Focus here</button>
        {branch && <button type="button" onClick={() => { app.view?.toggleBranch(d.id); redraw((count) => count + 1); }}>{branch.collapsed ? 'Show branch' : 'Fold branch'}</button>}
        {app.session.user && <button type="button" onClick={() => app.openPanel('history', { personId: d.id, name: d.name })}>History</button>}
      </div>
      {d.editing !== 'none' && (
        <div className="add-row">
          <span>Add a</span>
          {(app.view?.addable(d.id) ?? []).map((relation) => (
            <button key={relation} type="button" className="small" onClick={() => onSwitch('add', relation)}><Icon name={relation} />{relation}</button>
          ))}
        </div>
      )}
    </>
  );
}

/* The lines of one partnership, kept together in the list. */
const UnionLines = ({ children }: { children: ReactNode }) => <>{children}</>;

function MemoryForm({ detail: d, onDirty }: { detail: PersonDetail; onDirty(dirty: boolean): void }) {
  const app = useApp();
  const [text, setText] = useState('');
  return (
    <CardForm
      saveLabel="Add memory"
      small
      onDirty={() => onDirty(Boolean(text.trim()))}
      onSave={async () => {
        if (!text.trim()) return;
        const ops: Op[] = [{ type: 'memory.add', person: d.id, body: text }];
        await app.submit(ops, `A memory of ${d.name}`, { quiet: 'Memory added' });
        setText('');
        onDirty(false);
      }}
    >
      <textarea
        className="short"
        rows={2}
        value={text}
        placeholder={`Share a memory of ${d.given || 'them'}`}
        aria-label={`A memory of ${d.name}`}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit(); }}
      />
    </CardForm>
  );
}
