'use client';

/* Editing one person: their names, their life, their story and their other facts. */

import { CERTAINTY, FACT_TYPES, SEXES, parseDate } from '@reactive-family-tree/core';
import type { Certainty, Contact, FactType, FactView, Living, Op, PersonDetail, PersonFields, Privacy, Sex, TreePerson } from '@reactive-family-tree/core';
import { useState } from 'react';

import { useApp } from '@/lib/app-context';
import { portraitUrl } from '@/lib/format';

import { ConfirmButton, Field, Select } from '../ui';

import { CardForm } from './CardForm';
import { CardHead } from './CardHead';
import { ContactFields } from './ContactFields';
import { DateField } from './DateField';
import { PhotoField } from './PhotoField';

const OTHER_FACTS = FACT_TYPES.filter((type) => type !== 'birth' && type !== 'death');
const titled = <Value extends string>(list: readonly Value[]) => list.map((value) => [value, value.charAt(0).toUpperCase() + value.slice(1)] as const);
const PRIVACY_LABELS: Record<Privacy, string> = { default: 'Follow the family’s setting', members: 'Relatives only', private: 'Private', public: 'Public, even while living' };
const LIVING_LABELS: readonly (readonly [Living, string])[] = [['yes', 'Living'], ['no', 'Has died'], ['unknown', 'Not known']];

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
  const direct = d.editing === 'apply';
  const birth = d.facts.find((fact) => fact.type === 'birth'), death = d.facts.find((fact) => fact.type === 'death');
  const others = d.facts.filter((fact) => fact !== birth && fact !== death);

  const [f, setFields] = useState({
    given: d.given, family: d.family, birthName: d.birthName, sex: d.sex, living: d.living,
    born: birth?.dateText ?? '', birthPlace: birth?.place ?? '', died: death?.dateText ?? '', bio: d.bio, privacy: d.privacy, note: '',
  });
  const set = (patch: Partial<typeof f>) => setFields((was) => ({ ...was, ...patch }));
  // Their photo: left as it is until a new one is placed, or the old one is taken off
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [contact, setContact] = useState<Contact>({ name: '', email: '' });
  // When someone died is asked only once they are said to have died
  const [diedHidden, setDiedHidden] = useState(d.living === 'yes' && !death?.dateText);
  // Other facts: change them in place, mark one for removal, or add a new one
  const [removed, setRemoved] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, FactRow>>(() => Object.fromEntries(others.map((fact) => [fact.id, { value: fact.value, date: fact.dateText, place: fact.place }])));
  // A new fact asks for its details only once its kind is chosen
  const [fresh, setFresh] = useState<{ type: FactType | ''; value: string; date: string; place: string; certainty: Certainty }>({ type: '', value: '', date: '', place: '', certainty: 'certain' });

  const save = async () => {
    const ops: Op[] = [];
    const changed: Partial<PersonFields> = {};
    for (const key of ['given', 'family', 'birthName', 'bio'] as const) if (f[key].trim() !== (d[key] ?? '')) changed[key] = f[key].trim();
    if (f.sex !== d.sex) changed.sex = f.sex;
    if (f.living !== d.living) changed.living = f.living;
    if (f.privacy !== d.privacy) changed.privacy = f.privacy;
    if (photo !== undefined && photo !== d.portrait) changed.portrait = photo;
    if (Object.keys(changed).length) ops.push({ type: 'person.update', person: d.id, set: changed });

    const lifeFact = (existing: FactView | undefined, type: 'birth' | 'death', dateText: string, place: string) => {
      const date = parseDate(dateText);
      const same = existing && existing.dateText === dateText.trim() && existing.place === place;
      if (same || (!existing && !date && !place)) return;
      if (!existing) ops.push({ type: 'fact.add', subject: { type: 'person', id: d.id }, set: { type, date, place } });
      else if (!date && !place) ops.push({ type: 'fact.remove', fact: existing.id });
      else {
        // Only what actually changed, so a reviewer sees one clear difference
        ops.push({ type: 'fact.update', fact: existing.id, set: { ...(existing.dateText !== dateText.trim() ? { date } : {}), ...(existing.place !== place ? { place } : {}) } });
      }
    };
    lifeFact(birth, 'birth', f.born, f.birthPlace.trim());
    lifeFact(death, 'death', f.died, death?.place ?? '');

    for (const id of removed) ops.push({ type: 'fact.remove', fact: id });
    for (const fact of others) {
      const row = rows[fact.id];
      if (!row || removed.includes(fact.id)) continue;
      const change = {
        ...(row.value.trim() !== fact.value ? { value: row.value.trim() } : {}),
        ...(row.date.trim() !== fact.dateText ? { date: parseDate(row.date) } : {}),
        ...(row.place.trim() !== fact.place ? { place: row.place.trim() } : {}),
      };
      if (Object.keys(change).length) ops.push({ type: 'fact.update', fact: fact.id, set: change });
    }
    if (fresh.type) {
      ops.push({ type: 'fact.add', subject: { type: 'person', id: d.id }, set: { type: fresh.type, value: fresh.value.trim(), date: parseDate(fresh.date), place: fresh.place.trim(), certainty: fresh.certainty } });
    }
    if (!ops.length) return onDone();
    await app.submit(ops, `${direct ? 'Update' : 'Correct'} ${d.name}`, { note: f.note, contact: app.session.user ? null : contact });
    onDone();
  };
  const remove = async () => {
    try {
      await app.submit([{ type: 'person.remove', person: d.id }], `Remove ${d.name}`, { quiet: `${d.name} moved to the compost` });
      app.select(null, { force: true });
    } catch (error) {
      app.fail(error);
    }
  };
  const privacyChoices = (Object.entries(PRIVACY_LABELS) as [Privacy, string][]).filter(([key]) => key !== 'public' || (d.isSelf && !d.gone));
  const setRow = (id: string, patch: Partial<FactRow>) => setRows((was) => ({ ...was, [id]: { ...(was[id] as FactRow), ...patch } }));

  return (
    <>
      <CardHead person={person} name={d.name} bornAs={d.birthName} lines={[direct ? 'Changes are published at once' : 'Changes go to a steward for review']} />
      <CardForm
        saveLabel={direct ? 'Save' : 'Send for review'}
        onSave={save}
        onDirty={() => onDirty(true)}
        onCancel={onCancel}
        more={d.canRemove && <ConfirmButton label="Remove" sure="Really remove?" className="danger" onConfirm={() => void remove()} />}
      >
        <div className="fields">
          {/* A photo is set outright or not at all, so it is offered only where a change is published at once */}
          {direct && <PhotoField current={portraitUrl(d)} value={photo} onChange={(next) => { setPhoto(next); onDirty(true); }} />}
          <Field label="Given name"><input type="text" autoComplete="off" value={f.given} onChange={(event) => set({ given: event.target.value })} /></Field>
          <Field label="Family name"><input type="text" autoComplete="off" value={f.family} onChange={(event) => set({ family: event.target.value })} /></Field>
          <Field label="Born as"><input type="text" autoComplete="off" value={f.birthName} onChange={(event) => set({ birthName: event.target.value })} /></Field>
          <Field label="Sex"><Select<Sex> options={titled(SEXES)} value={f.sex} onChange={(sex) => set({ sex })} /></Field>
          <DateField label="Born" value={f.born} placeholder="about 1890, March 1921, 4 March 1921" onChange={(born) => set({ born })} />
          <Field label="Birthplace"><input type="text" autoComplete="off" value={f.birthPlace} onChange={(event) => set({ birthPlace: event.target.value })} /></Field>
          <Field label="Living">
            <Select<Living> options={LIVING_LABELS} value={f.living} onChange={(living) => { set({ living }); setDiedHidden(living === 'yes' && !f.died.trim()); }} />
          </Field>
          <DateField label="Died" value={f.died} hidden={diedHidden} onChange={(died) => set({ died })} />
          <Field label="Story" wide><textarea rows={4} value={f.bio} onChange={(event) => set({ bio: event.target.value })} /></Field>
          {(d.isSelf || app.isAdmin) && (
            <Field label="Who can see this person" wide><Select<Privacy> options={privacyChoices} value={f.privacy} onChange={(privacy) => set({ privacy })} /></Field>
          )}
        </div>
        <h3>Other facts</h3>
        {others.filter((fact) => !removed.includes(fact.id)).map((fact) => {
          const row = rows[fact.id];
          if (!row) return null;
          return (
            <div key={fact.id} className="fields">
              <strong className="wide">{fact.type.charAt(0).toUpperCase() + fact.type.slice(1)}</strong>
              <input type="text" autoComplete="off" placeholder="Detail" aria-label={`${fact.type}: detail`} value={row.value} onChange={(event) => setRow(fact.id, { value: event.target.value })} />
              <input type="text" autoComplete="off" placeholder="When" aria-label={`${fact.type}: when`} value={row.date} onChange={(event) => setRow(fact.id, { date: event.target.value })} />
              <input type="text" autoComplete="off" placeholder="Where" aria-label={`${fact.type}: where`} value={row.place} onChange={(event) => setRow(fact.id, { place: event.target.value })} />
              <button type="button" className="small danger" onClick={() => { setRemoved((was) => [...was, fact.id]); onDirty(true); }}>Remove</button>
            </div>
          );
        })}
        <div className="fields">
          <div className="wide">
            <Select<FactType | ''> options={[['', 'Add a fact…'], ...titled(OTHER_FACTS)]} value={fresh.type} aria-label="Add a fact" onChange={(type) => setFresh((was) => ({ ...was, type }))} />
          </div>
          <input type="text" autoComplete="off" hidden={!fresh.type} placeholder="Detail" aria-label="New fact: detail" value={fresh.value} onChange={(event) => setFresh((was) => ({ ...was, value: event.target.value }))} ref={(node) => { if (node && fresh.type && !fresh.value && document.activeElement?.tagName === 'SELECT') node.focus(); }} />
          <input type="text" autoComplete="off" hidden={!fresh.type} placeholder="When" aria-label="New fact: when" value={fresh.date} onChange={(event) => setFresh((was) => ({ ...was, date: event.target.value }))} />
          <input type="text" autoComplete="off" hidden={!fresh.type} placeholder="Where" aria-label="New fact: where" value={fresh.place} onChange={(event) => setFresh((was) => ({ ...was, place: event.target.value }))} />
          <Select<Certainty> options={titled(CERTAINTY)} value={fresh.certainty} hidden={!fresh.type} aria-label="How certain" onChange={(certainty) => setFresh((was) => ({ ...was, certainty }))} />
        </div>
        {!direct && (
          <div className="fields review-fields">
            <Field label="A note for the reviewer" wide>
              <input type="text" autoComplete="off" placeholder="How do you know? A document, a gravestone, a memory" value={f.note} onChange={(event) => set({ note: event.target.value })} />
            </Field>
            {!app.session.user && <ContactFields value={contact} onChange={setContact} />}
          </div>
        )}
      </CardForm>
    </>
  );
}
