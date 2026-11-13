/*
 * Connect your AI. A member creates a connection, gets a token once, and
 * pastes it into the AI client they already use. From then on that client can
 * read and edit the tree as them, by default through drafts they approve.
 */

import { confirmButton, copyRow, field, h, put, select, when } from './dom.js';

const MODES = [['review_first', 'Review first: changes arrive as a draft I approve'], ['apply_directly', 'Apply directly: inside my branch, changes publish at once']];
const ACCESS = [['write', 'Read and change'], ['read', 'Read only']];
const PROFILES = [['full', 'All tools'], ['simple', 'Fewer, simpler tools (for small local models)']];

/* What to paste into each client, with the address and token filled in. */
function setupFor(address, token) {
  const config = JSON.stringify({ mcpServers: { 'family-tree': { type: 'http', url: address, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
  return [
    ['Claude Code', `claude mcp add --transport http family-tree ${address} --header "Authorization: Bearer ${token}"`],
    ['Cursor, VS Code, Claude Desktop and others (JSON config)', config],
    ['Anything that speaks HTTP', `curl -s ${address} -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`],
  ];
}

export const connect = {
  title: () => 'Connect your AI',
  async render(app, args, body) {
    const { address, connections, everyone } = await app.api.get('/api/connections');
    const { settings } = app.session;
    put(body, h('p', { text: 'Your assistant can read the tree and make changes for you. It can only do what you can do, and by default you approve its changes first.' }));
    if (!settings.allowAi) {
      put(body, h('p', { class: 'warning', text: 'The family’s admin has turned AI connections off.' }));
      return;
    }
    put(body, h('h3', { text: 'Address' }), copyRow(address));

    // A token just created is shown once, with ready-made setup for each client
    if (args.fresh) {
      put(body,
        h('h3', { text: `Set up “${args.fresh.name}”` }),
        h('p', { class: 'warning', text: 'This token is shown only now. Copy it into your AI client before closing this panel.' }),
        copyRow(args.fresh.token),
        setupFor(address, args.fresh.token).map(([label, text]) => [h('p', { class: 'hint-line', text: label }), copyRow(text), h('pre', { class: 'code', text })]),
        h('div', { class: 'form-actions' }, h('button', { type: 'button', onclick: () => { args.fresh = null; app.refresh(); } }, 'Done, I have copied it')));
    }

    put(body, h('h3', { text: 'Your connections' }));
    put(body, connections.length ? connections.map((connection) => {
      const save = async (patch) => {
        try { await app.api.patch(`/api/connections/${connection.id}`, patch); app.toast('Saved'); } catch (error) { app.fail(error); app.refresh(); }
      };
      return h('div', { class: 'edit' },
        h('header', {}, h('strong', { text: connection.name }), h('small', { text: connection.lastUsedAt ? `used ${when(connection.lastUsedAt)}` : 'not used yet' })),
        h('div', { class: 'fields', style: 'margin-top:8px' },
          field('How changes arrive', select(settings.allowAiDirect ? MODES : MODES.slice(0, 1), connection.mode, { onchange: (e) => save({ mode: e.target.value }) }), { class: 'wide' }),
          field('What it may do', select(connection.access === 'admin' ? [['admin', 'Everything an admin can']] : ACCESS, connection.access, { onchange: (e) => save({ access: e.target.value }) })),
          field('Tools', select(PROFILES, connection.profile, { onchange: (e) => save({ profile: e.target.value }) }))),
        h('div', { class: 'form-actions' }, confirmButton('Revoke', 'Really revoke?', async () => {
          await app.api.del(`/api/connections/${connection.id}`);
          app.toast('Connection revoked. Its token no longer works.');
          app.refresh();
        }, { class: 'small danger' })));
    }) : h('p', { class: 'empty', text: 'No connections yet.' }));

    const name = h('input', { type: 'text', placeholder: 'For example: Claude on my laptop' });
    const mode = select(settings.allowAiDirect ? MODES : MODES.slice(0, 1), 'review_first');
    const access = select(app.isAdmin ? [...ACCESS, ['admin', 'Everything an admin can, including review']] : ACCESS, 'write');
    put(body,
      h('h3', { text: 'New connection' }),
      h('div', { class: 'fields' }, field('Name', name, { class: 'wide' }), field('How changes arrive', mode, { class: 'wide' }), field('What it may do', access, { class: 'wide' })),
      h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'primary', onclick: async () => {
        try {
          const created = await app.api.post('/api/connections', { name: name.value, mode: mode.value, access: access.value });
          args.fresh = { name: name.value, token: created.token };
          app.refresh();
        } catch (error) { app.fail(error); }
      } }, 'Create connection')));

    if (app.session.counts.drafts) {
      put(body, h('h3', { text: 'Drafts waiting for you' }),
        h('div', { class: 'form-actions' }, h('button', { type: 'button', onclick: () => app.openPanel('inbox', { tab: 'mine' }) }, `Review ${app.session.counts.drafts} draft${app.session.counts.drafts === 1 ? '' : 's'}`)));
    }
    if (everyone.length) {
      put(body, h('h3', { text: 'Every connection in the family' }),
        everyone.map((connection) => h('div', { class: 'row' },
          h('div', { class: 'main' }, h('strong', { text: `${connection.owner}: ${connection.name}` }),
            h('small', { text: `${connection.mode === 'review_first' ? 'review first' : 'applies directly'}, ${connection.lastUsedAt ? `used ${when(connection.lastUsedAt)}` : 'not used yet'}` })),
          h('div', { class: 'side' }, confirmButton('Revoke', 'Sure?', async () => { await app.api.del(`/api/connections/${connection.id}`); app.refresh(); }, { class: 'small danger' })))));
    }
  },
};
