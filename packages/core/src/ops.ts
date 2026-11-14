/*
 * Operations: the only way the family changes.
 *
 * Every change from every source (the app, an AI client, an import) is a list
 * of operations, applied here to a state. The server applies them to the real
 * state, to a copy when it only wants to check or preview, and the browser
 * could do the same. Nothing else writes to the family.
 *
 * An operation may name something created earlier in the same edit with a
 * reference such as "$maya".
 */

import { isValidDate } from './dates';
import { livingPartners, present } from './graph';
import { isLang, listed, sayFrom } from './lang';
import type { Lang, Values } from './lang';
import { TEXT_FIELDS, writeIn } from './text';
import { say } from './words';
import type { Phrase } from './words';
import type {
  Applied, Certainty, Change, ChildKind, Entity, EntityKind, EntityOf, FactFields, FactType, Living, Op, OpEnv, OpType,
  Person, PersonFields, Privacy, Ref, Sex, State, UnionFields, UnionKind, UnionStatus,
} from './types';

export const SEXES: readonly Sex[] = ['female', 'male', 'other', 'unknown'];
export const LIVING: readonly Living[] = ['yes', 'no', 'unknown'];
export const PRIVACY: readonly Privacy[] = ['default', 'public', 'members', 'private'];
export const UNION_KINDS: readonly UnionKind[] = ['marriage', 'partnership', 'unknown'];
export const UNION_STATUS: readonly UnionStatus[] = ['current', 'ended', 'unknown'];
export const CHILD_KINDS: readonly ChildKind[] = ['birth', 'adopted', 'step', 'foster', 'unknown'];
export const CERTAINTY: readonly Certainty[] = ['certain', 'probable', 'uncertain'];
export const FACT_TYPES: readonly FactType[] = ['birth', 'death', 'burial', 'residence', 'occupation', 'education', 'immigration', 'military', 'religion', 'custom'];

/* Operations that only add new things. A pending edit's additions can be drawn on the tree in pencil. */
export const ADDITIVE: ReadonlySet<OpType> = new Set<OpType>(['person.create', 'union.create', 'union.add_partner', 'child.link', 'fact.add']);

/* Text has had a language since languages were added. Anything kept from before is given the first one. */
function withLanguage(entity: Entity, kind: EntityKind): Entity {
  if (kind === 'unions') return entity;
  const worded = entity as Partial<Pick<Person, 'lang' | 'tr'>>;
  worded.lang ??= 'en';
  worded.tr ??= {};
  return entity;
}

export class OpError extends Error {
  code: string;
  index: number;
  /* The sentence with its gaps still open and what fills them, where there is something to fill, so it can be said in another language. */
  said: { phrase: string; values: Values } | null;

  constructor(code: string, message: string, index: number, values?: Values) {
    super(values ? sayFrom(null, 'en', message, values) : message);
    this.code = code;
    this.index = index;
    this.said = values ? { phrase: message, values } : null;
  }
}

/* ---------- Field rules ---------- */

type Rule = (value: unknown) => boolean;
type Fail = (code: string, message: string, values?: Values) => never;

const text = (max: number): Rule => (value) => typeof value === 'string' && value.length <= max;
const oneOf = (list: readonly unknown[]): Rule => (value) => list.includes(value);
const yearOrNull: Rule = (value) => value === null || (typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 3000);

/* The id of a stored image is the first half of the SHA-256 of its bytes. */
export const isMediaId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);

/* Does this operation put a photo on someone? Taking one off does not. */
export const setsPhoto = (op: Op): boolean => (op.type === 'person.update' || op.type === 'person.create') && Boolean(op.set?.portrait);

const PERSON_FIELDS: Record<keyof PersonFields, Rule> = {
  given: text(80), family: text(80), birthName: text(80), bio: text(20000),
  sex: oneOf(SEXES), living: oneOf(LIVING), privacy: oneOf(PRIVACY),
  portrait: (value) => value === null || isMediaId(value),
};
const UNION_FIELDS: Record<keyof UnionFields, Rule> = { kind: oneOf(UNION_KINDS), status: oneOf(UNION_STATUS), host: text(40), since: yearOrNull };
const FACT_FIELDS: Record<keyof FactFields, Rule> = {
  type: oneOf(FACT_TYPES), date: isValidDate, place: text(200), value: text(500), note: text(2000),
  certainty: oneOf(CERTAINTY), privacy: oneOf(PRIVACY),
};

function pick<F>(rules: Record<string, Rule>, source: Partial<F> | undefined, fail: Fail): Partial<F> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries<unknown>(source ?? {})) {
    // Only the fields named in the rules. "constructor" and the like, which every object carries, are not fields.
    const rule = Object.hasOwn(rules, key) ? rules[key] : undefined;
    if (!rule) fail('unknown_field', '"{key}" is not something that can be set here.', { key });
    else if (!rule(value)) fail('bad_value', '"{key}" has a value that is not allowed.', { key });
    out[key] = value;
  }
  // Every value has just passed the rule for its field
  return out as Partial<F>;
}

/* ---------- Applying ---------- */

/* The same four maps as the state, written so that the kind of a thing says which map it lives in. */
type Tables = { [K in EntityKind]: Map<string, EntityOf[K]> };

/* What a new thing is made of, before it is given an id and a revision. */
type Fresh<K extends EntityKind> = Omit<EntityOf[K], 'id' | 'rev' | 'deletedAt'>;

/* A change while it is being made. `restored` marks a thing that undo put back, and is dropped before returning. */
type Draft = Change & { restored?: boolean };

/* Each operation by its type, and the handler that applies it. */
type OpOf = { [T in OpType]: Extract<Op, { type: T }> };
type Handlers = { [T in OpType]: (op: OpOf[T]) => void };

/*
 * Apply operations to a state, in order. Returns what changed (with the value
 * before and after, which is what history and undo are built from) and the ids
 * given to anything created. Throws OpError and leaves the caller to discard
 * the state, so always apply to a copy first when the edit might be refused.
 *
 * env: { newId(prefix), now, userId, userName }
 */
export function applyOps(state: State, ops: readonly Op[], env: OpEnv): Applied {
  const tables: Tables = state;
  const changes = new Map<string, Draft>();
  const created: Record<string, string> = {};
  let index = 0;

  const fail: Fail = (code, message, values) => { throw new OpError(code, message, index, values); };
  const resolve = (value: Ref): string => {
    if (typeof value !== 'string' || !value) fail('bad_reference', 'An operation is missing who or what it is about.');
    if (!value.startsWith('$')) return value;
    if (!created[value]) fail('unknown_reference', 'Nothing in this edit is called {name}.', { name: value });
    return created[value];
  };

  /* Take an entity out for changing. The first touch remembers how it was. */
  const open = <K extends EntityKind>(kind: K, id: string, { deleted = false } = {}): EntityOf[K] => {
    const current = tables[kind].get(id);
    if (!current || (!deleted && current.deletedAt)) fail('not_found', MISSING[kind]);
    const key = `${kind}:${id}`;
    // Already taken out: what the state holds is the copy being changed
    if (changes.has(key)) return current;
    const after = structuredClone(current);
    changes.set(key, { kind, id, before: current, after });
    tables[kind].set(id, after);
    return after;
  };
  const add = <K extends EntityKind>(kind: K, prefix: string, ref: Ref | undefined, entity: Fresh<K>): void => {
    const id = env.newId(prefix);
    // The parts given, with an id, a revision and a place outside the compost, are the whole thing
    const after = { id, rev: 0, ...entity, deletedAt: null } as EntityOf[K];
    tables[kind].set(id, after);
    changes.set(`${kind}:${id}`, { kind, id, before: null, after });
    if (ref) {
      if (!/^\$[\w-]+$/.test(ref) || created[ref]) fail('bad_reference', '"{ref}" cannot be used as a name for something new.', { ref });
      created[ref] = id;
    }
  };
  /* Check that something exists without marking it as changed. */
  const need = (kind: EntityKind, value: Ref): string => {
    const id = resolve(value);
    if (!present(state[kind].get(id))) fail('not_found', MISSING[kind]);
    return id;
  };
  const somebody = (value: Ref) => need('people', value);
  /* The language some new text is in: the one the operation names, or the author's. */
  const written = (lang: Lang | undefined): Lang => {
    if (lang !== undefined && !isLang(lang)) fail('bad_value', 'That is not one of the tree’s languages.');
    return lang ?? env.lang ?? 'en';
  };

  const handlers: Handlers = {
    'person.create'(op) {
      const fields = pick(PERSON_FIELDS, op.set, fail);
      add('people', 'p', op.ref, {
        given: '', family: '', birthName: '', sex: 'unknown', living: 'unknown', privacy: 'default', bio: '', portrait: null, consentAt: null, ...fields, lang: written(op.lang), tr: {},
      });
    },
    'person.update'(op) {
      const target = open('people', resolve(op.person));
      writeIn(target, TEXT_FIELDS.people, pick(PERSON_FIELDS, op.set, fail), op.lang && written(op.lang));
      // Consent to being public belongs to one choice of privacy and does not outlive it
      if ('privacy' in (op.set ?? {})) target.consentAt = op.set?.privacy === 'public' && op.consent ? env.now : null;
    },
    'person.remove'(op) {
      open('people', resolve(op.person)).deletedAt = env.now;
    },
    'person.restore'(op) {
      const target = open('people', resolve(op.person), { deleted: true });
      if (!target.deletedAt) fail('not_removed', 'That person is not in the compost.');
      target.deletedAt = null;
    },
    'union.create'(op) {
      const partners = (op.partners ?? []).map(somebody);
      if (partners.length < 1 || partners.length > 2 || new Set(partners).size !== partners.length) {
        fail('bad_partners', 'A partnership needs one or two different people.');
      }
      const fields = pick(UNION_FIELDS, op.set, fail);
      const host = fields.host ? resolve(fields.host) : partners[0];
      if (!partners.includes(host)) fail('bad_host', 'The host must be one of the partners.');
      add('unions', 'u', op.ref, { kind: 'marriage', status: 'current', since: null, ...fields, host, partners, children: [] });
    },
    'union.update'(op) {
      const union = open('unions', resolve(op.union));
      const fields = pick(UNION_FIELDS, op.set, fail);
      if (fields.host) {
        fields.host = resolve(fields.host);
        if (!union.partners.includes(fields.host)) fail('bad_host', 'The host must be one of the partners.');
      }
      Object.assign(union, fields);
    },
    'union.remove'(op) {
      open('unions', resolve(op.union)).deletedAt = env.now;
    },
    'union.add_partner'(op) {
      const union = open('unions', resolve(op.union));
      const id = somebody(op.person);
      if (union.partners.includes(id)) fail('already_partner', 'That person is already in this partnership.');
      if (livingPartners(state, union).length >= 2) fail('too_many_partners', 'A partnership has at most two people.');
      union.partners = [...livingPartners(state, union), id];
    },
    'union.remove_partner'(op) {
      const union = open('unions', resolve(op.union));
      const id = resolve(op.person);
      if (!union.partners.includes(id)) fail('not_partner', 'That person is not in this partnership.');
      if (union.partners.length === 1) fail('last_partner', 'Remove the partnership instead of its last person.');
      union.partners = union.partners.filter((partner) => partner !== id);
      if (union.host === id) union.host = union.partners[0];
    },
    'child.link'(op) {
      const union = open('unions', resolve(op.union));
      const id = somebody(op.child);
      const kind = op.kind ?? 'birth';
      if (!CHILD_KINDS.includes(kind)) fail('bad_value', 'That is not a kind of parent and child link.');
      if (union.partners.includes(id)) fail('own_parent', 'Someone cannot be their own child.');
      if (union.children.some((child) => child.id === id)) fail('already_child', 'That person is already a child of this couple.');
      union.children = [...union.children, { id, kind }];
    },
    'child.unlink'(op) {
      const union = open('unions', resolve(op.union));
      const id = resolve(op.child);
      if (!union.children.some((child) => child.id === id)) fail('not_child', 'That person is not a child of this couple.');
      union.children = union.children.filter((child) => child.id !== id);
    },
    'fact.add'(op) {
      const type = op.subject?.type;
      if (type !== 'person' && type !== 'union') fail('bad_subject', 'A fact belongs to a person or a partnership.');
      const subject = { type, id: need(type === 'person' ? 'people' : 'unions', op.subject.id) };
      const fields = pick(FACT_FIELDS, op.set, fail);
      if (!fields.type) fail('bad_value', 'A fact needs a type, such as birth or occupation.');
      add('facts', 'f', op.ref, { date: null, place: '', value: '', note: '', certainty: 'certain', privacy: 'default', ...fields, type: fields.type, subject, lang: written(op.lang), tr: {} });
    },
    'fact.update'(op) {
      writeIn(open('facts', resolve(op.fact)), TEXT_FIELDS.facts, pick(FACT_FIELDS, op.set, fail), op.lang && written(op.lang));
    },
    'fact.remove'(op) {
      open('facts', resolve(op.fact)).deletedAt = env.now;
    },
    'memory.add'(op) {
      const personId = somebody(op.person);
      if (!text(4000)(op.body) || !op.body.trim()) fail('bad_value', 'A memory needs some words, up to 4,000 characters.');
      add('memories', 'm', op.ref, { personId, authorUserId: env.userId, authorName: env.userName, body: op.body.trim(), createdAt: env.now, lang: written(op.lang), tr: {} });
    },
    'memory.translate'(op) {
      const memory = open('memories', resolve(op.memory));
      if (!text(4000)(op.body)) fail('bad_value', 'A memory has at most 4,000 characters.');
      // In its own language a memory stays as it was told. The language checked is the one written into, so an
      // operation that leaves it out is a telling in its author's language, and can never reach the memory itself.
      const target = written(op.lang);
      if (target === memory.lang) fail('bad_value', 'A memory is told again in another language, not rewritten in its own.');
      writeIn(memory, TEXT_FIELDS.memories, { body: op.body.trim() }, target);
    },
    'memory.remove'(op) {
      open('memories', resolve(op.memory)).deletedAt = env.now;
    },
    /* Put one thing back exactly as it was. Only undo produces this. */
    'entity.set'(op) {
      if (!Object.hasOwn(NOUNS, op.kind)) fail('bad_value', 'Unknown kind of thing to restore.');
      const key = `${op.kind}:${op.id}`;
      // Undo is trusted to send a snapshot of the kind it names
      const table: Map<string, Entity> = state[op.kind];
      const before = table.get(op.id) ?? null;
      if (!before && !op.snapshot) fail('not_found', MISSING[op.kind]);
      // With no snapshot the thing goes to the compost, and undo only does that to something that is there
      // A snapshot from before text had a language is of something written in the family's first one, with nothing beside it
      const after = op.snapshot ? withLanguage(structuredClone(op.snapshot), op.kind) : ({ ...before, deletedAt: env.now } as Entity);
      // Putting something back restores its revision number too, so that an earlier
      // edit of the same thing can then be undone in turn.
      const restored = Boolean(op.snapshot);
      const change = changes.get(key);
      if (change) Object.assign(change, { after, restored });
      else changes.set(key, { kind: op.kind, id: op.id, before, after, restored });
      table.set(op.id, after);
    },
  };
  /* Operations arrive as data, so one that no handler knows is refused here, whatever its type says. */
  const run = <T extends OpType>(type: T, op: OpOf[T]): void => {
    const handler = Object.hasOwn(handlers, type) ? handlers[type] : undefined;
    if (!handler) fail('unknown_operation', '"{type}" is not an operation.', { type });
    else handler(op);
  };

  for (; index < ops.length; index++) {
    const op = ops[index];
    run(op?.type, op);
  }

  const list = [...changes.values()].map(({ restored, ...change }) => {
    if (!restored) change.after.rev = (change.before?.rev ?? 0) + 1;
    return change;
  });
  return { changes: list, created };
}

const NOUNS: Record<EntityKind, string> = { people: 'person', unions: 'partnership', facts: 'fact', memories: 'memory' };
const MISSING: Record<EntityKind, string> = {
  people: 'That person does not exist.', unions: 'That partnership does not exist.', facts: 'That fact does not exist.', memories: 'That memory does not exist.',
};

/* What each field is called when a sentence names it. */
export const FIELD_WORDS: Readonly<Record<string, Phrase | undefined>> = {
  given: 'given name', family: 'family name', birthName: 'birth name', bio: 'story', sex: 'sex', living: 'living', privacy: 'privacy', portrait: 'photo',
  kind: 'kind', status: 'status', host: 'drawn with', since: 'since', type: 'type', date: 'date', place: 'place', value: 'detail', note: 'note', certainty: 'certainty',
};

/* A field by the word people know it by, for a sentence that names it. One that has no word is named as it is. */
export function fieldWord(key: string, lang: Lang): string {
  const word = FIELD_WORDS[key];
  return word ? say(lang, word) : key;
}

/* "in Russian", for each language a thing can be written in. */
export const IN_LANGUAGE: Record<Lang, Phrase> = { en: 'in English', he: 'in Hebrew', ru: 'in Russian' };

/* What a sentence about a change may need to look up beyond people's names. */
export interface Known {
  /* The language a person or a fact is itself written in, so that text added in another one is told apart from a change to the original. */
  langOf?(id: string): Lang | null | undefined;
  /* Whom a memory is about. */
  memoryOf?(id: string): string | null | undefined;
}

/* A sentence for each operation, for review cards, history and AI drafts, in the reader's language. */
export function describeOp(op: Op, nameOf: (id: string) => string | null | undefined, lang: Lang = 'en', known: Known = {}): string {
  const who = (id: string | null | undefined) => (id ? nameOf(id) : null) ?? say(lang, 'someone new');
  /* The words for "in Russian", when the operation writes in a language that is not the thing's own. */
  const another = (id: string, written: Lang | undefined): string | null => {
    const its = known.langOf?.(id);
    return written && its && written !== its && isLang(written) ? say(lang, IN_LANGUAGE[written]) : null;
  };
  const fields = (set: object | undefined) => Object.keys(set ?? {}).map((key) => fieldWord(key, lang)).join(', ') || say(lang, 'details');
  switch (op.type) {
    case 'person.create': {
      const name = [op.set?.given, op.set?.family].filter(Boolean).join(' ');
      return name ? say(lang, 'Add {name}', { name }) : say(lang, 'Add an unnamed person');
    }
    case 'person.update': {
      const inLanguage = another(op.person, op.lang);
      return say(lang, inLanguage ? 'Write {fields} of {who} {inLanguage}' : 'Change {fields} of {who}', { fields: fields(op.set), who: who(op.person), inLanguage });
    }
    case 'person.remove': return say(lang, 'Remove {who}', { who: who(op.person) });
    case 'person.restore': return say(lang, 'Restore {who}', { who: who(op.person) });
    case 'union.create': return say(lang, 'Join {names} as partners', { names: listed(lang, op.partners.map(who)) });
    case 'union.update': return say(lang, 'Change {fields} of a partnership', { fields: fields(op.set) });
    case 'union.remove': return say(lang, 'Remove a partnership');
    case 'union.add_partner': return say(lang, 'Add {who} as a partner', { who: who(op.person) });
    case 'union.remove_partner': return say(lang, 'Remove {who} from a partnership', { who: who(op.person) });
    case 'child.link': return say(lang, 'Add {who} as a child', { who: who(op.child) });
    case 'child.unlink': return say(lang, 'Remove {who} as a child', { who: who(op.child) });
    case 'fact.add': {
      const type = op.set?.type;
      return type ? say(lang, 'Add {type} for {who}', { type: FACT_TYPES.includes(type) ? say(lang, type) : type, who: who(op.subject?.id) }) : say(lang, 'Add a fact for {who}', { who: who(op.subject?.id) });
    }
    case 'fact.update': {
      const inLanguage = another(op.fact, op.lang);
      return say(lang, inLanguage ? 'Write {fields} of a fact {inLanguage}' : 'Change {fields} of a fact', { fields: fields(op.set), inLanguage });
    }
    case 'fact.remove': return say(lang, 'Remove a fact');
    case 'memory.add': return say(lang, 'Add a memory of {who}', { who: who(op.person) });
    case 'memory.translate': return say(lang, 'Write a memory of {who} {inLanguage}', { who: who(known.memoryOf?.(op.memory)), inLanguage: isLang(op.lang) ? say(lang, IN_LANGUAGE[op.lang]) : '' });
    case 'memory.remove': return say(lang, 'Remove a memory');
    case 'entity.set': return say(lang, 'Put something back as it was');
    // The types leave nothing over, but an operation is data and may still be something else
    default: return (op as Op).type;
  }
}
