'use client';

/* Adding a relative: a child, a partner, a parent or a sibling of the person on the card. */

import { SEXES, addRelative, relativeMessage } from '@reactive-family-tree/core';
import type { Contact, PersonDetail, Relation, Sex, TreePerson } from '@reactive-family-tree/core';
import { useEffect, useRef, useState } from 'react';

import { useApp } from '@/lib/app-context';
import { lookupFrom } from '@/lib/format';

import { Field, Select } from '../ui';

import { CardForm } from './CardForm';
import { CardHead } from './CardHead';
import { ContactFields } from './ContactFields';
import { DateField } from './DateField';

const SEX_CHOICES = SEXES.map((value) => [value, value.charAt(0).toUpperCase() + value.slice(1)] as const);

export function AddForm({ person, detail: d, relation, onDirty, onDone, onCancel }: {
  person: TreePerson;
  detail: PersonDetail;
  relation: Relation;
  onDirty(dirty: boolean): void;
  onDone(): void;
  onCancel(): void;
}) {
  const app = useApp();
  const direct = d.editing === 'apply';
  const keepsName = relation === 'child' || relation === 'sibling';
  // A child belongs to one of the person's partnerships
  const unionChoices = d.unions.length > 1 && relation === 'child'
    ? d.unions.map((union) => [union.id, union.partner ? `with ${union.partner.name}` : 'with no recorded partner'] as const) : null;

  const [f, setFields] = useState({ given: '', family: keepsName ? d.family : '', born: '', died: '', sex: 'unknown' as Sex, union: d.unions[0]?.id ?? '' });
  const set = (patch: Partial<typeof f>) => setFields((was) => ({ ...was, ...patch }));
  const [contact, setContact] = useState<Contact>({ name: '', email: '' });
  const given = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => given.current?.focus({ preventScroll: true }), 80);
    return () => clearTimeout(timer);
  }, []);

  const save = async () => {
    const details = { given: f.given.trim(), family: f.family.trim(), birthName: '', sex: f.sex, born: f.born, died: f.died };
    if (!details.given) {
      given.current?.focus();
      throw new Error('Enter at least a given name.');
    }
    const openUnion = relation === 'partner' ? d.unions.find((union) => !union.partner)?.id : null;
    const { ops, ref } = addRelative(lookupFrom(app.tree), { of: d.id, relation, details, unionId: (unionChoices ? f.union : null) ?? openUnion ?? null });
    const done = await app.submit(ops, relativeMessage(relation, details, d.name), { contact: app.session.user ? null : contact });
    onDirty(false);
    // Published: go to the new leaf. Sent for review: stay with the person it was added to.
    const created = done.created[ref];
    if (created) app.select(created, { fly: true, force: true });
    else onDone();
  };

  return (
    <>
      <CardHead person={person} name={d.name} bornAs={d.birthName} lines={[`Add a ${relation}`]} />
      <CardForm saveLabel={direct ? `Add ${relation}` : 'Send for review'} onSave={save} onDirty={() => onDirty(true)} onCancel={onCancel}>
        <div className="fields">
          <Field label="Given name"><input ref={given} type="text" autoComplete="off" value={f.given} onChange={(event) => set({ given: event.target.value })} /></Field>
          <Field label="Family name"><input type="text" autoComplete="off" value={f.family} onChange={(event) => set({ family: event.target.value })} /></Field>
          <DateField label="Born" value={f.born} placeholder="A year, or as exactly as you know" onChange={(born) => set({ born })} />
          <DateField label="Died" value={f.died} placeholder="Leave empty if living" onChange={(died) => set({ died })} />
          <Field label="Sex"><Select<Sex> options={SEX_CHOICES} value={f.sex} onChange={(sex) => set({ sex })} /></Field>
          {unionChoices && <Field label="Child"><Select options={unionChoices} value={f.union} onChange={(union) => set({ union })} /></Field>}
          {!direct && !app.session.user && <ContactFields value={contact} onChange={setContact} />}
        </div>
        <p className="hint-line">{direct ? 'Only what you know. The rest can be added later.' : 'This is outside your branch, so it will be sent for review.'}</p>
      </CardForm>
    </>
  );
}
