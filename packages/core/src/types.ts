/*
 * The words of the family, as types.
 *
 * State is four maps of plain objects. Removed things keep their place with
 * `deletedAt` set (the compost), and every question about the family ignores them.
 */

export type Sex = 'female' | 'male' | 'other' | 'unknown';
export type Living = 'yes' | 'no' | 'unknown';
export type Privacy = 'default' | 'public' | 'members' | 'private';
export type UnionKind = 'marriage' | 'partnership' | 'unknown';
export type UnionStatus = 'current' | 'ended' | 'unknown';
export type ChildKind = 'birth' | 'adopted' | 'step' | 'foster' | 'unknown';
export type Certainty = 'certain' | 'probable' | 'uncertain';
export type FactType = 'birth' | 'death' | 'burial' | 'residence' | 'occupation' | 'education' | 'immigration' | 'military' | 'religion' | 'custom';

/*
 * A date as it is actually known. `from` and `to` are "1921", "1921-03" or
 * "1921-03-04": as precise as what was given. `text` keeps wording that is not
 * a date at all ("before the war").
 */
export type FuzzyDate =
  | { kind: 'exact' | 'about' | 'before' | 'after'; from: string }
  | { kind: 'between' | 'or'; from: string; to: string }
  | { kind: 'text'; text: string };

/* ---------- The family ---------- */

export interface Person {
  id: string;
  rev: number;
  given: string;
  family: string;
  birthName: string;
  sex: Sex;
  living: Living;
  privacy: Privacy;
  bio: string;
  /* Their one photo: the id of a stored image, or nothing. On the tree it can take the leaf's place. */
  portrait: string | null;
  /* When a living person chose, from their own account, to be public. */
  consentAt: string | null;
  deletedAt: string | null;
}

export interface ChildLink {
  id: string;
  kind: ChildKind;
}

export interface Union {
  id: string;
  rev: number;
  kind: UnionKind;
  status: UnionStatus;
  /* The partner whose branch the couple and their children are drawn on. */
  host: string | null;
  since: number | null;
  partners: string[];
  children: ChildLink[];
  deletedAt: string | null;
}

export interface FactSubject {
  type: 'person' | 'union';
  id: string;
}

export interface Fact {
  id: string;
  rev: number;
  subject: FactSubject;
  type: FactType;
  date: FuzzyDate | null;
  place: string;
  value: string;
  note: string;
  certainty: Certainty;
  privacy: Privacy;
  deletedAt: string | null;
}

export interface Memory {
  id: string;
  rev: number;
  personId: string;
  authorUserId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface State {
  people: Map<string, Person>;
  unions: Map<string, Union>;
  facts: Map<string, Fact>;
  memories: Map<string, Memory>;
}

export type EntityKind = keyof State;
export interface EntityOf {
  people: Person;
  unions: Union;
  facts: Fact;
  memories: Memory;
}
export type Entity = EntityOf[EntityKind];

/* What an edit did to one thing: how it was, and how it is. History and undo are built from these. */
export interface Change<K extends EntityKind = EntityKind> {
  kind: K;
  id: string;
  before: EntityOf[K] | null;
  after: EntityOf[K];
}

/* ---------- Operations: the only way the family changes ---------- */

export type PersonFields = Pick<Person, 'given' | 'family' | 'birthName' | 'bio' | 'sex' | 'living' | 'privacy' | 'portrait'>;
export type UnionFields = Pick<Union, 'kind' | 'status' | 'host' | 'since'>;
export type FactFields = Pick<Fact, 'type' | 'date' | 'place' | 'value' | 'note' | 'certainty' | 'privacy'>;

/* How the fields were when a change was written, kept for reviewers and history. Set by the server. */
type Was = Record<string, unknown>;

/* An id, or a "$name" given to something created earlier in the same edit. */
export type Ref = string;

export type Op =
  | { type: 'person.create'; ref?: Ref; set?: Partial<PersonFields> }
  | { type: 'person.update'; person: Ref; set?: Partial<PersonFields>; consent?: boolean; was?: Was }
  | { type: 'person.remove'; person: Ref }
  | { type: 'person.restore'; person: Ref }
  | { type: 'union.create'; ref?: Ref; partners: Ref[]; set?: Partial<UnionFields> }
  | { type: 'union.update'; union: Ref; set?: Partial<UnionFields>; was?: Was }
  | { type: 'union.remove'; union: Ref }
  | { type: 'union.add_partner'; union: Ref; person: Ref }
  | { type: 'union.remove_partner'; union: Ref; person: Ref }
  | { type: 'child.link'; union: Ref; child: Ref; kind?: ChildKind }
  | { type: 'child.unlink'; union: Ref; child: Ref }
  | { type: 'fact.add'; ref?: Ref; subject: FactSubject; set?: Partial<FactFields> }
  | { type: 'fact.update'; fact: Ref; set?: Partial<FactFields>; was?: Was }
  | { type: 'fact.remove'; fact: Ref }
  | { type: 'memory.add'; ref?: Ref; person: Ref; body: string }
  | { type: 'memory.remove'; memory: Ref }
  /* Put one thing back exactly as it was. Only undo produces this. */
  | { type: 'entity.set'; kind: EntityKind; id: string; snapshot: Entity | null };

export type OpType = Op['type'];

/* What applying needs from its surroundings: fresh ids, the time, and who is acting. */
export interface OpEnv {
  newId(prefix: string): string;
  now: string;
  userId: string | null;
  userName: string;
}

export interface Applied {
  changes: Change[];
  /* The ids given to things created under a "$name". */
  created: Record<string, string>;
}

/* ---------- Who is acting ---------- */

export type Role = 'owner' | 'admin' | 'member';

export interface Contact {
  name: string;
  email: string;
}

export interface Actor {
  userId: string | null;
  name: string;
  role: Role | null;
  /* The leaf this account is. */
  personId: string | null;
  /* The people whose branches this account looks after. */
  anchors: string[];
  visitor: boolean;
  contact?: Contact | null;
}

export type Visibility = 'private' | 'public_masked' | 'public';

/* The settings the shared rules read. The app's full settings extend this. */
export interface RuleSettings {
  visibility: Visibility;
  visitorsCanSuggest: boolean;
  livingAge: number;
}

/* A branch: the anchors and every descendant (the core), and the partners of those people. */
export interface Scope {
  core: Set<string>;
  partners: Set<string>;
}

export type Outcome = 'apply' | 'suggest' | 'deny';

export interface Step {
  outcome: Outcome;
  reason?: string;
}

export interface Decision {
  outcome: Outcome;
  steps: Step[];
  reasons: string[];
}

export interface Issue {
  code: string;
  message: string;
  /* The people already on the tree whom the message names or gives away. It is kept from anyone who may not see one of them. */
  people?: string[];
}

export interface Validation {
  errors: Issue[];
  warnings: Issue[];
}

/* One step along the way between two relatives. */
export interface PathStep {
  person: string;
  how: 'parent' | 'child' | 'partner';
}

export interface KinStep {
  how: PathStep['how'];
  sex: Sex;
}

export type Relation = 'child' | 'partner' | 'parent' | 'sibling';
