/*
 * GEDCOM in and out, so nobody is locked in.
 *
 * Export writes GEDCOM 5.5.1, the form most family tree software reads.
 * Import never writes to the family directly: it returns operations, which
 * become a staged edit the admin previews on the tree before applying.
 */

import { fromGedcom, toGedcom } from '../core/dates.js';
import { factsOf, indexOf, livingChildren, livingPartners, present } from '../core/graph.js';

const SEX_OUT = { male: 'M', female: 'F', other: 'X', unknown: 'U' };
const SEX_IN = { M: 'male', F: 'female', X: 'other', U: 'unknown' };

/* Facts that are their own GEDCOM event, and facts written as a described attribute. */
const EVENT_TAGS = { birth: 'BIRT', death: 'DEAT', burial: 'BURI', residence: 'RESI', immigration: 'IMMI' };
const VALUE_TAGS = { occupation: 'OCCU', education: 'EDUC', religion: 'RELI' };
const TYPE_OF_TAG = Object.fromEntries([...Object.entries(EVENT_TAGS), ...Object.entries(VALUE_TAGS)].map(([type, tag]) => [tag, type]));

/* ---------- Export ---------- */

function longText(level, tag, text) {
  const [first, ...rest] = String(text).split('\n');
  return [`${level} ${tag} ${first}`, ...rest.map((line) => `${level + 1} CONT ${line}`)];
}

export function exportGedcom(state, familyName) {
  const ix = indexOf(state);
  const people = [...state.people.values()].filter(present);
  const unions = [...state.unions.values()].filter((union) => present(union) && livingPartners(state, union).length);
  const iTag = new Map(people.map((p, i) => [p.id, `@I${i + 1}@`]));
  const fTag = new Map(unions.map((u, i) => [u.id, `@F${i + 1}@`]));
  const out = ['0 HEAD', '1 SOUR ReactiveFamilyTree', `2 NAME ${familyName}`, '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8'];

  for (const p of people) {
    out.push(`0 ${iTag.get(p.id)} INDI`);
    // The first name is the birth name. A different current family name follows as a married name.
    out.push(`1 NAME ${p.given} /${p.birthName || p.family}/`);
    if (p.birthName && p.birthName !== p.family) out.push(`1 NAME ${p.given} /${p.family}/`, '2 TYPE married');
    out.push(`1 SEX ${SEX_OUT[p.sex]}`);
    const facts = factsOf(ix, p.id);
    for (const fact of facts) {
      const tag = EVENT_TAGS[fact.type] ?? VALUE_TAGS[fact.type];
      out.push(tag ? `1 ${tag}${VALUE_TAGS[fact.type] && fact.value ? ` ${fact.value}` : ''}` : '1 EVEN');
      if (!tag) out.push(`2 TYPE ${fact.type === 'military' ? 'Military service' : fact.value || 'Event'}`);
      if (fact.date) out.push(`2 DATE ${toGedcom(fact.date)}`);
      if (fact.place) out.push(`2 PLAC ${fact.place}`);
      if (fact.note) out.push(...longText(2, 'NOTE', fact.note));
    }
    if (p.living === 'no' && !facts.some((fact) => fact.type === 'death')) out.push('1 DEAT Y');
    if (p.bio) out.push(...longText(1, 'NOTE', p.bio));
    for (const union of ix.unionsOfChild.get(p.id) ?? []) {
      if (!fTag.has(union.id)) continue;
      const kind = union.children.find((child) => child.id === p.id).kind;
      out.push(`1 FAMC ${fTag.get(union.id)}`);
      if (kind !== 'unknown') out.push(`2 PEDI ${kind}`);
    }
    for (const union of ix.unionsOfPartner.get(p.id) ?? []) out.push(`1 FAMS ${fTag.get(union.id)}`);
  }

  for (const union of unions) {
    out.push(`0 ${fTag.get(union.id)} FAM`);
    // GEDCOM 5.5.1 has a husband and a wife slot. A woman goes in the second, everyone else in whichever is free.
    const slots = [null, null];
    for (const id of livingPartners(state, union)) {
      const wants = state.people.get(id).sex === 'female' ? 1 : 0;
      slots[slots[wants] === null ? wants : 1 - wants] = id;
    }
    if (slots[0]) out.push(`1 HUSB ${iTag.get(slots[0])}`);
    if (slots[1]) out.push(`1 WIFE ${iTag.get(slots[1])}`);
    if (union.kind === 'marriage' || union.since) {
      out.push('1 MARR');
      if (union.since) out.push(`2 DATE ${union.since}`);
    }
    if (union.status === 'ended') out.push('1 DIV Y');
    for (const child of livingChildren(state, union)) out.push(`1 CHIL ${iTag.get(child.id)}`);
  }
  out.push('0 TRLR');
  return `${out.join('\n')}\n`;
}

/* ---------- Import ---------- */

/* Lines into a tree of records: { tag, xref, value, children }. */
function parseRecords(text) {
  const roots = [];
  const stack = [];
  for (const raw of String(text).replace(/^﻿/, '').split(/\r?\n/)) {
    const m = raw.trim().match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/);
    if (!m) continue;
    const level = Number(m[1]);
    const node = { tag: m[3].toUpperCase(), xref: m[2] ?? null, value: m[4] ?? '', children: [] };
    if (node.tag === 'CONT' || node.tag === 'CONC') {
      const parent = stack[level - 1];
      if (parent) parent.value += (node.tag === 'CONT' ? '\n' : '') + node.value;
      continue;
    }
    stack.length = level;
    if (level === 0) roots.push(node);
    else stack[level - 1]?.children.push(node);
    stack[level] = node;
  }
  return roots;
}

const child = (node, tag) => node.children.find((c) => c.tag === tag) ?? null;
const childrenWith = (node, tag) => node.children.filter((c) => c.tag === tag);
const refOf = (prefix, xref) => `$${prefix}_${xref.replace(/[^\w]/g, '')}`;

function splitName(value) {
  const m = value.match(/^(.*?)\s*\/(.*?)\/\s*(.*)$/);
  return m ? { given: `${m[1]} ${m[3]}`.trim(), family: m[2].trim() } : { given: value.trim(), family: '' };
}

/* Returns { ops, people, families, skipped: [tag names we did not understand] }. */
export function importGedcom(text) {
  const records = parseRecords(text);
  const individuals = records.filter((r) => r.tag === 'INDI' && r.xref);
  const families = records.filter((r) => r.tag === 'FAM' && r.xref);
  if (!individuals.length) throw new Error('No people were found in that file. Is it a GEDCOM file?');

  const ops = [];
  const skipped = new Set();
  const known = new Set(['NAME', 'SEX', 'FAMC', 'FAMS', 'NOTE', 'EVEN', ...Object.keys(TYPE_OF_TAG)]);

  for (const record of individuals) {
    const ref = refOf('i', record.xref);
    const names = childrenWith(record, 'NAME');
    const birth = splitName(names[0]?.value ?? '');
    const married = names.find((name) => child(name, 'TYPE')?.value.toLowerCase() === 'married');
    const current = married ? splitName(married.value) : birth;
    const died = child(record, 'DEAT');
    ops.push({
      type: 'person.create', ref,
      set: {
        given: birth.given.slice(0, 80), family: current.family.slice(0, 80), birthName: married ? birth.family.slice(0, 80) : '',
        sex: SEX_IN[child(record, 'SEX')?.value.toUpperCase()] ?? 'unknown', living: died ? 'no' : 'unknown',
        bio: childrenWith(record, 'NOTE').map((note) => note.value).join('\n\n').slice(0, 20000),
      },
    });
    for (const node of record.children) {
      if (!known.has(node.tag)) { skipped.add(node.tag); continue; }
      const type = TYPE_OF_TAG[node.tag] ?? (node.tag === 'EVEN' ? 'custom' : null);
      if (!type) continue;
      const date = fromGedcom(child(node, 'DATE')?.value);
      const place = child(node, 'PLAC')?.value ?? '';
      const value = node.tag === 'EVEN' ? child(node, 'TYPE')?.value ?? '' : VALUE_TAGS[type] ? node.value : '';
      if (!date && !place && !value) continue;     // "DEAT Y" says only that they died, which `living` already holds
      ops.push({
        type: 'fact.add', subject: { type: 'person', id: ref },
        set: { type, date, place: place.slice(0, 200), value: value.slice(0, 500), note: (child(node, 'NOTE')?.value ?? '').slice(0, 2000) },
      });
    }
  }

  const personRefs = new Set(individuals.map((r) => refOf('i', r.xref)));
  let familyCount = 0;
  for (const record of families) {
    const partners = ['HUSB', 'WIFE'].map((tag) => child(record, tag)?.value).filter(Boolean).map((xref) => refOf('i', xref)).filter((ref) => personRefs.has(ref));
    if (!partners.length) { skipped.add('FAM without parents'); continue; }
    const ref = refOf('f', record.xref);
    const married = child(record, 'MARR');
    const year = Number(fromGedcom(married && child(married, 'DATE')?.value)?.from?.slice(0, 4)) || null;
    ops.push({
      type: 'union.create', ref, partners,
      set: { kind: married ? 'marriage' : 'unknown', status: child(record, 'DIV') ? 'ended' : 'current', since: year },
    });
    familyCount += 1;
    for (const node of childrenWith(record, 'CHIL')) {
      const childRef = refOf('i', node.value);
      if (!personRefs.has(childRef)) continue;
      const person = individuals.find((r) => refOf('i', r.xref) === childRef);
      const pedigree = childrenWith(person, 'FAMC').find((famc) => famc.value === record.xref);
      const kind = pedigree && child(pedigree, 'PEDI')?.value.toLowerCase();
      ops.push({ type: 'child.link', union: ref, child: childRef, kind: ['birth', 'adopted', 'step', 'foster'].includes(kind) ? kind : 'birth' });
    }
  }
  return { ops, people: individuals.length, families: familyCount, skipped: [...skipped] };
}
