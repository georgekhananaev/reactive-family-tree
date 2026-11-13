/* Signing in, accepting an invitation, and asking to join. No passwords anywhere. */

import { field, fill, h, put } from './dom.js';

export const signin = {
  title: () => 'Sign in',
  async render(app, args, body) {
    const { demoAccounts, settings } = app.session;

    if (demoAccounts.length) {
      put(body,
        h('h3', { text: 'Try it as someone' }),
        h('p', { class: 'hint-line', text: 'This demo comes with a relative for every role. Open a second browser window as someone else to see changes arrive live.' }),
        demoAccounts.map((account) => h('button', {
          type: 'button', class: 'account',
          onclick: async () => {
            await app.api.post('/api/auth/demo', { email: account.email });
            await app.signedIn();
          },
        }, h('strong', { text: account.name }), h('small', { text: account.blurb }))));
    }

    const email = h('input', { type: 'email', autocomplete: 'email', placeholder: 'you@example.com' });
    const result = h('div');
    put(body,
      h('h3', { text: 'Sign in with a link' }),
      field('Your email', email),
      h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'primary', onclick: async () => {
        const { demoLink } = await app.api.post('/api/auth/link', { email: email.value });
        fill(result,
          h('p', { class: 'hint-line', text: 'If that address belongs to a relative, a sign-in link is on its way. It works once, for 15 minutes.' }),
          demoLink && h('p', { class: 'pencil' }, 'In the real app this arrives by email. In this demo, here it is: ', h('a', { href: demoLink, text: 'Sign in' })));
      } }, 'Send me a link')),
      result);

    if (settings.allowJoinRequests) {
      const name = h('input', { type: 'text', autocomplete: 'name' }), address = h('input', { type: 'email', autocomplete: 'email' });
      const message = h('textarea', { rows: 2, placeholder: 'For example: I am Rosalind’s grandson' });
      put(body,
        h('h3', { text: 'Not invited yet?' }),
        h('div', { class: 'fields' }, field('Your name', name), field('Your email', address), field('Who are you in this family?', message, { class: 'wide' })),
        h('div', { class: 'form-actions' }, h('button', { type: 'button', onclick: async () => {
          try {
            await app.api.post('/api/join', { name: name.value, email: address.value, message: message.value });
            app.toast('Your request was sent to the family’s admins.');
            app.closePanel();
          } catch (error) { app.fail(error); }
        } }, 'Ask to join')));
    }
  },
};

export const invite = {
  title: () => 'You are invited',
  async render(app, args, body) {
    const open = await app.api.get(`/api/invites/open?token=${encodeURIComponent(args.token)}`);
    const name = h('input', { type: 'text', value: open.personName ?? '', autocomplete: 'name' });
    const email = h('input', { type: 'email', value: open.email, autocomplete: 'email' });
    put(body,
      h('p', { text: open.personName
        ? `${open.invitedBy} invited you to the family tree as ${open.personName}. Is that you?`
        : `${open.invitedBy} invited you to the family tree.` }),
      h('div', { class: 'fields' }, field('Your name', name, { class: 'wide' }), field('Your email', email, { class: 'wide' })),
      h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'primary', onclick: async () => {
        try {
          await app.api.post('/api/invites/accept', { token: args.token, name: name.value, email: email.value });
          history.replaceState(null, '', location.pathname);
          await app.signedIn();
          app.toast(`Welcome, ${name.value}.`);
        } catch (error) { app.fail(error); }
      } }, open.personName ? 'Yes, that is me' : 'Join')));
  },
};
