'use client';

/* Editing one person: their names, their life, their story and their other facts. */

import { FACT_TYPES, parseDate } from '@reactive-family-tree/core';
import type { Certainty, Contact, FactType, FactView, Living, Op, PersonDetail, PersonFields, Privacy, Sex, TreePerson, Words } from '@reactive-family-tree/core';
import { useState } from 'react';

import { useApp } from '@/lib/app-context';
import { portraitUrl } from '@/lib/format';
import { useHumanCheck } from '@/lib/human-check';
import { useT } from '@/lib/i18n';
import type { WebPhrase } from '@/lib/i18n';

import { ConfirmButton, Field, Select } from '../ui';

import { CardForm } from './CardForm';
import { CardHead } from './CardHead';
import { ContactFields } from './ContactFields';
import { DateField } from './DateField';
import { FACT_LABEL, capital, sexChoices } from './labels';
import { PhotoField } from './PhotoField';
import { Worded } from './Written';

const OTHER_FACTS = FACT_TYPES.filter((type) => type !== 'birth' && type !== 'death');
const PRIVACY_LABELS: Record<Privacy, WebPhrase> = { default: 'Follow the family’s setting', members: 'Relatives only', private: 'Private', public: 'Public, even while living' };
/* The answers to "Living": not the same word again, or the form would read "Living: Living" */
const LIVING_LABELS: readonly (readonly [Living, WebPhrase])[] = [['yes', 'Yes'], ['no', 'No'], ['unknown', 'Not known']];
const CERTAINTY_LABELS: readonly (readonly [Certainty, WebPhrase])[] = [['certain', 'Certain'], ['probable', 'Probable'], ['uncertain', 'Uncertain']];

/* The reader's own version of a text: empty where it is written only in another language. */
const mine = (words: Words | undefined, field: string, text = '') => (words?.from[field] ? '' : text);
/* What shows faintly in a box whose text is written only in another language: that text. */
const faint = (words: Words | undefined, field: string, text = '') => (words?.from[field] ? text : undefined);

interface FactRow {
  value: string;
  date: string;
  place: string;
}

export function EditForm({ person, detail: d, onDirty, onDone, onCancel }: {
  person: TreePerson;
  detail: PersonDetail;
  onDirty(dirty: boolean): void;
  onDone(): void;
  onCancel(): void;
}) {
  const app = useApp();
  const { lang, t } = useT();
  const direct = d.editing === 'apply';
  const birth = d.facts.find((fact) => fact.type === 'birth'), death = d.facts.find((fact) => fact.type === 'death');
  const others = d.facts.filter((fact) => fact !== birth && fact !== death);

  const [f, setFields] = useState({
    given: mine(d.words, 'given', d.given), family: mine(d.words, 'family', d.family), birthName: mine(d.words, 'birthName', d.birthName), sex: d.sex, living: d.living,
    born: birth?.dateText ?? '', birthPlace: mine(birth?.words, 'place', birth?.place), died: death?.dateText ?? '', bio: mine(d.words, 'bio', d.bio), privacy: d.privacy, note: '',
  });
  const set = (patch: Partial<typeof f>) => setFields((was) => ({ ...was, ...patch }));
  // Their photo: left as it is until a new one is placed, or the old one is taken off
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [contact, setContact] = useState<Contact>({ name: '', email: '' });
  // Only a visitor's suggestion goes by the check that a person is asking
  const human = useHumanCheck(app.session.user ? null : app.session.humanCheck);
  // When someone died is asked only once they are said to have died
  const [diedHidden, setDiedHidden] = useState(d.living === 'yes' && !death?.dateText);
  // Other facts: change them in place, mark one for removal, or add a new one
  const [removed, setRemoved] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, FactRow>>(() => Object.fromEntries(others.map((fact) => [fact.id, { value: mine(fact.words, 'value', fact.value), date: fact.dateText, place: mine(fact.words, 'place', fact.place) }])));
  // A new fact asks for its details only once its kind is chosen
  const [fresh, setFresh] = useState<{ type: FactType | ''; value: string; date: string; place: string; certainty: Certainty }>({ type: '', value: '', date: '', place: '', certainty: 'certain' });

  const save = async () => {
    const ops: Op[] = [];
    const changed: Partial<PersonFields> = {};
    // Each text is compared with the reader's own version, so words not written in their language yet stay as they are unless something is typed
    for (const key of ['given', 'family', 'birthName', 'bio'] as const) if (f[key].trim() !== mine(d.words, key, d[key])) changed[key] = f[key].trim();
    if (f.sex !== d.sex) changed.sex = f.sex;
    if (f.living !== d.living) changed.living = f.living;
    if (f.privacy !== d.privacy) changed.privacy = f.privacy;
    if (photo !== undefined && photo !== d.portrait) changed.portrait = photo;
    // What is typed is the reader's version, in their language. An original in another language is left alone.
    if (Object.keys(changed).length) ops.push({ type: 'person.update', person: d.id, set: changed, lang });

    const lifeFact = (existing: FactView | undefined, type: 'birth' | 'death', dateText: string, place: string) => {
      const date = parseDate(dateText);
      const was = mine(existing?.words, 'place', existing?.place);
      // A place written only in another language is kept, so the fact is not empty while it has one
      const placeElsewhere = Boolean(existing?.words.from.place);
      const same = existing && existing.dateText === dateText.trim() && was === place;
      if (same || (!existing && !date && !place)) return;
      if (!existing) ops.push({ type: 'fact.add', subject: { type: 'person', id: d.id }, set: { type, date, place }, lang });
      else if (!date && !place && !placeElsewhere) ops.push({ type: 'fact.remove', fact: existing.id });
      else {
        // Only what actually changed, so a reviewer sees one clear difference
        ops.push({ type: 'fact.update', fact: existing.id, set: { ...(existing.dateText !== dateText.trim() ? { date } : {}), ...(was !== place ? { place } : {}) }, lang });
      }
    };
    lifeFact(birth, 'birth', f.born, f.birthPlace.trim());
    lifeFact(death, 'death', f.died, mine(death?.words, 'place', death?.place));

    for (const id of removed) ops.push({ type: 'fact.remove', fact: id });
    for (const fact of others) {
      const row = rows[fact.id];
      if (!row || removed.includes(fact.id)) continue;
      const change = {
        ...(row.value.trim() !== mine(fact.words, 'value', fact.value) ? { value: row.value.trim() } : {}),
        ...(row.date.trim() !== fact.dateText ? { date: parseDate(row.date) } : {}),
        ...(row.place.trim() !== mine(fact.words, 'place', fact.place) ? { place: row.place.trim() } : {}),
      };
      if (Object.keys(change).length) ops.push({ type: 'fact.update', fact: fact.id, set: change, lang });
    }
    if (fresh.type) {
      ops.push({ type: 'fact.add', subject: { type: 'person', id: d.id }, set: { type: fresh.type, value: fresh.value.trim(), date: parseDate(fresh.date), place: fresh.place.trim(), certainty: fresh.certainty }, lang });
    }
    if (!ops.length) return onDone();
    await app.submit(ops, t(direct ? 'Update {name}' : 'Correct {name}', { name: d.name }), { note: f.note, contact: app.session.user ? null : contact, proof: await human.prove() });
    onDone();
  };
  const remove = async () => {
    try {
      await app.submit([{ type: 'person.remove', person: d.id }], t('Remove {name}', { name: d.name }), { quiet: t('{name} moved to the compost', { name: d.name }) });
      app.select(null, { force: true });
    } catch (error) {
      app.fail(error);
    }
  };
  const privacyChoices = (Object.entries(PRIVACY_LABELS) as [Privacy, WebPhrase][])
    .filter(([key]) => key !== 'public' || (d.isSelf && !d.gone))
    .map(([key, label]) => [key, t(label)] as const);
  const setRow = (id: string, patch: Partial<FactRow>) => setRows((was) => ({ ...was, [id]: { ...(was[id] as FactRow), ...patch } }));
  // The words of another language, taken into a box as they are
  const take = (patch: Partial<typeof f>) => { set(patch); onDirty(true); };
  const takeRow = (id: string, patch: Partial<FactRow>) => { setRow(id, patch); onDirty(true); };

  return (
    <>
      <CardHead person={person} name={d.name} bornAs={d.birthName} lines={[direct ? t('Changes are published at once') : t('Changes go to a steward for review')]} />
      <CardForm
        saveLabel={direct ? t('Save') : t('Send for review')}
        onSave={save}
        onDirty={() => onDirty(true)}
        onCancel={onCancel}
        more={d.canRemove && <ConfirmButton label={t('Remove')} sure={t('Really remove?')} className="danger" onConfirm={() => void remove()} />}
      >
        <div className="fields">
          {/* A photo is set outright or not at all, so it is offered only where a change is published at once */}
          {direct && <PhotoField current={portraitUrl(d)} value={photo} onChange={(next) => { setPhoto(next); onDirty(true); }} />}
          <Worded words={d.words} field="given" text={d.given} onUse={(given) => take({ given })}>
            <Field label={t('Given name')}><input type="text" autoComplete="off" dir="auto" value={f.given} placeholder={faint(d.words, 'given', d.given)} onChange={(event) => set({ given: event.target.value })} /></Field>
          </Worded>
          <Worded words={d.words} field="family" text={d.family} onUse={(family) => take({ family })}>
            <Field label={t('Family name')}><input type="text" autoComplete="off" dir="auto" value={f.family} placeholder={faint(d.words, 'family', d.family)} onChange={(event) => set({ family: event.target.value })} /></Field>
          </Worded>
          <Worded words={d.words} field="birthName" text={d.birthName} onUse={(birthName) => take({ birthName })}>
            <Field label={t('Born as')}><input type="text" autoComplete="off" dir="auto" value={f.birthName} placeholder={faint(d.words, 'birthName', d.birthName)} onChange={(event) => set({ birthName: event.target.value })} /></Field>
          </Worded>
          <Field label={t('Sex')}><Select<Sex> options={sexChoices(t)} value={f.sex} onChange={(sex) => set({ sex })} /></Field>
          <DateField label={t('Born')} value={f.born} placeholder={t('about 1890, March 1921, 4 March 1921')} onChange={(born) => set({ born })} />
          <Worded words={birth?.words} field="place" text={birth?.place} onUse={(birthPlace) => take({ birthPlace })}>
            <Field label={t('Birthplace')}><input type="text" autoComplete="off" dir="auto" value={f.birthPlace} placeholder={faint(birth?.words, 'place', birth?.place)} onChange={(event) => set({ birthPlace: event.target.value })} /></Field>
          </Worded>
          <Field label={t('Living')}>
            <Select<Living> options={LIVING_LABELS.map(([key, label]) => [key, t(label)] as const)} value={f.living} onChange={(living) => { set({ living }); setDiedHidden(living === 'yes' && !f.died.trim()); }} />
          </Field>
          <DateField label={t('Died')} value={f.died} hidden={diedHidden} onChange={(died) => set({ died })} />
          <Worded words={d.words} field="bio" text={d.bio} wide onUse={(bio) => take({ bio })}>
            <Field label={t('Story')} wide><textarea rows={4} dir="auto" value={f.bio} placeholder={faint(d.words, 'bio', d.bio)} onChange={(event) => set({ bio: event.target.value })} /></Field>
          </Worded>
          {(d.isSelf || app.isAdmin) && (
            <Field label={t('Who can see this person')} wide><Select<Privacy> options={privacyChoices} value={f.privacy} onChange={(privacy) => set({ privacy })} /></Field>
          )}
        </div>
        <h3>{t('Other facts')}</h3>
        {others.filter((fact) => !removed.includes(fact.id)).map((fact) => {
          const row = rows[fact.id];
          if (!row) return null;
          const kind = t(FACT_LABEL[fact.type]);
          return (
            <div key={fact.id} className="fields">
              <strong className="wide">{capital(kind)}</strong>
              <Worded words={fact.words} field="value" text={fact.value} onUse={(value) => takeRow(fact.id, { value })}>
                <input type="text" autoComplete="off" dir="auto" placeholder={faint(fact.words, 'value', fact.value) ?? t('Detail')} aria-label={t('{kind}: detail', { kind })} value={row.value} onChange={(event) => setRow(fact.id, { value: event.target.value })} />
              </Worded>
              <input type="text" autoComplete="off" placeholder={t('When')} aria-label={t('{kind}: when', { kind })} value={row.date} onChange={(event) => setRow(fact.id, { date: event.target.value })} />
              <Worded words={fact.words} field="place" text={fact.place} onUse={(place) => takeRow(fact.id, { place })}>
                <input type="text" autoComplete="off" dir="auto" placeholder={faint(fact.words, 'place', fact.place) ?? t('Where')} aria-label={t('{kind}: where', { kind })} value={row.place} onChange={(event) => setRow(fact.id, { place: event.target.value })} />
              </Worded>
              <button type="button" className="small danger" onClick={() => { setRemoved((was) => [...was, fact.id]); onDirty(true); }}>{t('Remove')}</button>
            </div>
          );
        })}
        <div className="fields">
          <div className="wide">
            <Select<FactType | ''> options={[['', t('Add a fact…')], ...OTHER_FACTS.map((type) => [type, capital(t(FACT_LABEL[type]))] as const)]} value={fresh.type} aria-label={t('Add a fact')} onChange={(type) => setFresh((was) => ({ ...was, type }))} />
          </div>
          <input type="text" autoComplete="off" dir="auto" hidden={!fresh.type} placeholder={t('Detail')} aria-label={t('New fact: detail')} value={fresh.value} onChange={(event) => setFresh((was) => ({ ...was, value: event.target.value }))} ref={(node) => { if (node && fresh.type && !fresh.value && document.activeElement?.tagName === 'SELECT') node.focus(); }} />
          <input type="text" autoComplete="off" hidden={!fresh.type} placeholder={t('When')} aria-label={t('New fact: when')} value={fresh.date} onChange={(event) => setFresh((was) => ({ ...was, date: event.target.value }))} />
          <input type="text" autoComplete="off" dir="auto" hidden={!fresh.type} placeholder={t('Where')} aria-label={t('New fact: where')} value={fresh.place} onChange={(event) => setFresh((was) => ({ ...was, place: event.target.value }))} />
          <Select<Certainty> options={CERTAINTY_LABELS.map(([key, label]) => [key, t(label)] as const)} value={fresh.certainty} hidden={!fresh.type} aria-label={t('How certain')} onChange={(certainty) => setFresh((was) => ({ ...was, certainty }))} />
        </div>
        {!direct && (
          <div className="fields review-fields">
            <Field label={t('A note for the reviewer')} wide>
              <input type="text" autoComplete="off" dir="auto" placeholder={t('How do you know? A document, a gravestone, a memory')} value={f.note} onChange={(event) => set({ note: event.target.value })} />
            </Field>
            {!app.session.user && <ContactFields value={contact} onChange={setContact} check={human.box} />}
          </div>
        )}
      </CardForm>
    </>
  );
}
