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
import type {
  Applied, Certainty, Change, ChildKind, Entity, EntityKind, EntityOf, FactFields, FactType, Living, Op, OpEnv, OpType,
  PersonFields, Privacy, Ref, Sex, State, UnionFields, UnionKind, UnionStatus,
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

export class OpError extends Error {
  code: string;
  index: number;

  constructor(code: string, message: string, index: number) {
    super(message);
    this.code = code;
    this.index = index;
  }
}

/* ---------- Field rules ---------- */

type Rule = (value: unknown) => boolean;
type Fail = (code: string, message: string) => never;

const text = (max: number): Rule => (value) => typeof value === 'string' && value.length <= max;
const oneOf = (list: readonly unknown[]): Rule => (value) => list.includes(value);
const yearOrNull: Rule = (value) => value === null || (typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 3000);

/* The id of a stored image is the first half of the SHA-256 of its bytes. */
export const isMediaId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);

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
    if (!rule) fail('unknown_field', `"${key}" is not something that can be set here.`);
    else if (!rule(value)) fail('bad_value', `"${key}" has a value that is not allowed.`);
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

  const fail: Fail = (code, message) => { throw new OpError(code, message, index); };
  const resolve = (value: Ref): string => {
    if (typeof value !== 'string' || !value) fail('bad_reference', 'An operation is missing who or what it is about.');
    if (!value.startsWith('$')) return value;
    if (!created[value]) fail('unknown_reference', `Nothing in this edit is called ${value}.`);
    return created[value];
  };

  /* Take an entity out for changing. The first touch remembers how it was. */
  const open = <K extends EntityKind>(kind: K, id: string, { deleted = false } = {}): EntityOf[K] => {
    const current = tables[kind].get(id);
    if (!current || (!deleted && current.deletedAt)) fail('not_found', `That ${NOUNS[kind]} does not exist.`);
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
      if (!/^\$[\w-]+$/.test(ref) || created[ref]) fail('bad_reference', `"${ref}" cannot be used as a name for something new.`);
      created[ref] = id;
    }
  };
  /* Check that something exists without marking it as changed. */
  const need = (kind: EntityKind, value: Ref): string => {
    const id = resolve(value);
    if (!present(state[kind].get(id))) fail('not_found', `That ${NOUNS[kind]} does not exist.`);
    return id;
  };
  const somebody = (value: Ref) => need('people', value);

  const handlers: Handlers = {
    'person.create'(op) {
      const fields = pick(PERSON_FIELDS, op.set, fail);
      add('people', 'p', op.ref, {
        given: '', family: '', birthName: '', sex: 'unknown', living: 'unknown', privacy: 'default', bio: '', portrait: null, consentAt: null, ...fields,
      });
    },
    'person.update'(op) {
      const target = open('people', resolve(op.person));
      Object.assign(target, pick(PERSON_FIELDS, op.set, fail));
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
      add('facts', 'f', op.ref, { date: null, place: '', value: '', note: '', certainty: 'certain', privacy: 'default', ...fields, type: fields.type, subject });
    },
    'fact.update'(op) {
      Object.assign(open('facts', resolve(op.fact)), pick(FACT_FIELDS, op.set, fail));
    },
    'fact.remove'(op) {
      open('facts', resolve(op.fact)).deletedAt = env.now;
    },
    'memory.add'(op) {
      const personId = somebody(op.person);
      if (!text(4000)(op.body) || !op.body.trim()) fail('bad_value', 'A memory needs some words, up to 4,000 characters.');
      add('memories', 'm', op.ref, { personId, authorUserId: env.userId, authorName: env.userName, body: op.body.trim(), createdAt: env.now });
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
      if (!before && !op.snapshot) fail('not_found', `That ${NOUNS[op.kind]} does not exist.`);
      // With no snapshot the thing goes to the compost, and undo only does that to something that is there
      const after = op.snapshot ? structuredClone(op.snapshot) : ({ ...before, deletedAt: env.now } as Entity);
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
    if (!handler) fail('unknown_operation', `"${type}" is not an operation.`);
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

/* A sentence for each operation, for review cards, history and AI drafts. */
export function describeOp(op: Op, nameOf: (id: string) => string | null | undefined): string {
  const who = (id: string) => nameOf(id) ?? 'someone new';
  const listed = (set: object | undefined) => Object.keys(set ?? {}).join(', ') || 'details';
  switch (op.type) {
    case 'person.create': return `Add ${[op.set?.given, op.set?.family].filter(Boolean).join(' ') || 'an unnamed person'}`;
    case 'person.update': return `Change ${listed(op.set)} of ${who(op.person)}`;
    case 'person.remove': return `Remove ${who(op.person)}`;
    case 'person.restore': return `Restore ${who(op.person)}`;
    case 'union.create': return `Join ${op.partners.map(who).join(' and ')} as partners`;
    case 'union.update': return `Change ${listed(op.set)} of a partnership`;
    case 'union.remove': return 'Remove a partnership';
    case 'union.add_partner': return `Add ${who(op.person)} as a partner`;
    case 'union.remove_partner': return `Remove ${who(op.person)} from a partnership`;
    case 'child.link': return `Add ${who(op.child)} as a child`;
    case 'child.unlink': return `Remove ${who(op.child)} as a child`;
    case 'fact.add': return `Add ${op.set?.type ?? 'a fact'} for ${who(op.subject?.id)}`;
    case 'fact.update': return `Change ${listed(op.set)} of a fact`;
    case 'fact.remove': return 'Remove a fact';
    case 'memory.add': return `Add a memory of ${who(op.person)}`;
    case 'memory.remove': return 'Remove a memory';
    case 'entity.set': return 'Put something back as it was';
    // The types leave nothing over, but an operation is data and may still be something else
    default: return (op as Op).type;
  }
}
