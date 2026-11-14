'use client';

/*
 * The person card. It grows out of the tapped leaf and is where one person is
 * read, edited, corrected, and given relatives. On a phone it is a sheet that
 * can be pulled taller or flicked away.
 */

import { describeKinship } from '@reactive-family-tree/core';
import type { EditView, FactView, MemoryView, Op, PersonDetail, Relation, Relationship, Sex, TreePerson, UnionView } from '@reactive-family-tree/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, Ref } from 'react';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import type { CardMode } from '@/lib/app-context';
import { displayName, lifespan, when } from '@/lib/format';
import { usePresence } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import type { WebPhrase } from '@/lib/i18n';

import { AddForm } from './card/AddForm';
import { CardForm } from './card/CardForm';
import { CardHead } from './card/CardHead';
import { EditForm } from './card/EditForm';
import { InLang, factPieces } from './card/InLang';
import { FACT_LABEL, IN_LANG, LANG_LABEL, capital } from './card/labels';
import { LangTag } from './card/Written';
import { Icon } from './Icon';

const CLOSE_MS = 260;
const PHONE = '(max-width: 640px)';
const RELATION_LABEL: Record<Relation, WebPhrase> = { child: 'child', partner: 'partner', parent: 'parent', sibling: 'sibling' };

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

export function PersonCard({ target, onSwitch, ref }: {
  target: CardTarget | null;
  /* Go to another way of showing the same person: reading, editing, adding a relative. */
  onSwitch(mode: CardMode, relation?: Relation): void;
  ref: Ref<CardHandle>;
}) {
  const app = useApp();
  const { lang, t } = useT();
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
    const kin = related.data?.connected ? describeKinship(related.data.steps, lang) ?? t('related to you', { sex: person.masked ? null : person.sex }) : null;
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
    // A press on a button, or on a photo that is open large, is not a pull on the sheet
    if (!matchMedia(PHONE).matches || !from.closest('.card-grab, .head') || from.closest('button, dialog')) return;
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
      aria-label={drawn ? displayName(drawn.target.person, lang) : t('Person')}
      tabIndex={-1}
      className={classes || undefined}
      hidden={!present}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="card-grab" aria-hidden="true" />
      <button type="button" className="close" aria-label={t('Close')} onClick={() => app.select(null)}>×</button>
      <div ref={body} key={drawn ? `${drawn.target.person.id}:${drawn.target.mode}:${drawn.target.relation ?? ''}` : 'empty'} className="card-body swap">
        {content}
      </div>
      {asking && (
        <div className="card-ask" role="alertdialog" aria-label={t('Unsaved changes')}>
          <span>{t('Leave without saving?')}</span>
          <button type="button" className="small" autoFocus onClick={() => setAsking(null)}>{t('Keep editing')}</button>
          <button type="button" className="small danger" onClick={() => { dirty.current = false; const go = asking; setAsking(null); go(); }}>{t('Discard')}</button>
        </div>
      )}
    </div>
  );
}

/* ---------- The parts ---------- */

/* The sex the relatives in a line share, if they all share one. */
const alike = (people: readonly { sex?: Sex }[]): Sex => {
  const first = people[0]?.sex;
  return first && first !== 'unknown' && people.every((relative) => relative.sex === first) ? first : 'unknown';
};

function MaskedView({ person }: { person: TreePerson }) {
  const app = useApp();
  const { lang, t } = useT();
  return (
    <>
      <CardHead person={person} name={displayName(person, lang)} lines={[t('Details are private')]} />
      <p className="hint-line">{t('Living people are shown only to relatives who sign in.')}</p>
      {!app.session.user && (
        <div className="form-actions">
          <button type="button" className="primary" onClick={() => app.openPanel('signin')}>{t('Sign in')}</button>
        </div>
      )}
    </>
  );
}

/* Someone who is only suggested or drafted so far. */
function PendingView({ person, edit }: { person: TreePerson; edit: EditView | null }) {
  const app = useApp();
  const { lang, t } = useT();
  if (person.masked || !person.pending) return null;
  const draft = person.pending.status === 'draft';
  const lines = [person.born ? t('born {year}', { year: person.born }) : '', draft ? t('A draft, not on the tree yet') : t('Suggested by {name}', { name: person.pending.by })].filter(Boolean);
  const editId = person.pending.editId;
  return (
    <>
      <CardHead person={person} name={displayName(person, lang)} bornAs={person.birthName} lines={lines} />
      {edit?.note && <p className="pencil">{edit.note}</p>}
      <p className="hint-line">{draft ? t('Only you can see this until you apply it.') : t('Waiting for a steward or admin to decide.')}</p>
      <div className="form-actions">
        <button type="button" className="primary" onClick={() => app.openPanel('inbox', { tab: draft || !edit?.canReview ? 'mine' : 'review', editId })}>
          {draft ? t('Review the draft') : edit?.canReview ? t('Review it') : t('See the suggestion')}
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
  const { dir, t, tx, list } = useT();
  // The branch may be folded or shown from here, and the button has to say which it is now
  const [, redraw] = useState(0);
  const birth = d.facts.find((fact) => fact.type === 'birth');
  const death = d.facts.find((fact) => fact.type === 'death');
  const life = [birth?.dateText && t('born {date}', { date: birth.dateText }), death?.dateText && t('died {date}', { date: death.dateText })].filter(Boolean).join(', ') || lifespan(d, t);
  const others = d.facts.filter((fact) => fact.type !== 'birth' && fact.type !== 'death');
  // Words shown in another language can be written in the reader's by whoever may change this person
  const write = d.editing !== 'none' ? () => onSwitch('edit') : undefined;
  const placeFrom = birth?.words.from.place, bioFrom = d.words.from.bio;
  const go = (relative: PersonDetail['parents'][number], key: number) => (relative.id
    ? <button key={key} type="button" className="link" onClick={() => app.select(relative.id, { fly: true })}>{relative.name}</button>
    : <span key={key}>{relative.name}</span>);
  // What stands before the last of several names: " and " in English, and in Hebrew a letter joined onto the name
  const andBefore = (name: string) => { const said = list(['', name]); return said.slice(0, said.length - name.length); };
  const named = (people: PersonDetail['parents']) => people.flatMap((relative, index) => [index ? (index === people.length - 1 ? andBefore(relative.name) : ', ') : '', go(relative, index)]);
  // A line of relatives. Its sentence may count them, follow the person's sex, or theirs ("Сестра:", "בנות:"), as each language needs.
  const sentence = (phrase: WebPhrase, people: PersonDetail['parents']) => (people.length ? (
    <li>{tx(phrase, { names: named(people), n: people.length, sex: d.sex, them: alike(people) })}</li>
  ) : null);
  const partnerLine = (union: UnionView) => {
    if (!union.partner) return null;
    const ended = union.status === 'ended';
    const phrase = union.since ? (ended ? 'Was partner of {name} since {year}' : 'Partner of {name} since {year}') : ended ? 'Was partner of {name}' : 'Partner of {name}';
    // Hebrew follows this person's sex ("she is the partner of"), Russian the partner's ("Husband: David")
    return <li>{tx(phrase, { name: go(union.partner, 0), year: union.since, sex: d.sex, partner: union.partner.sex ?? 'unknown' })}</li>;
  };
  const branch = app.view?.hasBranch(d.id) ?? null;
  const self = !person.masked && !person.pending ? person : null;
  const birthPlace = birth?.place && <><InLang text={birth.place} lang={placeFrom} />{placeFrom && <>{' '}<LangTag lang={placeFrom} onWrite={write} /></>}</>;

  return (
    <>
      <CardHead person={person} name={d.name} bornAs={d.birthName} lines={[life, birthPlace].filter(Boolean)}>
        {/* What they are to the person reading: tap it to see the way between the two leaves */}
        {d.isSelf ? <p className="kin">{t('This is you')}</p> : kin && self && (
          <p className="kin"><button type="button" className="link" onClick={() => app.showRelationship(self)}>{capital(kin)}</button></p>
        )}
      </CardHead>
      {d.waiting.map((edit) => (
        <div key={edit.id} className="pencil">
          <div>{t('{name} suggests: {changes}', { name: edit.author, changes: edit.lines.map((line) => [line.text, ...line.fields.map((field) => `${field.was ?? ''} ${dir === 'rtl' ? '←' : '→'} ${field.to}`)].join(' ')).join('; ') })}</div>
          {edit.note && <div>{t('“{note}”', { note: edit.note })}</div>}
          <div className="form-actions">
            <button type="button" className="small" onClick={() => app.openPanel('inbox', { tab: edit.canReview ? 'review' : 'mine', editId: edit.id })}>
              {edit.canReview ? t('Review') : t('Open')}
            </button>
          </div>
        </div>
      ))}

      {others.length > 0 && (
        <ul className="facts">
          {others.map((fact) => (
            <li key={fact.id}>
              <span className="kind">{t(FACT_LABEL[fact.type])}</span>
              <FactWhat fact={fact} onWrite={write} />
            </li>
          ))}
        </ul>
      )}

      <h3>{t('Family')}</h3>
      <ul className="relatives">
        {sentence('Child of {names}', d.parents)}
        {d.unions.map((union) => (
          <UnionLines key={union.id}>
            {partnerLine(union)}
            {sentence('{n#Child:|Children:} {names}', union.children)}
          </UnionLines>
        ))}
        {sentence('{n#Sibling:|Siblings:} {names}', d.siblings)}
        {!d.parents.length && !d.unions.length && <li>{t('Nobody is connected yet.')}</li>}
      </ul>

      {d.bio && (
        <>
          <h3>{t('Story')}</h3>
          <p className="story" lang={bioFrom} dir={bioFrom && 'auto'}>{d.bio}</p>
          {bioFrom && <p className="hint-line"><LangTag lang={bioFrom} onWrite={write} /></p>}
        </>
      )}

      {(d.memories.length > 0 || app.session.user) && <h3>{t('Memories')}</h3>}
      {d.memories.map((memory) => <Memory key={memory.id} memory={memory} name={d.name} onDirty={onDirty} />)}
      {app.session.user && <MemoryForm detail={d} onDirty={onDirty} />}

      <div className="form-actions">
        {d.editing !== 'none' && <button type="button" className="primary" onClick={() => onSwitch('edit')}>{d.editing === 'apply' ? t('Edit') : t('Suggest a fix')}</button>}
        <button type="button" onClick={() => void app.focusOn(d.id)}>{t('Focus here')}</button>
        {branch && <button type="button" onClick={() => { app.view?.toggleBranch(d.id); redraw((count) => count + 1); }}>{branch.collapsed ? t('Show branch') : t('Fold branch')}</button>}
        {app.session.user && <button type="button" onClick={() => app.openPanel('history', { personId: d.id, name: d.name })}>{t('History')}</button>}
      </div>
      {d.editing !== 'none' && (
        <div className="add-row">
          <span>{t('Add a')}</span>
          {(app.view?.addable(d.id) ?? []).map((relation) => (
            <button key={relation} type="button" className="small" onClick={() => onSwitch('add', relation)}><Icon name={relation} />{t(RELATION_LABEL[relation])}</button>
          ))}
        </div>
      )}
    </>
  );
}

/* The lines of one partnership, kept together in the list. */
const UnionLines = ({ children }: { children: ReactNode }) => <>{children}</>;

/* What a fact says, and after words shown in another language, one tag that says which. */
function FactWhat({ fact, onWrite }: { fact: FactView; onWrite?: () => void }) {
  const from = fact.words.from.value ?? fact.words.from.place;
  return (
    <span className="what">
      {factPieces(fact)}
      {from && <>{' '}<LangTag lang={from} onWrite={onWrite} /></>}
    </span>
  );
}

/* Cmd or Ctrl with Enter sends a memory: Enter alone starts a new line in it. */
const sendOnCtrlEnter = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit();
};

/* A memory as it was told. One told in another language can be told again in the reader's, by those who may. */
function Memory({ memory, name, onDirty }: { memory: MemoryView; name: string; onDirty(dirty: boolean): void }) {
  const app = useApp();
  const { lang, t } = useT();
  const [telling, setTelling] = useState(false);
  const [text, setText] = useState('');
  const from = memory.words.from.body;
  const language = t(LANG_LABEL[lang]);
  const told = t('A memory of {name}, in {language}', { name, language });
  const stop = () => {
    setTelling(false);
    setText('');
    onDirty(false);
  };
  return (
    <div className="memory">
      <p lang={from} dir={from && 'auto'}>{memory.body}</p>
      <small>{memory.author}, {when(memory.at, lang, (time) => t('today, {time}', { time }))}{from && `, ${t(IN_LANG[from])}`}</small>
      {from && memory.canTranslate && !telling && <>{' '}<button type="button" className="link" onClick={() => setTelling(true)}>{t('Tell it in {language}', { language })}</button></>}
      {telling && (
        <CardForm
          saveLabel={t('Save')}
          small
          onDirty={() => onDirty(Boolean(text.trim()))}
          onCancel={stop}
          onSave={async () => {
            if (!text.trim()) return;
            await app.submit([{ type: 'memory.translate', memory: memory.id, lang, body: text.trim() }], told);
            stop();
          }}
        >
          <textarea className="short" rows={2} dir="auto" value={text} aria-label={told} autoFocus onChange={(event) => setText(event.target.value)} onKeyDown={sendOnCtrlEnter} />
        </CardForm>
      )}
    </div>
  );
}

function MemoryForm({ detail: d, onDirty }: { detail: PersonDetail; onDirty(dirty: boolean): void }) {
  const app = useApp();
  const { lang, t } = useT();
  const [text, setText] = useState('');
  return (
    <CardForm
      saveLabel={t('Add memory')}
      small
      onDirty={() => onDirty(Boolean(text.trim()))}
      onSave={async () => {
        if (!text.trim()) return;
        const ops: Op[] = [{ type: 'memory.add', person: d.id, body: text, lang }];
        await app.submit(ops, t('A memory of {name}', { name: d.name }), { quiet: t('Memory added') });
        setText('');
        onDirty(false);
      }}
    >
      <textarea
        className="short"
        rows={2}
        dir="auto"
        value={text}
        placeholder={d.given ? t('Share a memory of {name}', { name: d.given }) : t('Share a memory of them')}
        aria-label={t('A memory of {name}', { name: d.name })}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={sendOnCtrlEnter}
      />
    </CardForm>
  );
}
