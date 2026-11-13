/*
 * The side panel. It holds one panel at a time (sign in, inbox, manage, connect
 * your AI, a person's history) and redraws it when the family changes.
 *
 * A panel is { title(args), tabs?(app, args) -> [[key, label]], render(app, args, body) }.
 */

import { $, arrowThrough, h } from './dom.js';

export class Drawer {
  constructor(app, panels) {
    this.app = app;
    this.panels = panels;
    this.el = $('#drawer');
    this.current = null;
    $('#drawerClose').addEventListener('click', () => this.close());
  }

  get isOpen() { return Boolean(this.current); }

  /* `focus: false` is for a panel that opens by itself: it does not take the keyboard from whatever had it. */
  async open(name, args = {}, { focus = true } = {}) {
    clearTimeout(this.closing);
    this.current = { name, args };
    const opening = !this.el.classList.contains('open');
    this.el.hidden = false;
    void this.el.offsetWidth;
    this.el.classList.add('open');
    if (opening) {
      this.returnTo = document.activeElement;
      this.app.makeRoom();
    }
    await this.draw();
    if (opening && focus) $('#drawerClose').focus({ preventScroll: true });
  }

  /* Draw the current panel again, keeping the reader's place. */
  async refresh() {
    if (!this.current) return;
    // Someone is typing here. Do not pull the form out from under them.
    const active = document.activeElement;
    if (this.el.contains(active) && /^(INPUT|TEXTAREA)$/.test(active.tagName) && active.type !== 'checkbox') return;
    const body = $('#drawerBody');
    const scroll = body.scrollTop;
    await this.draw(false);
    body.scrollTop = scroll;
  }

  /* `fresh` is false when the same page is only being brought up to date. */
  async draw(fresh = true) {
    const { name, args } = this.current;
    const panel = this.panels[name];
    $('#drawerTitle').textContent = panel.title(args, this.app);
    const tabs = panel.tabs?.(this.app, args) ?? [];
    if (tabs.length && !tabs.some(([key]) => key === args.tab)) args.tab = tabs[0][0];
    const tabButtons = tabs.map(([key, label]) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(key === args.tab), tabindex: key === args.tab ? '0' : '-1',
      onclick: () => { args.tab = key; args.editId = null; this.draw().then(() => $('#drawerTabs [aria-selected="true"]')?.focus()); },
    }, label));
    $('#drawerTabs').replaceChildren(...tabButtons);
    $('#drawerTabs').onkeydown = (e) => { if (arrowThrough(e, tabButtons)) document.activeElement.click(); };
    $('#drawerTabs [aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });

    const body = h('div');
    try {
      await panel.render(this.app, args, body);
    } catch (error) {
      body.replaceChildren(h('p', { class: 'empty', text: error.message }));
    }
    // Something else may have been opened while this was loading
    if (this.current?.name !== name) return;
    body.className = fresh ? 'drawer-page fresh' : 'drawer-page';
    $('#drawerBody').replaceChildren(body);
    if (args.editId) $(`[data-edit="${args.editId}"]`, body)?.scrollIntoView({ block: 'center' });
  }

  close() {
    if (!this.current) return;
    const { name } = this.current;
    this.current = null;
    this.el.classList.remove('open');
    this.closing = setTimeout(() => { this.el.hidden = true; }, 380);
    this.panels[name].closed?.(this.app);
    this.app.makeRoom();
    if (this.returnTo?.isConnected) this.returnTo.focus({ preventScroll: true });
  }
}

/* A search box that picks one person. `onPick(id, name)` is called with the choice. */
export function personPicker(app, placeholder, onPick) {
  const results = h('ul', { class: 'relatives' });
  const input = h('input', {
    type: 'search', placeholder, autocomplete: 'off',
    oninput: async () => {
      const { people } = input.value.trim() ? await app.api.get(`/api/people?q=${encodeURIComponent(input.value)}`) : { people: [] };
      results.replaceChildren(...people.slice(0, 6).map((p) => h('li', {}, h('button', {
        type: 'button', class: 'link',
        onclick: () => { input.value = p.name; results.replaceChildren(); onPick(p.id, p.name); },
      }, `${p.name}${p.born ? `, ${p.born}` : ''}`))));
    },
  });
  return h('div', {}, input, results);
}
