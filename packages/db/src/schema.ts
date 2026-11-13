/*
 * The family's own tables.
 *
 * People, partnerships, facts and memories are the family itself. Everything
 * that changes them is an edit, and every edit is kept. Around them sit the
 * things that decide who may do what: branch grants, invitations, AI
 * connections and the admin's settings.
 *
 * Times are ISO strings, as the shared rules use them.
 */

import type {
  Certainty,
  Change,
  ChildKind,
  ConnectionAccess,
  ConnectionKind,
  ConnectionMode,
  Contact,
  EditOrigin,
  EditStatus,
  FactType,
  FuzzyDate,
  Issue,
  Living,
  Op,
  Privacy,
  Role,
  Sex,
  ToolProfile,
  UnionKind,
  UnionStatus,
} from '@reactive-family-tree/core';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/* ---------- The family ---------- */

export const person = sqliteTable('person', {
  id: text('id').primaryKey(),
  rev: integer('rev').notNull(),
  given: text('given').notNull(),
  family: text('family').notNull(),
  birthName: text('birth_name').notNull(),
  sex: text('sex').$type<Sex>().notNull(),
  living: text('living').$type<Living>().notNull(),
  privacy: text('privacy').$type<Privacy>().notNull(),
  bio: text('bio').notNull(),
  consentAt: text('consent_at'),
  deletedAt: text('deleted_at'),
});

/* A partnership. "union" is a reserved word in SQL, so the table carries a longer name. */
export const union = sqliteTable('family_union', {
  id: text('id').primaryKey(),
  rev: integer('rev').notNull(),
  kind: text('kind').$type<UnionKind>().notNull(),
  status: text('status').$type<UnionStatus>().notNull(),
  hostPersonId: text('host_person_id'),
  since: integer('since'),
  deletedAt: text('deleted_at'),
});

export const unionPartner = sqliteTable(
  'union_partner',
  {
    unionId: text('union_id').notNull(),
    personId: text('person_id').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [primaryKey({ columns: [table.unionId, table.personId] }), index('union_partner_person_idx').on(table.personId)],
);

export const unionChild = sqliteTable(
  'union_child',
  {
    unionId: text('union_id').notNull(),
    childId: text('child_id').notNull(),
    kind: text('kind').$type<ChildKind>().notNull(),
    position: integer('position').notNull(),
  },
  (table) => [primaryKey({ columns: [table.unionId, table.childId] }), index('union_child_child_idx').on(table.childId)],
);

export const fact = sqliteTable(
  'fact',
  {
    id: text('id').primaryKey(),
    rev: integer('rev').notNull(),
    subjectType: text('subject_type').$type<'person' | 'union'>().notNull(),
    subjectId: text('subject_id').notNull(),
    type: text('type').$type<FactType>().notNull(),
    date: text('date', { mode: 'json' }).$type<FuzzyDate>(),
    /* The earliest possible day as a number, for ordering. */
    dateSort: integer('date_sort'),
    place: text('place').notNull(),
    value: text('value').notNull(),
    note: text('note').notNull(),
    certainty: text('certainty').$type<Certainty>().notNull(),
    privacy: text('privacy').$type<Privacy>().notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [index('fact_subject_idx').on(table.subjectId)],
);

export const memory = sqliteTable(
  'memory',
  {
    id: text('id').primaryKey(),
    rev: integer('rev').notNull(),
    personId: text('person_id').notNull(),
    authorUserId: text('author_user_id'),
    authorName: text('author_name').notNull(),
    body: text('body').notNull(),
    createdAt: text('created_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [index('memory_person_idx').on(table.personId)],
);

/* ---------- Edits: the single write path, and the history ---------- */

export const edit = sqliteTable(
  'edit',
  {
    id: text('id').primaryKey(),
    /* Assigned when applied. The order of history, and what browsers sync on. */
    seq: integer('seq'),
    status: text('status').$type<EditStatus>().notNull(),
    authorUserId: text('author_user_id'),
    authorName: text('author_name').notNull(),
    /* A visitor who suggested something leaves a name and an email instead of an account. */
    authorContact: text('author_contact', { mode: 'json' }).$type<Contact>(),
    origin: text('origin').$type<EditOrigin>().notNull(),
    connectionId: text('connection_id'),
    message: text('message').notNull(),
    note: text('note').notNull(),
    ops: text('ops', { mode: 'json' }).$type<Op[]>().notNull(),
    /* How everything it touched was before, and is after. Undo is built from this. */
    changes: text('changes', { mode: 'json' }).$type<Change[]>().notNull(),
    warnings: text('warnings', { mode: 'json' }).$type<Issue[]>().notNull(),
    /* The people it is about, so history can be shown per person and per branch. */
    touched: text('touched', { mode: 'json' }).$type<string[]>().notNull(),
    reviewedBy: text('reviewed_by'),
    reviewNote: text('review_note'),
    revertsEditId: text('reverts_edit_id'),
    createdAt: text('created_at').notNull(),
    appliedAt: text('applied_at'),
  },
  (table) => [index('edit_status_idx').on(table.status, table.createdAt), index('edit_seq_idx').on(table.seq), index('edit_author_idx').on(table.authorUserId)],
);

export const editComment = sqliteTable(
  'edit_comment',
  {
    id: text('id').primaryKey(),
    editId: text('edit_id').notNull(),
    authorName: text('author_name').notNull(),
    body: text('body').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('edit_comment_edit_idx').on(table.editId)],
);

export const notification = sqliteTable(
  'notification',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    editId: text('edit_id'),
    body: text('body').notNull(),
    createdAt: text('created_at').notNull(),
    readAt: text('read_at'),
  },
  (table) => [index('notification_user_idx').on(table.userId, table.readAt)],
);

/* ---------- Who may do what ---------- */

/* A member with at least one grant is a steward of those branches. */
export const branchGrant = sqliteTable(
  'branch_grant',
  {
    userId: text('user_id').notNull(),
    anchorPersonId: text('anchor_person_id').notNull(),
    grantedBy: text('granted_by'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.anchorPersonId] })],
);

export const invite = sqliteTable('invite', {
  id: text('id').primaryKey(),
  /* Only the hash is kept. The link itself is shown or sent once. */
  tokenHash: text('token_hash').notNull().unique(),
  email: text('email').notNull(),
  role: text('role').$type<Role>().notNull(),
  personId: text('person_id'),
  grantBranch: integer('grant_branch', { mode: 'boolean' }).notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
});

export const joinRequest = sqliteTable('join_request', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  message: text('message').notNull(),
  status: text('status').$type<'waiting' | 'approved' | 'declined'>().notNull(),
  decidedBy: text('decided_by'),
  createdAt: text('created_at').notNull(),
});

/* One row per connected AI client, whether it signed in or carries a personal token. */
export const aiConnection = sqliteTable(
  'ai_connection',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').$type<ConnectionKind>().notNull(),
    /* For a personal token: its hash. The token is shown once. */
    tokenHash: text('token_hash').unique(),
    /* For a client that signed in: the OAuth client it is. */
    oauthClientId: text('oauth_client_id'),
    mode: text('mode').$type<ConnectionMode>().notNull(),
    access: text('access').$type<ConnectionAccess>().notNull(),
    profile: text('profile').$type<ToolProfile>().notNull(),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at'),
    revokedAt: text('revoked_at'),
  },
  (table) => [index('ai_connection_user_idx').on(table.userId), index('ai_connection_client_idx').on(table.userId, table.oauthClientId)],
);

/* ---------- Settings ---------- */

/* Everything the admin configures from the UI: one row per setting. */
export const setting = sqliteTable('setting', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
});

/* Counters the app keeps for itself: the sequence number of history, and the version of the settings. */
export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
