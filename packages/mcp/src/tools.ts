/*
 * The tools a member's AI client is offered. Each goes through the same views
 * and the same edit pipeline as the app, so the AI can do exactly what its
 * owner can and nothing more. By default its changes arrive as a private draft.
 */

import { CERTAINTY, ComposeError, FACT_TYPES, IN_LANGUAGE, LANGS, LIVING, RELATIONS, SEXES, TEXT_FIELDS, addRelative, birthUnions, describeOp, fullName, indexOf, isAdmin, livingPartners, parseDate, person, relativeMessage, say, unionsOf } from '@reactive-family-tree/core';
import type { Actor, EditView, FamilyLookup, Lang, Op, Person, RelativeDetails } from '@reactive-family-tree/core';
import { importGedcom } from '@reactive-family-tree/gedcom';
import { HttpError, badRequest, deliverInvite, familyPatch, forbidden, tell, tooMany, translationsOf } from '@reactive-family-tree/server';
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
/* Which language some text is in, or which language to show the family's words in. */
const WRITTEN_IN = z.enum(LANGS).describe('The language the text you send is written in: en, he or ru. Leave it out when it is the member’s own.').optional();
const SHOWN_IN = z.enum(LANGS).describe('The language to show names and stories in: en, he or ru. Leave it out for the member’s own. Where something is not written in it yet, it is shown in the language it was written in.').optional();
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
  /*
   * What an edit is called in the family's history. The member's relatives read it there, so it is said in the
   * member's language, by what the edit's first change does: "Change story of Iris Bell".
   */
  const lang = actor.lang ?? store.settings.language;
  const titled = (ops: Op[]): string => describeOp(ops[0] as Op, (id) => { const found = person(state, id); return found ? fullName(found, lang) : null; }, lang, {
    langOf: (id) => state.people.get(id)?.lang ?? state.facts.get(id)?.lang ?? null,
    memoryOf: (id) => state.memories.get(id)?.personId ?? null,
  });
  /* The member, reading the tree in another language for one answer. */
  const reading = (lang: Lang | undefined): Actor => (lang ? { ...actor, lang } : actor);
  /* Operations that write text, marked with the language it is in. */
  const inLang = (ops: Op[], lang: Lang | undefined): Op[] => (lang ? ops.map((op) => (
    op.type === 'person.create' || op.type === 'person.update' || op.type === 'fact.add' || op.type === 'fact.update' || op.type === 'memory.add' ? { ...op, lang } : op)) : ops);

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
      languages: LANGS, family_language: store.settings.language, member_language: actor.lang ?? store.settings.language,
    };
  });
  tool('search_people', 'Find people by name, birth year or birthplace, in any of the tree’s languages. Always search before adding someone.', { query: text('Name or part of a name. May include a year or place.'), language: SHOWN_IN },
    ({ query, language }) => ({ people: views.search(reading(language), query) }));
  tool('get_person', 'One person in full: names, facts with their ids, parents, partners, children, memories. "words" says which texts are shown in another language than the one asked for, and which are out of date.', { person: personId, language: SHOWN_IN },
    (args) => views.person(reading(args.language), args.person));
  tool('get_family', 'A compact outline of a person’s descendants, ancestors, or both, with ids. Cheap to read.', {
    person: personId, direction: z.enum(['descendants', 'ancestors', 'both']).optional(), depth: z.number().int().min(1).max(8).optional(), language: SHOWN_IN,
  }, ({ person: id, direction = 'descendants', depth = 4, language }) => views.outline(reading(language), need(id).id, direction, depth));
  tool('find_relationship', 'How two people are connected, as a chain of relatives.', { from: personId, to: personId, language: SHOWN_IN },
    ({ from, to, language }) => views.relationship(reading(language), from, to));
  tool('list_gaps', 'Missing or suspicious data in the member’s branches: no dates, no parents, impossible dates. A to-do list.', { language: SHOWN_IN },
    ({ language }) => views.health(reading(language)));
  tool('get_history', 'Recent published edits, for one person or for everything the member looks after.', { person: personId.optional(), language: SHOWN_IN },
    async (args) => ({ edits: (await edits.presentAll(await edits.list(actor, 'activity', { personId: args.person ?? null, limit: 20 }), reading(args.language))).map(brief) }));

  /* ---------- Changing ---------- */

  tool('add_person', 'Add someone new as the child, partner, parent or sibling of a person already on the tree.', {
    relative_of: personId, relation: z.enum(RELATIONS), ...DETAILS, language: WRITTEN_IN,
  }, (args) => {
    const of = need(args.relative_of);
    const details: RelativeDetails = {
      given: args.given, family: args.family ?? '', birthName: args.birth_name ?? '', sex: args.sex ?? 'unknown',
      ...(args.living ? { living: args.living } : {}), born: args.born, died: args.died, birthPlace: args.birth_place,
    };
    const { ops } = addRelative(family(), { of: of.id, relation: args.relation, details });
    return write(inLang(ops, args.language), relativeMessage(args.relation, details, fullName(of, lang), lang));
  }, WRITES);
  tool('update_person', 'Change a person’s names, sex, living state or story.', {
    person: personId, given: DETAILS.given.optional(), family: DETAILS.family, birth_name: DETAILS.birth_name, sex: DETAILS.sex, living: DETAILS.living, bio: text('Their story, as plain text.').optional(),
    language: WRITTEN_IN,
  }, ({ person: id, birth_name, language, ...rest }) => {
    const set = { ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)), ...(birth_name !== undefined ? { birthName: birth_name } : {}) };
    if (!Object.keys(set).length) throw badRequest('Say what to change.');
    const ops = inLang([{ type: 'person.update', person: need(id).id, set }], language);
    return write(ops, titled(ops));
  }, WRITES);
  tool('add_fact', 'Record something that happened to a person: birth, death, occupation, residence and so on.', {
    person: personId, type: z.enum(FACT_TYPES), ...FACT_DETAILS, language: WRITTEN_IN,
  }, (args) => {
    const ops = inLang([{ type: 'fact.add', subject: { type: 'person', id: need(args.person).id }, set: factFields(args) }], args.language);
    return write(ops, titled(ops));
  }, WRITES);
  tool('update_fact', 'Change a fact. Get its id from get_person.', { fact: text('The id of the fact.'), ...FACT_DETAILS, language: WRITTEN_IN }, (args) => {
    const ops = inLang([{ type: 'fact.update', fact: args.fact, set: factFields(args) }], args.language);
    return write(ops, titled(ops));
  }, WRITES);
  tool('remove_fact', 'Remove a fact. Get its id from get_person.', { fact: text('The id of the fact.') }, (args) => {
    const ops: Op[] = [{ type: 'fact.remove', fact: args.fact }];
    return write(ops, titled(ops));
  }, REMOVES);
  tool('connect_people', 'Connect two people already on the tree: as partners, or the first as parent of the second.', {
    first: personId, second: personId, as: z.enum(['partners', 'parent_and_child']), since: z.number().int().describe('Year the partnership began.').optional(),
  }, (args) => {
    const a = need(args.first), b = need(args.second);
    if (args.as === 'partners') {
      const joined: Op[] = [{ type: 'union.create', partners: [a.id, b.id], set: { host: a.id, since: args.since ?? null } }];
      return write(joined, titled(joined));
    }
    const union = family().unionsOf(a.id)[0];
    const ops: Op[] = union ? [] : [{ type: 'union.create', ref: '$family', partners: [a.id], set: { kind: 'unknown' } }];
    ops.push({ type: 'child.link', union: union?.id ?? '$family', child: b.id });
    return write(ops, tell(lang, 'Record {parent} as a parent of {child}', { parent: fullName(a, lang), child: fullName(b, lang) }));
  }, WRITES);
  tool('disconnect_people', 'Undo a wrong connection between a parent and a child.', { parent: personId, child: personId }, (args) => {
    const union = birthUnions(indexOf(state), args.child).find((candidate) => candidate.partners.includes(args.parent));
    if (!union) throw badRequest('Those two are not recorded as parent and child.');
    const ops: Op[] = [{ type: 'child.unlink', union: union.id, child: args.child }];
    return write(ops, titled(ops));
  }, REMOVES);
  tool('add_memory', 'Add a memory of a person, in the member’s own name and words.', { person: personId, body: text('The memory.'), language: WRITTEN_IN },
    (args) => { const ops = inLang([{ type: 'memory.add', person: need(args.person).id, body: args.body }], args.language); return write(ops, titled(ops)); }, WRITES);
  tool('suggest_correction', 'Propose a fix to something the member cannot edit. It goes to that branch’s steward with the note.', {
    person: personId, field: z.enum(['given', 'family', 'birth_name', 'birth', 'death']), value: text('The corrected value. For birth and death, a date in plain words.'),
    note: text('Why: what shows this is right.'), language: WRITTEN_IN,
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
    return write(inLang([op], args.language), args.note, { suggest: true });
  }, WRITES);
  tool('remove_person', 'Move a person to the compost. They can be restored for 30 days.', { person: personId },
    (args) => { const ops: Op[] = [{ type: 'person.remove', person: need(args.person).id }]; return write(ops, titled(ops)); }, REMOVES);
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
  tool('list_translations', 'Admin: the family’s words (names, stories, places, details, notes, memories, and the family’s own name and line) that are missing in a language, or were written from an earlier original. Each comes with its original and its language. Fill them in with set_translations.', {
    language: z.enum(LANGS).describe('The language to look at: en, he or ru.'),
    only: z.enum(['missing', 'stale', 'all']).describe('What to list: missing in that language, out of date there, or everything. Missing by default.').optional(),
    person: personId.optional(), limit: z.number().int().min(1).max(500).describe('At most this many. 100 by default.').optional(),
  }, ({ language, only = 'missing', person: id, limit = 100 }) => {
    const report = translationsOf(state, store.settings, actor.lang ?? store.settings.language);
    const wanted = report.rows.filter((row) => (!id || row.person?.id === id) && row.lang !== language
      && (only === 'all' || (only === 'missing' ? !row.texts[language] : Boolean(row.texts[language]?.stale))));
    return {
      language, counts: report.counts[language], total: wanted.length,
      items: wanted.slice(0, limit).map((row) => ({
        kind: ({ people: 'person', facts: 'fact', memories: 'memory', family: 'family' } as const)[row.kind], id: row.id,
        field: row.field === 'birthName' ? 'birth_name' : row.field, person: row.person, fact_type: row.factType,
        written_in: row.lang, original: row.texts[row.lang]?.text ?? '', now: row.texts[language]?.text ?? null, out_of_date: row.texts[language]?.stale ?? false,
      })),
    };
  }, { admin: true });
  tool('set_translations', 'Admin: write the family’s words in a language, as many as you like in one edit. A name is written in that language’s letters as the family would write it, never changed into another name. An empty text takes that language’s version away. Use the kind, id and field list_translations gives.', {
    language: z.enum(LANGS).describe('The language the texts are written in: en, he or ru.'),
    entries: z.array(z.object({
      kind: z.enum(['person', 'fact', 'memory', 'family']), id: text('The id of the person, fact or memory. "family" for the family’s own words.'),
      field: z.enum(['given', 'family', 'birth_name', 'bio', 'place', 'value', 'note', 'body', 'familyName', 'description', 'guidelines']),
      text: text('The words in that language.'),
    })).min(1).max(MAX_AI_OPS),
  }, async ({ language, entries }) => {
    const ops: Op[] = [];
    const people = new Map<string, Record<string, string>>(), facts = new Map<string, Record<string, string>>();
    const familyWords: Record<string, string> = {};
    for (const entry of entries) {
      const field = entry.field === 'birth_name' ? 'birthName' : entry.field;
      if (entry.kind === 'person' && (TEXT_FIELDS.people as readonly string[]).includes(field)) people.set(need(entry.id).id, { ...people.get(entry.id), [field]: entry.text });
      else if (entry.kind === 'fact' && (TEXT_FIELDS.facts as readonly string[]).includes(field)) facts.set(entry.id, { ...facts.get(entry.id), [field]: entry.text });
      else if (entry.kind === 'memory' && field === 'body') ops.push({ type: 'memory.translate', memory: entry.id, lang: language, body: entry.text });
      else if (entry.kind === 'family' && ['familyName', 'description', 'guidelines'].includes(field)) familyWords[field] = entry.text;
      else throw badRequest(`A ${entry.kind} has no field called "${entry.field}".`);
    }
    for (const [id, set] of people) ops.unshift({ type: 'person.update', person: id, lang: language, set });
    for (const [id, set] of facts) ops.push({ type: 'fact.update', fact: id, lang: language, set });
    let family: string[] = [];
    if (Object.keys(familyWords).length) {
      // The family's own words are settings, not an edit: kept at once, so a connection that only drafts cannot write them
      if (connection.mode === 'review_first') throw forbidden('This connection saves drafts only. The family’s own words are changed in Manage family, or by a connection that applies directly.');
      await store.saveSettings(familyPatch(store.settings, familyWords, language));
      app.hub.changed(store.seq);
      family = Object.keys(familyWords);
    }
    const edit = ops.length ? await write(ops, tell(lang, '{n#Write one text|Write # texts} {inLanguage}', { n: ops.length, inLanguage: say(lang, IN_LANGUAGE[language]) })) : null;
    return { family_words_saved: family, edit };
  }, ADMIN_WRITES);
  tool('import_gedcom', 'Admin: stage a GEDCOM file as a draft to preview and apply in the app.', { gedcom: text('The contents of the file.') }, async (args) => {
    const parsed = importGedcom(args.gedcom);
    const result = await edits.submit(actor, { ops: parsed.ops, message: tell(lang, 'Import {n} people from a GEDCOM file', { n: parsed.people }), origin: 'import', connectionId: connection.id, mode: 'draft' });
    const saved = result.edit as EditRow;
    return { edit_id: saved.id, status: 'draft', people: parsed.people, families: parsed.families, not_understood: parsed.skipped, review_url: reviewUrl(saved.id) };
  }, ADMIN_WRITES);
}
