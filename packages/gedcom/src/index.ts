/*
 * GEDCOM in and out, so nobody is locked in.
 *
 * Export writes GEDCOM 5.5.1, the form most family tree software reads.
 * Import never writes to the family directly: it returns operations, which
 * become a staged edit the admin previews on the tree before applying.
 */

import { FACT_TYPES, factsOf, fromGedcom, indexOf, livingChildren, livingPartners, present, toGedcom, yearOf } from '@reactive-family-tree/core';
import type { FactType, Op, Sex, State } from '@reactive-family-tree/core';

const SEX_OUT: Record<Sex, string> = { male: 'M', female: 'F', other: 'X', unknown: 'U' };
const SEX_IN: Record<string, Sex> = { M: 'male', F: 'female', X: 'other', U: 'unknown' };

type TagOfType = Partial<Record<FactType, string>>;

/* Facts that are their own GEDCOM event, and facts written as a described attribute. */
const EVENT_TAGS: TagOfType = { birth: 'BIRT', death: 'DEAT', burial: 'BURI', residence: 'RESI', immigration: 'IMMI' };
const VALUE_TAGS: TagOfType = { occupation: 'OCCU', education: 'EDUC', religion: 'RELI' };
const TYPE_OF_TAG: Record<string, FactType> = {};
for (const type of FACT_TYPES) {
  const tag = EVENT_TAGS[type] ?? VALUE_TAGS[type];
  if (tag) TYPE_OF_TAG[tag] = type;
}

/* ---------- Export ---------- */

function longText(level: number, tag: string, text: string): string[] {
  const [first, ...rest] = String(text).split('\n');
  return [`${level} ${tag} ${first}`, ...rest.map((line) => `${level + 1} CONT ${line}`)];
}

export function exportGedcom(state: State, familyName: string): string {
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
      const kind = union.children.find((child) => child.id === p.id)?.kind;
      out.push(`1 FAMC ${fTag.get(union.id)}`);
      if (kind && kind !== 'unknown') out.push(`2 PEDI ${kind}`);
    }
    for (const union of ix.unionsOfPartner.get(p.id) ?? []) out.push(`1 FAMS ${fTag.get(union.id)}`);
  }

  for (const union of unions) {
    out.push(`0 ${fTag.get(union.id)} FAM`);
    // GEDCOM 5.5.1 has a husband and a wife slot. A woman goes in the second, everyone else in whichever is free.
    const slots: (string | null)[] = [null, null];
    for (const id of livingPartners(state, union)) {
      const wants = state.people.get(id)?.sex === 'female' ? 1 : 0;
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

interface GedNode {
  tag: string;
  xref: string | null;
  value: string;
  children: GedNode[];
}

/* A record that others point to, by the name between its @ signs. */
type Named = GedNode & { xref: string };

/* What an import found: the operations to stage, how much there was, and the tag names we did not understand. */
export interface GedcomImport {
  ops: Op[];
  people: number;
  families: number;
  skipped: string[];
}

/* Lines into a tree of records: { tag, xref, value, children }. */
function parseRecords(text: string): GedNode[] {
  const roots: GedNode[] = [];
  const stack: GedNode[] = [];
  for (const raw of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = raw.trim().match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/);
    if (!m) continue;
    const level = Number(m[1]);
    const node: GedNode = { tag: m[3].toUpperCase(), xref: m[2] ?? null, value: m[4] ?? '', children: [] };
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

const child = (node: GedNode, tag: string): GedNode | null => node.children.find((c) => c.tag === tag) ?? null;
const childrenWith = (node: GedNode, tag: string): GedNode[] => node.children.filter((c) => c.tag === tag);
const refOf = (prefix: string, xref: string): string => `$${prefix}_${xref.replace(/[^\w]/g, '')}`;

function splitName(value: string): { given: string; family: string } {
  const m = value.match(/^(.*?)\s*\/(.*?)\/\s*(.*)$/);
  return m ? { given: `${m[1]} ${m[3]}`.trim(), family: m[2].trim() } : { given: value.trim(), family: '' };
}

/* Returns { ops, people, families, skipped: [tag names we did not understand] }. */
export function importGedcom(text: string): GedcomImport {
  const records = parseRecords(text);
  const individuals = records.filter((r): r is Named => r.tag === 'INDI' && Boolean(r.xref));
  const families = records.filter((r): r is Named => r.tag === 'FAM' && Boolean(r.xref));
  if (!individuals.length) throw new Error('No people were found in that file. Is it a GEDCOM file?');

  const ops: Op[] = [];
  const skipped = new Set<string>();
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
        sex: SEX_IN[child(record, 'SEX')?.value.toUpperCase() ?? ''] ?? 'unknown', living: died ? 'no' : 'unknown',
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

  // Everyone by the name they go by in the operations: a large file names a child tens of thousands of times
  const byRef = new Map(individuals.map((r) => [refOf('i', r.xref), r]));
  let familyCount = 0;
  for (const record of families) {
    const partners = ['HUSB', 'WIFE'].flatMap((tag) => child(record, tag)?.value || []).map((xref) => refOf('i', xref)).filter((ref) => byRef.has(ref));
    if (!partners.length) { skipped.add('FAM without parents'); continue; }
    const ref = refOf('f', record.xref);
    const married = child(record, 'MARR');
    const year = yearOf(fromGedcom(married && child(married, 'DATE')?.value));
    ops.push({
      type: 'union.create', ref, partners,
      set: { kind: married ? 'marriage' : 'unknown', status: child(record, 'DIV') ? 'ended' : 'current', since: year },
    });
    familyCount += 1;
    for (const node of childrenWith(record, 'CHIL')) {
      const childRef = refOf('i', node.value);
      const person = byRef.get(childRef);
      if (!person) continue;
      const pedigree = childrenWith(person, 'FAMC').find((famc) => famc.value === record.xref);
      const said = pedigree && child(pedigree, 'PEDI')?.value.toLowerCase();
      ops.push({ type: 'child.link', union: ref, child: childRef, kind: (['birth', 'adopted', 'step', 'foster'] as const).find((kind) => kind === said) ?? 'birth' });
    }
  }
  return { ops, people: individuals.length, families: familyCount, skipped: [...skipped] };
}
