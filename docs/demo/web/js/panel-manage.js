/*
 * Manage family. The admin runs everything from here: members, branches,
 * activity, compost, the health of the tree, settings, and data in and out.
 * A steward sees the parts that concern their own branch.
 */

import { confirmButton, copyRow, field, h, pickFile, put, select, when } from './dom.js';
import { personPicker } from './drawer.js';
import { activityCard } from './panel-inbox.js';

/* One colour per steward, for seeing branches on the tree. */
export const STEWARD_COLOURS = ['#12708A', '#C9992E', '#B4432E', '#7A5AA8', '#2F6B4F', '#D2691E', '#4A7BD0', '#C2518C'];

const button = (label, onclick, props = {}) => h('button', { type: 'button', ...props, onclick }, label);
const tryIt = async (app, work, done) => {
  try {
    const result = await work();
    if (done) app.toast(done);
    await app.refresh();
    return result;
  } catch (error) {
    app.fail(error);
    return null;
  }
};

/* ---------- Members ---------- */

async function members(app, args, body) {
  const data = await app.api.get('/api/members');
  const isOwner = app.session.user.role === 'owner';
  const roles = [['member', 'Member'], ['admin', 'Admin'], ...(isOwner ? [['owner', 'Owner']] : [])];

  put(body, data.requests.length ? [h('h3', { text: 'Asking to join' }), data.requests.map((request) => h('div', { class: 'row' },
    h('div', { class: 'main' }, h('strong', { text: `${request.name}, ${request.email}` }), h('small', { text: request.message || 'No message' })),
    h('div', { class: 'side' },
      button('Approve', async () => {
        const result = await tryIt(app, () => app.api.post(`/api/join/${request.id}`, { approve: true }));
        if (result) { args.inviteLink = result.link; app.refresh(); }
      }, { class: 'small primary' }),
      button('Decline', () => tryIt(app, () => app.api.post(`/api/join/${request.id}`, { approve: false }), 'Declined'), { class: 'small' }))))] : []);

  put(body, h('h3', { text: 'Members' }), data.members.map((member) => h('div', { class: 'row' },
    h('div', { class: 'main' },
      h('strong', { text: member.name }),
      h('small', { text: [member.email, member.personName ? `is ${member.personName}` : 'not linked to a leaf', member.ai ? 'has an AI connected' : null].filter(Boolean).join(', ') }),
      h('div', {}, member.anchorNames.map((name, index) => h('span', { class: 'chip' }, `${name}’s branch`,
        button('×', () => tryIt(app, () => app.api.del(`/api/members/${member.id}/branches/${member.anchors[index]}`)), { 'aria-label': `Take ${name}’s branch away from ${member.name}` }))))),
    h('div', { class: 'side' },
      select(member.role === 'owner' && !isOwner ? [['owner', 'Owner']] : roles, member.role, {
        'aria-label': `Role of ${member.name}`, disabled: member.role === 'owner' && !isOwner,
        onchange: (e) => tryIt(app, () => app.api.patch(`/api/members/${member.id}`, { role: e.target.value }), 'Role changed'),
      }),
      member.id !== app.session.user.id && confirmButton('Remove', 'Really?', () => tryIt(app, () => app.api.del(`/api/members/${member.id}`), `${member.name} can no longer sign in`), { class: 'small danger' })))));

  // Invite someone, optionally as a person already on the tree
  const invite = { personId: null };
  const email = h('input', { type: 'email', placeholder: 'their@email.example' });
  const role = select(roles, 'member');
  const own = h('input', { type: 'checkbox', checked: true });
  put(body,
    h('h3', { text: 'Invite a relative' }),
    h('div', { class: 'fields' },
      field('Email', email), field('Role', role),
      field('Who are they on the tree?', personPicker(app, 'Search for their name', (id) => { invite.personId = id; }), { class: 'wide' }),
      h('label', { class: 'check wide' }, own, 'They look after themselves and their descendants')),
    h('div', { class: 'form-actions' }, button('Create invitation', async () => {
      const result = await tryIt(app, () => app.api.post('/api/invites', { email: email.value, role: role.value, personId: invite.personId, grantBranch: own.checked }));
      if (result) { args.inviteLink = result.link; app.refresh(); }
    }, { class: 'primary' })));
  if (args.inviteLink) {
    put(body, h('p', { class: 'pencil', text: 'In the real app this link is emailed, or printed as a code for a family gathering. Pass it on:' }), copyRow(args.inviteLink));
  }
  if (data.invites.length) {
    put(body, h('h3', { text: 'Invitations not yet accepted' }), data.invites.map((item) => h('div', { class: 'row' },
      h('div', { class: 'main' }, h('strong', { text: item.email || 'Anyone with the link' }), h('small', { text: `${item.role}${item.personName ? `, as ${item.personName}` : ''}, invited by ${item.by}` })),
      h('div', { class: 'side' }, button('Cancel', () => tryIt(app, () => app.api.del(`/api/invites/${item.id}`)), { class: 'small' })))));
  }
}

/* ---------- Branches: assigned on the tree itself, because a branch is a shape ---------- */

async function branches(app, args, body) {
  const [{ members: list }, health] = await Promise.all([app.api.get('/api/members'), app.api.get('/api/health')]);
  app.showBranches(list);
  put(body,
    h('p', { text: 'A branch is one person, their descendants, and those descendants’ partners. Its steward edits it directly. Everyone else suggests.' }),
    h('p', { class: 'hint-line', text: `${health.withoutSteward} of ${health.total} people have no steward, so only admins can edit them directly.` }),
    list.map((member, index) => h('div', { class: 'row' },
      h('div', { class: 'main' },
        h('strong', {}, h('span', { class: 'chip' }, h('i', { style: `background:${STEWARD_COLOURS[index % STEWARD_COLOURS.length]}` }), member.name)),
        h('div', {}, member.anchorNames.length
          ? member.anchorNames.map((name, i) => h('span', { class: 'chip' }, `${name}’s branch`,
            button('×', () => tryIt(app, () => app.api.del(`/api/members/${member.id}/branches/${member.anchors[i]}`)), { 'aria-label': `Remove ${name}’s branch` })))
          : h('small', { text: 'No branch' }))),
      h('div', { class: 'side' }, button('Assign on the tree', () => app.startPainting(member, list), { class: 'small' })))));
}

/* ---------- Activity and compost ---------- */

async function activity(app, args, body) {
  const { edits } = await app.api.get('/api/edits?which=activity');
  put(body, edits.length ? edits.map((edit) => activityCard(app, edit)) : h('p', { class: 'empty', text: 'Nothing has changed yet.' }));
}

async function compost(app, args, body) {
  const { people } = await app.api.get('/api/compost');
  put(body,
    h('p', { class: 'hint-line', text: 'Removed people stay here for 30 days and can be restored. After that they are gone for good.' }),
    people.length ? people.map((p) => h('div', { class: 'row' },
      h('div', { class: 'main' }, h('strong', { text: p.name }), h('small', { text: `removed ${when(p.removedAt)}` })),
      h('div', { class: 'side' },
        button('Restore', () => tryIt(app, () => app.api.post('/api/edits', { ops: [{ type: 'person.restore', person: p.id }], message: `Restore ${p.name}` }), `${p.name} is back on the tree`), { class: 'small primary' }),
        confirmButton('Remove for good', 'Cannot be undone. Sure?', () => tryIt(app, () => app.api.post(`/api/compost/${p.id}/purge`), 'Removed for good'), { class: 'small danger' }))))
      : h('p', { class: 'empty', text: 'The compost is empty.' }));
}

/* ---------- Tree health ---------- */

async function health(app, args, body) {
  const report = await app.api.get('/api/health');
  const go = (entry) => button(entry.name, () => { app.closePanel(); app.select(entry.id, { fly: true }); }, { class: 'link' });
  const section = (title, entries, empty) => [
    h('h3', { text: `${title} (${entries.length})` }),
    entries.length ? h('ul', { class: 'relatives' }, entries.map((entry) => h('li', {}, go(entry)))) : h('p', { class: 'hint-line', text: empty }),
  ];
  put(body,
    report.suspicious.length ? [h('h3', { text: `Looks wrong (${report.suspicious.length})` }), report.suspicious.map((item) => h('p', { class: 'warning', text: item.message }))] : [],
    section('No name yet', report.unnamed, 'Everyone has a name.'),
    section('No birth date', report.noBirthDate, 'Everyone has a birth date.'),
    section('Connected to nobody', report.noParents, 'Everyone is connected.'));
}

/* ---------- Settings ---------- */

async function settings(app, args, body) {
  const current = await app.api.get('/api/settings');
  const text = (key) => h('input', { type: 'text', value: current[key] });
  const check = (key) => h('input', { type: 'checkbox', checked: current[key] });
  const controls = {
    familyName: text('familyName'), description: text('description'),
    visibility: select([['private', 'Private: only relatives who sign in'], ['public_masked', 'Public, living people hidden'], ['public', 'Public, living people shown only if they choose']], current.visibility),
    visitorsCanSuggest: check('visitorsCanSuggest'), allowJoinRequests: check('allowJoinRequests'),
    stewardsReview: check('stewardsReview'), stewardsCanInvite: check('stewardsCanInvite'),
    livingAge: h('input', { type: 'text', inputmode: 'numeric', value: current.livingAge }),
    allowAi: check('allowAi'), allowAiDirect: check('allowAiDirect'),
    aiWritesPerHour: h('input', { type: 'text', inputmode: 'numeric', value: current.aiWritesPerHour }),
    guidelines: h('textarea', { rows: 6 }, current.guidelines),
  };
  const checkbox = (key, label) => h('label', { class: 'check wide' }, controls[key], label);
  const read = (key) => {
    const control = controls[key];
    if (control.type === 'checkbox') return control.checked;
    return key === 'livingAge' || key === 'aiWritesPerHour' ? Number(control.value) : control.value;
  };

  put(body,
    h('h3', { text: 'The family' }),
    h('div', { class: 'fields' }, field('Name', controls.familyName, { class: 'wide' }), field('One line about it', controls.description, { class: 'wide' })),
    h('h3', { text: 'Who can see it' }),
    h('div', { class: 'fields' },
      field('Visibility', controls.visibility, { class: 'wide' }),
      checkbox('visitorsCanSuggest', 'Visitors can suggest fixes'), checkbox('allowJoinRequests', 'People can ask to join'),
      field('Treat as living if born less than this many years ago', controls.livingAge, { class: 'wide' })),
    h('p', { class: 'hint-line', text: 'Living people are never shown to visitors unless they choose it themselves, from their own account. Not even an admin can choose it for them.' }),
    h('h3', { text: 'Review' }),
    h('div', { class: 'fields' }, checkbox('stewardsReview', 'Stewards review suggestions for their own branch'), checkbox('stewardsCanInvite', 'Stewards can invite people in their branch')),
    h('h3', { text: 'AI connections' }),
    h('div', { class: 'fields' },
      checkbox('allowAi', 'Members can connect their own AI'), checkbox('allowAiDirect', 'Members may let their AI apply changes without a draft'),
      field('Most changes one connection may make in an hour', controls.aiWritesPerHour, { class: 'wide' })),
    h('h3', { text: 'Guidelines' }),
    h('p', { class: 'hint-line', text: 'How this family writes names and dates. Shown to people when they edit, and given to every connected AI.' }),
    controls.guidelines,
    h('div', { class: 'form-actions' }, button('Save settings', async () => {
      const patch = Object.fromEntries(Object.keys(controls).map((key) => [key, read(key)]).filter(([key, value]) => value !== current[key]));
      if (!Object.keys(patch).length) return app.toast('Nothing changed');
      if (await tryIt(app, () => app.api.patch('/api/settings', patch), 'Settings saved')) await app.reloadSession();
    }, { class: 'primary' })));
}

/* ---------- Data in and out ---------- */

async function data(app, args, body) {
  const isOwner = app.session.user.role === 'owner';
  put(body,
    h('h3', { text: 'Take it with you' }),
    h('p', { text: 'Everything can leave in standard formats at any time.' }),
    h('div', { class: 'form-actions' },
      h('a', { href: '/api/export/gedcom', download: 'family.ged' }, h('button', { type: 'button' }, 'Download GEDCOM')),
      h('a', { href: '/api/export/backup', download: 'family-backup.json' }, h('button', { type: 'button' }, 'Download full backup'))),

    h('h3', { text: 'Bring a tree in' }),
    h('p', { class: 'hint-line', text: 'A GEDCOM file from other family tree software. Nothing is written until you have looked at it: it arrives as a draft you can preview on the tree, apply, or discard.' }),
    h('div', { class: 'form-actions' }, button('Import a GEDCOM file', () => pickFile('.ged,.gedcom,.txt', async (text) => {
      const result = await tryIt(app, () => app.api.post('/api/import/gedcom', { text }));
      if (!result) return;
      app.toast(`${result.people} people staged as a draft${result.skipped.length ? `. Not understood: ${result.skipped.join(', ')}` : ''}`);
      app.openPanel('inbox', { tab: 'mine', editId: result.editId });
    }))));

  if (!isOwner) return;
  put(body,
    h('h3', { text: 'Danger zone' }),
    h('p', { class: 'hint-line', text: 'Only owners see this. Restoring a backup replaces the whole tree and signs everyone out.' }),
    h('div', { class: 'form-actions' },
      button('Restore a backup', () => pickFile('.json', async (text) => {
        let backup;
        try { backup = JSON.parse(text); } catch { return app.toast('That file is not a backup.', { bad: true }); }
        app.toast('Replace the whole tree with this backup?', {
          action: 'Replace', ms: 12000,
          onAction: async () => { try { await app.api.post('/api/import/backup', { backup }); location.reload(); } catch (error) { app.fail(error); } },
        });
      }), { class: 'danger' }),
      confirmButton('Start the demo again', 'Wipe everything. Sure?', async () => { await app.api.post('/api/demo/reset'); location.reload(); }, { class: 'danger' })));
}

const TABS = { members, branches, activity, compost, health, settings, data };

export const manage = {
  title: (args, app) => (app.isAdmin ? 'Manage family' : 'Manage my branch'),
  tabs: (app) => (app.isAdmin
    ? [['members', 'Members'], ['branches', 'Branches'], ['activity', 'Activity'], ['compost', 'Compost'], ['health', 'Health'], ['settings', 'Settings'], ['data', 'Data']]
    : [['activity', 'Activity'], ['health', 'Health']]),
  async render(app, args, body) {
    if (args.tab !== 'branches') app.showBranches(null);
    await TABS[args.tab](app, args, body);
  },
  closed: (app) => { if (!app.painting) app.showBranches(null); },
};
