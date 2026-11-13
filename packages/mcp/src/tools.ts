/*
 * The tools a member's AI client is offered. Each goes through the same views
 * and the same edit pipeline as the app, so the AI can do exactly what its
 * owner can and nothing more. By default its changes arrive as a private draft.
 */

import { CERTAINTY, ComposeError, FACT_TYPES, LIVING, RELATIONS, SEXES, addRelative, birthUnions, fullName, indexOf, isAdmin, livingPartners, parseDate, person, relativeMessage, unionsOf } from '@reactive-family-tree/core';
import type { Actor, EditView, FamilyLookup, Op, Person, RelativeDetails } from '@reactive-family-tree/core';
import { importGedcom } from '@reactive-family-tree/gedcom';
import { HttpError, badRequest, deliverInvite, forbidden, tooMany } from '@reactive-family-tree/server';
import type { ActiveConnection, App, EditRow } from '@reactive-family-tree/server';
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

const SIMPLE_TOOLS = new Set(['whoami', 'search_people', 'get_person', 'get_family', 'add_person', 'update_person', 'add_fact', 'connect_people', 'suggest_correction']);
const MAX_AI_OPS = 200;

export interface Caller {
  actor: Actor;
  connection: ActiveConnection;
}

interface ToolKind {
  writes?: boolean;
  admin?: boolean;
  destructive?: boolean;
}

const WRITES: ToolKind = { writes: true };
const REMOVES: ToolKind = { writes: true, destructive: true };
const ADMIN_WRITES: ToolKind = { writes: true, admin: true };

const text = (description: string) => z.string().describe(description);
const personId = text('The id of a person, from search_people or get_family.');
const DETAILS = {
  given: text('Given name(s).'),
  family: text('Family name used now.').optional(),
  birth_name: text('Family name at birth, if different.').optional(),
  sex: z.enum(SEXES).optional(),
  living: z.enum(LIVING).optional(),
  born: text('Birth date in plain words, only as precisely as known.').optional(),
  died: text('Death date in plain words.').optional(),
  birth_place: text('Town and country of birth.').optional(),
};
const FACT_DETAILS = {
  date: text('In plain words.').optional(),
  place: text('Where.').optional(),
  value: text('For example the occupation.').optional(),
  note: text('Where this comes from, or anything uncertain.').optional(),
  certainty: z.enum(CERTAINTY).optional(),
};

/* A tool's answer as the protocol wants it. A tool that fails tells the model why, so it can correct itself. */
async function answer(run: () => unknown): Promise<CallToolResult> {
  try {
    const result = await run();
    if (typeof result === 'string') return { content: [{ type: 'text', text: result }] };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result as Record<string, unknown> };
  } catch (error) {
    if (!(error instanceof HttpError) && !(error instanceof ComposeError)) throw error;
    const details = error instanceof HttpError && error.details ? `\n${JSON.stringify(error.details)}` : '';
    return { content: [{ type: 'text', text: `${error.message}${details}` }], isError: true };
  }
}

/* The hourly limit on changes, per connection. Kept for the life of the process. */
export type RecentWrites = Map<string, number[]>;

export function registerTools(server: McpServer, app: App, { actor, connection }: Caller, recentWrites: RecentWrites): void {
  const { store, members, edits, views, config } = app;
  const state = store.state;

  const offered = (name: string, kind: ToolKind) => {
    if (kind.admin && !(connection.access === 'admin' && isAdmin(actor))) return false;
    if (kind.writes && connection.access === 'read') return false;
    return connection.profile === 'full' || SIMPLE_TOOLS.has(name);
  };
  const tool = <Shape extends z.ZodRawShape>(name: string, description: string, input: Shape, run: (args: z.infer<z.ZodObject<Shape>>) => unknown, kind: ToolKind = {}) => {
    if (!offered(name, kind)) return;
    server.registerTool(
      name,
      { description, inputSchema: z.object(input), annotations: { readOnlyHint: !kind.writes, destructiveHint: Boolean(kind.destructive), idempotentHint: !kind.writes } },
      (args) => answer(() => run(args as z.infer<z.ZodObject<Shape>>)),
    );
  };

  /* ---------- Helpers the tools share ---------- */

  const need = (id: string): Person => {
    const found = person(state, id);
    if (!found) throw badRequest(`Nobody on the tree has the id "${id}". Use search_people to find people.`);
    return found;
  };
  const family = (): FamilyLookup => {
    const ix = indexOf(state);
    return {
      unionsOf: (id) => unionsOf(ix, id).map((union) => ({ id: union.id, partners: livingPartners(state, union) })),
      birthUnion: (id) => { const born = birthUnions(ix, id)[0]; return born ? { id: born.id, partners: livingPartners(state, born) } : null; },
    };
  };
  const factFields = (args: { type?: (typeof FACT_TYPES)[number]; date?: string; place?: string; value?: string; note?: string; certainty?: (typeof CERTAINTY)[number] }) => ({
    ...(args.type !== undefined ? { type: args.type } : {}),
    ...(args.date !== undefined ? { date: parseDate(args.date) } : {}),
    ...(args.place !== undefined ? { place: args.place } : {}),
    ...(args.value !== undefined ? { value: args.value } : {}),
    ...(args.note !== undefined ? { note: args.note } : {}),
    ...(args.certainty !== undefined ? { certainty: args.certainty } : {}),
  });
  const reviewUrl = (editId: string) => `${config.baseUrl}/#edit=${editId}`;
  const brief = (shown: EditView) => ({
    id: shown.id, status: shown.status, message: shown.message, author: shown.author, origin: shown.origin, at: shown.appliedAt ?? shown.createdAt, changes: shown.lines.map((line) => line.text),
  });
  const briefOf = async (row: EditRow | null) => (row ? brief(await edits.present(row, actor)) : null);

  /* Every write an AI makes goes through here. */
  const write = async (ops: Op[], message: string, { suggest = false }: { suggest?: boolean } = {}) => {
    if (connection.access === 'read') throw forbidden('This connection can read the tree but not change it.');
    if (ops.length > MAX_AI_OPS) throw badRequest(`One edit can hold at most ${MAX_AI_OPS} changes. Split it up.`);
    const hourAgo = Date.now() - 3600000;
    const recent = (recentWrites.get(connection.id) ?? []).filter((time) => time > hourAgo);
    if (recent.length >= store.settings.aiWritesPerHour) throw tooMany('This connection has made a lot of changes in the last hour. Try again later.');
    recentWrites.set(connection.id, [...recent, Date.now()]);

    const reviewFirst = connection.mode === 'review_first';
    const result = await edits.submit(actor, {
      ops, message, origin: 'mcp', connectionId: connection.id,
      mode: reviewFirst ? 'draft' : suggest ? 'suggest' : 'auto',
      note: suggest ? message : '',
    });
    const saved = result.edit as EditRow;
    const next = {
      draft: 'Saved as a draft. Ask the member to open the link, look it over and apply it. You cannot apply it for them.',
      applied: 'Applied. It is on the tree now and can be undone from its history.',
      suggested: 'Sent for review. A steward or admin of that branch will decide.',
    }[result.status as 'draft' | 'applied' | 'suggested'];
    return {
      edit_id: saved.id, status: result.status, next, review_url: reviewUrl(saved.id),
      changes: (await edits.present(saved, actor)).lines.map((line) => line.text),
      warnings: result.warnings, created: result.created,
    };
  };

  /* ---------- Reading ---------- */

  tool('whoami', 'Who you are acting for: the member, their own leaf, their role, the branches they can edit, and how your changes arrive.', {}, () => {
    const me = actor.personId ? person(state, actor.personId) : null;
    return {
      member: actor.name, role: actor.role, own_person: me ? { id: me.id, name: fullName(me) } : null,
      branches: actor.anchors.map((id) => ({ anchor: id, name: fullName(person(state, id)) })),
      can_edit_everywhere: isAdmin(actor),
      changes_arrive_as: connection.mode === 'review_first' ? 'a draft the member approves' : 'applied at once inside their branches, suggestions elsewhere',
      access: connection.access, family: store.settings.familyName,
    };
  });
  tool('search_people', 'Find people by name, birth year or birthplace. Always search before adding someone.', { query: text('Name or part of a name. May include a year or place.') },
    ({ query }) => ({ people: views.search(actor, query) }));
  tool('get_person', 'One person in full: names, facts with their ids, parents, partners, children, memories.', { person: personId },
    (args) => views.person(actor, args.person));
  tool('get_family', 'A compact outline of a person’s descendants, ancestors, or both, with ids. Cheap to read.', {
    person: personId, direction: z.enum(['descendants', 'ancestors', 'both']).optional(), depth: z.number().int().min(1).max(8).optional(),
  }, ({ person: id, direction = 'descendants', depth = 4 }) => views.outline(actor, need(id).id, direction, depth));
  tool('find_relationship', 'How two people are connected, as a chain of relatives.', { from: personId, to: personId },
    ({ from, to }) => views.relationship(actor, from, to));
  tool('list_gaps', 'Missing or suspicious data in the member’s branches: no dates, no parents, impossible dates. A to-do list.', {},
    () => views.health(actor));
  tool('get_history', 'Recent published edits, for one person or for everything the member looks after.', { person: personId.optional() },
    async (args) => ({ edits: (await edits.presentAll(await edits.list(actor, 'activity', { personId: args.person ?? null, limit: 20 }), actor)).map(brief) }));

  /* ---------- Changing ---------- */

  tool('add_person', 'Add someone new as the child, partner, parent or sibling of a person already on the tree.', {
    relative_of: personId, relation: z.enum(RELATIONS), ...DETAILS,
  }, (args) => {
    const of = need(args.relative_of);
    const details: RelativeDetails = {
      given: args.given, family: args.family ?? '', birthName: args.birth_name ?? '', sex: args.sex ?? 'unknown',
      ...(args.living ? { living: args.living } : {}), born: args.born, died: args.died, birthPlace: args.birth_place,
    };
    const { ops } = addRelative(family(), { of: of.id, relation: args.relation, details });
    return write(ops, relativeMessage(args.relation, details, fullName(of)));
  }, WRITES);
  tool('update_person', 'Change a person’s names, sex, living state or story.', {
    person: personId, given: DETAILS.given.optional(), family: DETAILS.family, birth_name: DETAILS.birth_name, sex: DETAILS.sex, living: DETAILS.living, bio: text('Their story, as plain text.').optional(),
  }, ({ person: id, birth_name, ...rest }) => {
    const set = { ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)), ...(birth_name !== undefined ? { birthName: birth_name } : {}) };
    if (!Object.keys(set).length) throw badRequest('Say what to change.');
    return write([{ type: 'person.update', person: need(id).id, set }], `Update ${fullName(need(id))}`);
  }, WRITES);
  tool('add_fact', 'Record something that happened to a person: birth, death, occupation, residence and so on.', {
    person: personId, type: z.enum(FACT_TYPES), ...FACT_DETAILS,
  }, (args) => write([{ type: 'fact.add', subject: { type: 'person', id: need(args.person).id }, set: factFields(args) }], `Add ${args.type} for ${fullName(need(args.person))}`), WRITES);
  tool('update_fact', 'Change a fact. Get its id from get_person.', { fact: text('The id of the fact.'), ...FACT_DETAILS },
    (args) => write([{ type: 'fact.update', fact: args.fact, set: factFields(args) }], 'Correct a fact'), WRITES);
  tool('remove_fact', 'Remove a fact. Get its id from get_person.', { fact: text('The id of the fact.') },
    (args) => write([{ type: 'fact.remove', fact: args.fact }], 'Remove a fact'), REMOVES);
  tool('connect_people', 'Connect two people already on the tree: as partners, or the first as parent of the second.', {
    first: personId, second: personId, as: z.enum(['partners', 'parent_and_child']), since: z.number().int().describe('Year the partnership began.').optional(),
  }, (args) => {
    const a = need(args.first), b = need(args.second);
    if (args.as === 'partners') {
      return write([{ type: 'union.create', partners: [a.id, b.id], set: { host: a.id, since: args.since ?? null } }], `Join ${fullName(a)} and ${fullName(b)} as partners`);
    }
    const union = family().unionsOf(a.id)[0];
    const ops: Op[] = union ? [] : [{ type: 'union.create', ref: '$family', partners: [a.id], set: { kind: 'unknown' } }];
    ops.push({ type: 'child.link', union: union?.id ?? '$family', child: b.id });
    return write(ops, `Record ${fullName(a)} as a parent of ${fullName(b)}`);
  }, WRITES);
  tool('disconnect_people', 'Undo a wrong connection between a parent and a child.', { parent: personId, child: personId }, (args) => {
    const union = birthUnions(indexOf(state), args.child).find((candidate) => candidate.partners.includes(args.parent));
    if (!union) throw badRequest('Those two are not recorded as parent and child.');
    return write([{ type: 'child.unlink', union: union.id, child: args.child }], 'Remove a parent and child link');
  }, REMOVES);
  tool('add_memory', 'Add a memory of a person, in the member’s own name and words.', { person: personId, body: text('The memory.') },
    (args) => write([{ type: 'memory.add', person: need(args.person).id, body: args.body }], `A memory of ${fullName(need(args.person))}`), WRITES);
  tool('suggest_correction', 'Propose a fix to something the member cannot edit. It goes to that branch’s steward with the note.', {
    person: personId, field: z.enum(['given', 'family', 'birth_name', 'birth', 'death']), value: text('The corrected value. For birth and death, a date in plain words.'),
    note: text('Why: what shows this is right.'),
  }, async (args) => {
    const target = await views.person(actor, args.person);
    const { field } = args;
    let op: Op;
    if (field === 'birth' || field === 'death') {
      const existing = target.facts.find((fact) => fact.type === field);
      op = existing ? { type: 'fact.update', fact: existing.id, set: { date: parseDate(args.value) } }
        : { type: 'fact.add', subject: { type: 'person', id: target.id }, set: { type: field, date: parseDate(args.value) } };
    } else {
      op = { type: 'person.update', person: target.id, set: { [field === 'birth_name' ? 'birthName' : field]: args.value } };
    }
    return write([op], args.note, { suggest: true });
  }, WRITES);
  tool('remove_person', 'Move a person to the compost. They can be restored for 30 days.', { person: personId },
    (args) => write([{ type: 'person.remove', person: need(args.person).id }], `Remove ${fullName(need(args.person))}`), REMOVES);
  tool('apply_edit', 'Submit several operations as one edit, for adding a whole family at once. New things can be named with "$name" and used later in the same edit. Read tree://schema first.', {
    operations: z.array(z.looseObject({ type: z.string() })).describe('Operations such as person.create, fact.add, union.create, child.link.'),
    message: text('One line describing the edit.'), dry_run: z.boolean().describe('Check without saving.').optional(),
  }, async (args) => {
    const ops = args.operations as unknown as Op[];
    if (!args.dry_run) return write(ops, args.message);
    const { status, reasons, warnings } = await edits.submit(actor, { ops, mode: 'dry' });
    return { status, reasons, warnings };
  }, WRITES);

  /* ---------- Managing edits ---------- */

  tool('list_edits', 'The member’s own drafts and suggestions, and decisions made on them.', {},
    async () => ({ edits: (await edits.presentAll(await edits.list(actor, 'mine'), actor)).map(brief) }));
  tool('get_edit', 'One edit in full, line by line.', { edit: text('The id of the edit.') }, async (args) => {
    const found = await edits.need(args.edit);
    if (!edits.canSee(actor, found)) throw forbidden('That edit is not yours to see.');
    return edits.present(found, actor);
  });
  tool('discard_draft', 'Throw away one of the member’s drafts.', { edit: text('The id of the draft.') }, async (args) => {
    await edits.discardDraft(actor, args.edit);
    return { discarded: args.edit };
  }, REMOVES);
  tool('revert_edit', 'Undo a published edit the member is allowed to undo.', { edit: text('The id of the edit.') }, async (args) => {
    if (connection.mode === 'review_first') throw forbidden('This connection saves drafts only. The member can undo edits in the app.');
    return briefOf((await edits.revert(actor, args.edit)).edit);
  }, REMOVES);

  /* ---------- For admins only ---------- */

  tool('list_suggestions', 'Admin: suggestions waiting for review.', {},
    async () => ({ suggestions: await edits.presentAll(await edits.list(actor, 'review'), actor) }), { admin: true });
  tool('review_suggestion', 'Admin: approve or decline a suggestion. Declining needs a note for its author.', {
    edit: text('The id of the suggestion.'), action: z.enum(['approve', 'decline']), note: text('Shown to the author.').optional(),
  }, async (args) => briefOf((await edits.review(actor, args.edit, { action: args.action, note: args.note ?? '' })).edit), ADMIN_WRITES);
  tool('invite_member', 'Admin: invite a relative, optionally as a person on the tree. Returns a link to pass on, and the address it was emailed to if this tree sends email.', {
    email: text('Their email address.'), person: personId.optional(), role: z.enum(['member', 'admin']).optional(),
  }, async (args) => {
    const made = await deliverInvite(app, await members.createInvite(actor, { email: args.email, role: args.role ?? 'member', personId: args.person ?? null }), actor.name);
    return { invitation_link: made.link, emailed_to: made.emailedTo };
  }, ADMIN_WRITES);
  tool('assign_branch', 'Admin: make a member the steward of a branch, anchored at a person.', { member_email: text('The member’s email.'), anchor: personId }, async (args) => {
    const member = (await members.members()).find((candidate) => candidate.email === args.member_email.toLowerCase());
    if (!member) throw badRequest('No member has that email.');
    await members.addGrant(member.id, need(args.anchor).id, actor.name);
    app.hub.inbox([member.id]);
    return { steward: member.name, branch: fullName(need(args.anchor)) };
  }, ADMIN_WRITES);
  tool('import_gedcom', 'Admin: stage a GEDCOM file as a draft to preview and apply in the app.', { gedcom: text('The contents of the file.') }, async (args) => {
    const parsed = importGedcom(args.gedcom);
    const result = await edits.submit(actor, { ops: parsed.ops, message: `Import ${parsed.people} people from a GEDCOM file`, origin: 'import', connectionId: connection.id, mode: 'draft' });
    const saved = result.edit as EditRow;
    return { edit_id: saved.id, status: 'draft', people: parsed.people, families: parsed.families, not_understood: parsed.skipped, review_url: reviewUrl(saved.id) };
  }, ADMIN_WRITES);
}
