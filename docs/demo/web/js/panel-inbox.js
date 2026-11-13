/*
 * The inbox: suggestions to decide, the viewer's own drafts and suggestions,
 * and what has happened to them. Also a person's history, with undo.
 */

import { confirmButton, h, put, when } from './dom.js';
import { editCard } from './edit-view.js';

const button = (label, onclick, props = {}) => h('button', { type: 'button', ...props, onclick }, label);
const showOnTree = (app, edit) => edit.touched.length > 0 && button('Show on tree', () => { app.closePanel(); app.select(edit.touched[0], { fly: true }); }, { class: 'small' });

/* Run something that changes an edit, say how it went, and draw the panel again. */
async function act(app, work, done) {
  try {
    const result = await work();
    if (done) app.toast(typeof done === 'function' ? done(result) : done);
    await app.refresh();
  } catch (error) {
    app.fail(error);
  }
}

/* A suggestion with everything a reviewer can do to it. */
function reviewCard(app, edit, args) {
  const adjusting = args.adjusting === edit.id;
  const note = h('input', { type: 'text', placeholder: 'Why? The author will see this', hidden: true });
  const question = h('input', { type: 'text', placeholder: 'Ask the author a question' });
  const review = (body, done) => act(app, () => app.api.post(`/api/edits/${edit.id}/review`, body), done);

  const card = editCard(edit, {
    adjusting,
    actions: [
      adjusting
        ? button('Approve with these values', () => review({ action: 'approve', ops: card.adjusted() }, 'Approved with your adjustments'), { class: 'primary' })
        : button('Approve', () => review({ action: 'approve' }, 'Approved. It is on the tree.'), { class: 'primary' }),
      edit.lines.some((line) => line.fields.length) && button(adjusting ? 'Cancel adjusting' : 'Edit and approve', () => { args.adjusting = adjusting ? null : edit.id; app.refresh(); }),
      button('Decline', () => {
        if (note.hidden) { note.hidden = false; note.focus(); return; }
        review({ action: 'decline', note: note.value }, 'Declined. The author has been told why.');
      }, { class: 'danger' }),
      showOnTree(app, edit),
    ],
  });
  card.append(note, h('div', { class: 'copy' }, question, button('Ask', () => act(app, () => app.api.post(`/api/edits/${edit.id}/comments`, { body: question.value })), { class: 'small' })));
  return card;
}

/* One of the viewer's own edits that is not history yet. */
function ownCard(app, edit) {
  if (edit.status === 'draft') {
    const apply = (indexes) => act(app, () => app.api.post(`/api/edits/${edit.id}/apply`, indexes ? { indexes } : {}),
      (result) => `${result.status === 'applied' ? 'Applied to the tree' : 'Sent for review'}${result.remaining ? `. ${result.remaining} left in the draft.` : '.'}`);
    const card = editCard(edit, {
      selectable: edit.lines.length > 1,
      actions: [
        button('Apply all', () => apply(null), { class: 'primary' }),
        edit.lines.length > 1 && button('Apply selected', () => apply(card.chosen())),
        confirmButton('Discard', 'Really discard?', () => act(app, () => app.api.post(`/api/edits/${edit.id}/discard`), 'Draft discarded'), { class: 'danger' }),
        showOnTree(app, edit),
      ],
    });
    return card;
  }
  const reply = h('input', { type: 'text', placeholder: 'Reply' });
  const waiting = edit.status === 'suggested';
  const card = editCard(edit, {
    actions: [
      waiting && confirmButton('Withdraw', 'Really withdraw?', () => act(app, () => app.api.post(`/api/edits/${edit.id}/withdraw`), 'Suggestion withdrawn')),
      showOnTree(app, edit),
    ].filter(Boolean),
  });
  if (waiting && edit.comments.length) card.append(h('div', { class: 'copy' }, reply, button('Send', () => act(app, () => app.api.post(`/api/edits/${edit.id}/comments`, { body: reply.value })), { class: 'small' })));
  return card;
}

export const inbox = {
  title: () => 'Inbox',
  tabs(app) {
    const { counts } = app.session;
    return [
      (counts.review || app.isAdmin || app.session.user.anchors.length) && ['review', `To review${counts.review ? ` (${counts.review})` : ''}`],
      ['mine', `Mine${counts.drafts ? ` (${counts.drafts})` : ''}`],
      ['news', `News${counts.unread ? ` (${counts.unread})` : ''}`],
    ].filter(Boolean);
  },
  async render(app, args, body) {
    if (args.tab === 'news') {
      const { notifications } = await app.api.get('/api/notifications');
      put(body, notifications.length
        ? notifications.map((item) => h('div', { class: 'row' }, h('div', { class: 'main' }, h('strong', { text: item.body }), h('small', { text: when(item.at) }))))
        : h('p', { class: 'empty', text: 'Nothing new.' }));
      if (app.session.counts.unread) app.api.post('/api/notifications/read').then(() => app.reloadSession());
      return;
    }
    const { edits } = await app.api.get(`/api/edits?which=${args.tab}`);
    if (args.tab === 'review') {
      put(body, edits.length ? edits.map((edit) => reviewCard(app, edit, args))
        : h('p', { class: 'empty', text: 'Nothing is waiting for you. Suggestions for your branches will appear here.' }));
      return;
    }
    put(body, edits.length ? edits.map((edit) => ownCard(app, edit))
      : h('p', { class: 'empty', text: 'Your drafts and suggestions will appear here. Tap a fact on someone’s card to suggest a fix.' }));
  },
};

export const history = {
  title: (args) => `History of ${args.name}`,
  async render(app, args, body) {
    const { edits } = await app.api.get(`/api/edits?which=activity&person=${args.personId}`);
    put(body, edits.length ? edits.map((edit) => activityCard(app, edit)) : h('p', { class: 'empty', text: 'No changes recorded yet.' }));
  },
};

/* A published edit, with Undo for those who may. */
export function activityCard(app, edit) {
  return editCard(edit, {
    actions: [
      edit.canRevert && confirmButton('Undo', 'Really undo?', () => act(app, () => app.api.post(`/api/edits/${edit.id}/revert`), 'Undone'), { class: 'small' }),
      showOnTree(app, edit),
    ].filter(Boolean),
  });
}
