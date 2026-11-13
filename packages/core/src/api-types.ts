/*
 * What the server sends and the app receives. One set of shapes, shared by the
 * services, the web API, the React package and AI clients.
 */

import type { ChildKind, ChildLink, Certainty, FactType, FuzzyDate, Issue, KinStep, Living, Op, Privacy, Role, Sex, UnionKind, UnionStatus, Visibility } from './types';

export type EditStatus = 'draft' | 'suggested' | 'applied' | 'declined' | 'withdrawn' | 'reverted';
export type EditOrigin = 'ui' | 'mcp' | 'api' | 'import' | 'system';

/* What this viewer's change to a person would do: publish, wait for review, or not be offered at all. */
export type Reach = 'apply' | 'suggest' | 'none';

/* ---------- The tree ---------- */

/* Someone who exists only in a suggestion or a draft so far, drawn in pencil. */
export interface PendingMark {
  editId: string;
  by: string;
  status: EditStatus;
}

export interface PersonLeaf {
  id: string;
  masked?: false;
  given: string;
  family: string;
  birthName: string;
  sex: Sex;
  born: number | null;
  died: number | null;
  /* No longer living, by record or by the family's "presumed living" rule. */
  gone: boolean;
  privacy: Privacy;
  pending: PendingMark | null;
  editing: Reach;
}

/* A relative this viewer may not see. They keep their place in the tree's shape and nothing else. */
export interface MaskedLeaf {
  id: string;
  masked: true;
}

export type TreePerson = PersonLeaf | MaskedLeaf;

export interface TreeUnion {
  id: string;
  partners: string[];
  host: string | null;
  since: number | null;
  status: UnionStatus;
  kind: UnionKind;
  pending: PendingMark | null;
  children: ChildLink[];
}

export interface FamilyHeader {
  name: string;
  description: string;
  visibility: Visibility;
}

export interface TreeSnapshot {
  /* The number of the last applied edit. Browsers sync on it. */
  seq: number;
  family: FamilyHeader;
  /* A private tree, seen by a visitor: nothing but the family's name. */
  closed: boolean;
  people: TreePerson[];
  unions: TreeUnion[];
  rootId: string | null;
}

/* ---------- One person ---------- */

export interface RelativeBrief {
  id: string | null;
  name: string;
  masked?: boolean;
  born?: number | null;
  died?: number | null;
}

export interface FactView {
  id: string;
  type: FactType;
  date: FuzzyDate | null;
  dateText: string;
  place: string;
  value: string;
  note: string;
  certainty: Certainty;
  privacy: Privacy;
}

export interface UnionView {
  id: string;
  kind: UnionKind;
  status: UnionStatus;
  since: number | null;
  host: string | null;
  partner: RelativeBrief | null;
  children: (RelativeBrief & { kind: ChildKind })[];
}

export interface MemoryView {
  id: string;
  author: string;
  body: string;
  at: string;
  mine: boolean;
}

export interface PersonDetail {
  id: string;
  given: string;
  family: string;
  birthName: string;
  name: string;
  sex: Sex;
  living: Living;
  gone: boolean;
  privacy: Privacy;
  consented: boolean;
  bio: string;
  born: number | null;
  died: number | null;
  facts: FactView[];
  unions: UnionView[];
  siblings: RelativeBrief[];
  memories: MemoryView[];
  /* Suggestions about this person that are waiting, for those who may see them. */
  waiting: EditView[];
  parents: RelativeBrief[];
  parentUnionId: string | null;
  isSelf: boolean;
  editing: Reach;
  canRemove: boolean;
}

export interface SearchHit {
  id: string;
  name: string;
  birthName: string;
  born: number | null;
  died: number | null;
}

export interface RelationshipStep extends KinStep {
  name: string;
}

export interface Relationship {
  connected: boolean;
  steps: RelationshipStep[];
}

/* ---------- Edits ---------- */

export interface EditLineField {
  field: string;
  to: string;
  was?: string;
  /* Set when something else changed this since the suggestion was written. */
  now?: string;
}

export interface EditLine {
  text: string;
  subject: string | null;
  factType: string | null;
  fields: EditLineField[];
}

export interface EditComment {
  author: string;
  body: string;
  at: string;
}

/* An edit as the app and AI clients show it: plain sentences, with before and after. */
export interface EditView {
  id: string;
  seq: number | null;
  status: EditStatus;
  origin: EditOrigin;
  /* The AI connection that made it, if one did. */
  client: string | null;
  author: string;
  byVisitor: boolean;
  message: string;
  note: string;
  lines: EditLine[];
  warnings: Issue[];
  touched: string[];
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string;
  appliedAt: string | null;
  mine: boolean;
  canReview: boolean;
  canRevert: boolean;
  /* The raw changes, for the two people who may alter them: the author of a draft and a reviewer. */
  ops: Op[] | null;
  comments: EditComment[];
}

export type SubmitStatus = EditStatus | 'denied';

export interface EditResult {
  status: SubmitStatus;
  editId: string | null;
  warnings: Issue[];
  created: Record<string, string>;
  reasons: string[];
  /* Changes still left in a draft after part of it was applied. */
  remaining: number;
  edit: EditView | null;
}

export type SubmitMode = 'auto' | 'suggest' | 'draft' | 'dry';

/* ---------- The session, members and settings ---------- */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  personId: string | null;
  anchors: string[];
  /* Whether they can sign in with a passkey, which needs no email. */
  hasPasskey: boolean;
}

export interface InboxCounts {
  review: number;
  drafts: number;
  unread: number;
}

export interface DemoAccount {
  email: string;
  name: string;
  blurb: string;
}

/* What every browser is told, signed in or not. */
export interface PublicSettings {
  familyName: string;
  description: string;
  visibility: Visibility;
  visitorsCanSuggest: boolean;
  allowJoinRequests: boolean;
  allowAi: boolean;
  allowAiDirect: boolean;
  stewardsCanInvite: boolean;
}

export interface SessionInfo {
  user: SessionUser | null;
  settings: PublicSettings;
  counts: InboxCounts;
  /* Ready-made accounts, offered only when the install runs in demo mode. */
  demoAccounts: DemoAccount[];
  /* Which ways of signing in this install offers. */
  signIn: { google: boolean; passkeys: boolean; emailWorks: boolean };
  /* A fresh install that nobody has claimed yet. */
  needsSetup: boolean;
  /* The install runs the fictional demo family and may be reset from the UI. */
  demo: boolean;
}

/* Everything the admin can set from the UI. */
export interface AdminSettings {
  familyName: string;
  description: string;
  visibility: Visibility;
  visitorsCanSuggest: boolean;
  allowJoinRequests: boolean;
  stewardsCanInvite: boolean;
  stewardsReview: boolean;
  livingAge: number;
  guidelines: string;
  allowAi: boolean;
  allowAiDirect: boolean;
  aiWritesPerHour: number;
}

export interface MemberView {
  id: string;
  name: string;
  role: Role;
  personId: string | null;
  personName: string | null;
  anchors: string[];
  anchorNames: (string | null)[];
  /* Admins only. */
  email?: string;
  ai?: { lastUsedAt: string | null } | null;
}

export interface InviteView {
  id: string;
  email: string;
  role: Role;
  personName: string | null;
  by: string;
}

export interface JoinRequestView {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

export interface MembersInfo {
  members: MemberView[];
  invites: InviteView[];
  requests: JoinRequestView[];
}

/* An invitation as the one who made it gets it back. */
export interface InviteMade {
  id: string;
  /* The link to pass on. It is shown this once. */
  link: string;
  /* The address the invitation was also emailed to, when this server sends email. */
  emailedTo: string | null;
}

export interface OpenInvite {
  email: string;
  role: Role;
  personName: string | null;
  invitedBy: string;
}

export interface NotificationView {
  id: string;
  kind: string;
  editId: string | null;
  body: string;
  at: string;
  readAt: string | null;
}

export interface CompostItem {
  id: string;
  name: string;
  removedAt: string;
}

/* ---------- AI connections ---------- */

export type ConnectionMode = 'review_first' | 'apply_directly';
export type ConnectionAccess = 'read' | 'write' | 'admin';
export type ToolProfile = 'full' | 'simple';
export type ConnectionKind = 'token' | 'oauth';

export interface ConnectionView {
  id: string;
  userId: string;
  name: string;
  kind: ConnectionKind;
  mode: ConnectionMode;
  access: ConnectionAccess;
  profile: ToolProfile;
  createdAt: string;
  lastUsedAt: string | null;
  owner?: string;
}

export interface ConnectionsInfo {
  address: string;
  /* Whether an AI client can connect by signing in, with nothing to copy. It needs HTTPS. */
  signIn: boolean;
  connections: ConnectionView[];
  /* Admins see every member's connections. */
  everyone: ConnectionView[];
}

/* ---------- Tree health ---------- */

export interface HealthEntry {
  id: string;
  name: string;
  detail: string;
}

export interface HealthReport {
  unnamed: HealthEntry[];
  noBirthDate: HealthEntry[];
  noParents: HealthEntry[];
  suspicious: Issue[];
  /* Admins only. */
  withoutSteward?: number;
  total?: number;
}
