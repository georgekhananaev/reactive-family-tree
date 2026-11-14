'use client';

/* Adding a relative: a child, a partner, a parent or a sibling of the person on the card. */

import { ComposeError, addRelative, relativeMessage, translate } from '@reactive-family-tree/core';
import type { Contact, PersonDetail, Relation, Sex, TreePerson } from '@reactive-family-tree/core';
import { useEffect, useRef, useState } from 'react';

import { useApp } from '@/lib/app-context';
import { lookupFrom } from '@/lib/format';
import { useT } from '@/lib/i18n';
import type { WebPhrase } from '@/lib/i18n';

import { Field, Select } from '../ui';

import { CardForm } from './CardForm';
import { CardHead } from './CardHead';
import { ContactFields } from './ContactFields';
import { DateField } from './DateField';
import { sexChoices } from './labels';

const ADDING: Record<Relation, WebPhrase> = { child: 'Add a child', partner: 'Add a partner', parent: 'Add a parent', sibling: 'Add a sibling' };
const ADD: Record<Relation, WebPhrase> = { child: 'Add child', partner: 'Add partner', parent: 'Add parent', sibling: 'Add sibling' };

export function AddForm({ person, detail: d, relation, onDirty, onDone, onCancel }: {
  person: TreePerson;
  detail: PersonDetail;
  relation: Relation;
  onDirty(dirty: boolean): void;
  onDone(): void;
  onCancel(): void;
}) {
  const app = useApp();
  const { lang, t } = useT();
  const direct = d.editing === 'apply';
  const keepsName = relation === 'child' || relation === 'sibling';
  // A child belongs to one of the person's partnerships
  const unionChoices = d.unions.length > 1 && relation === 'child'
    ? d.unions.map((union) => [union.id, union.partner ? t('with {name}', { name: union.partner.name }) : t('with no recorded partner')] as const) : null;

  const [f, setFields] = useState({ given: '', family: keepsName ? d.family : '', born: '', died: '', sex: 'unknown' as Sex, union: d.unions[0]?.id ?? '' });
  const set = (patch: Partial<typeof f>) => setFields((was) => ({ ...was, ...patch }));
  const [contact, setContact] = useState<Contact>({ name: '', email: '' });
  const given = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => given.current?.focus({ preventScroll: true }), 80);
    return () => clearTimeout(timer);
  }, []);

  /* Why a relative cannot be added the way it was asked (a third parent, a sibling of someone with no parents) is said in the reader's language. */
  const composed = <Made,>(make: () => Made): Made => {
    try {
      return make();
    } catch (error) {
      throw error instanceof ComposeError ? new Error(translate(lang, error.message)) : error;
    }
  };

  const save = async () => {
    const details = { given: f.given.trim(), family: f.family.trim(), birthName: '', sex: f.sex, born: f.born, died: f.died };
    if (!details.given) {
      given.current?.focus();
      throw new Error(t('Enter at least a given name.'));
    }
    const openUnion = relation === 'partner' ? d.unions.find((union) => !union.partner)?.id : null;
    const { ops, ref } = composed(() => addRelative(lookupFrom(app.tree), { of: d.id, relation, details, unionId: (unionChoices ? f.union : null) ?? openUnion ?? null }));
    // The new person's words are first written in the language of whoever adds them
    const written = ops.map((op) => (op.type === 'person.create' || op.type === 'fact.add' ? { ...op, lang } : op));
    const done = await app.submit(written, relativeMessage(relation, details, d.name, lang), { contact: app.session.user ? null : contact });
    onDirty(false);
    // Published: go to the new leaf. Sent for review: stay with the person it was added to.
    const created = done.created[ref];
    if (created) app.select(created, { fly: true, force: true });
    else onDone();
  };

  return (
    <>
      <CardHead person={person} name={d.name} bornAs={d.birthName} lines={[t(ADDING[relation])]} />
      <CardForm saveLabel={direct ? t(ADD[relation]) : t('Send for review')} onSave={save} onDirty={() => onDirty(true)} onCancel={onCancel}>
        <div className="fields">
          <Field label={t('Given name')}><input ref={given} type="text" autoComplete="off" dir="auto" value={f.given} onChange={(event) => set({ given: event.target.value })} /></Field>
          <Field label={t('Family name')}><input type="text" autoComplete="off" dir="auto" value={f.family} onChange={(event) => set({ family: event.target.value })} /></Field>
          <DateField label={t('Born')} value={f.born} placeholder={t('A year, or as exactly as you know')} onChange={(born) => set({ born })} />
          <DateField label={t('Died')} value={f.died} placeholder={t('Leave empty if living')} onChange={(died) => set({ died })} />
          <Field label={t('Sex')}><Select<Sex> options={sexChoices(t)} value={f.sex} onChange={(sex) => set({ sex })} /></Field>
          {unionChoices && <Field label={t('Child')}><Select options={unionChoices} value={f.union} onChange={(union) => set({ union })} /></Field>}
          {!direct && !app.session.user && <ContactFields value={contact} onChange={setContact} />}
        </div>
        <p className="hint-line">{direct ? t('Only what you know. The rest can be added later.') : t('This is outside your branch, so it will be sent for review.')}</p>
      </CardForm>
    </>
  );
}
