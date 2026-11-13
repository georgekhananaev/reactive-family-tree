/*
 * The person card. It grows out of the tapped leaf and is where one person is
 * read, edited, corrected, and given relatives. On a phone it is a sheet that
 * can be pulled taller or flicked away.
 */

import { addRelative, relativeMessage } from '/core/compose.js';
import { formatDate, parseDate } from '/core/dates.js';
import { describeKinship } from '/core/kinship.js';
import { CERTAINTY, FACT_TYPES, SEXES } from '/core/ops.js';
import { $, confirmButton, field, fill, h, icon, lifespan, select, when } from './dom.js';
import { displayName, lookupFrom } from './family.js';
import { leafPortrait } from './tree-view.js';

const OTHER_FACTS = FACT_TYPES.filter((type) => type !== 'birth' && type !== 'death');
const titled = (list) => list.map((value) => [value, value[0].toUpperCase() + value.slice(1)]);
const PRIVACY_LABELS = { default: 'Follow the family’s setting', members: 'Relatives only', private: 'Private', public: 'Public, even while living' };
const PHONE = matchMedia('(max-width: 640px)');

/* A date box that says back how it was understood, so "abt 1890" is seen to mean "about 1890". */
function dateField(label, input) {
  const reads = h('small', { class: 'reads' });
  const show = () => {
    const date = parseDate(input.value);
    const spoken = date && date.kind !== 'text' ? formatDate(date) : '';
    reads.textContent = !date || spoken === input.value.trim() ? '' : spoken ? `Read as ${spoken}` : 'Not read as a date. Kept as you wrote it.';
  };
  input.addEventListener('input', show);
  show();
  return field(label, [input, reads]);
}

export class Card {
  constructor(app) {
    this.app = app;
    this.el = $('#card');
    this.el.tabIndex = -1;
    this.person = null;
    this.dirty = false;            // something typed here has not been saved
    this.listenForDrag();
  }

  get isOpen() { return Boolean(this.person); }

  /* ---------- Opening, closing, placing ---------- */

  /* `quiet` is for bringing the same card up to date: nothing fades or moves. */
  async open(person, mode = 'view', extra = {}, quiet = false) {
    clearTimeout(this.closing);
    // Opened from the keyboard: the keyboard moves into the card, and goes back to the leaf afterwards
    const fromKeys = !quiet && document.activeElement?.matches?.('.leaf-node:focus-visible');
    if (fromKeys) this.returnTo = document.activeElement;
    Object.assign(this, { person, mode, extra, dirty: false });
    // Until the new person has loaded, what is still showing steps back and cannot be pressed
    this.el.classList.toggle('loading', !quiet);
    let detail = null, kin = null, pendingEdit = null;
    try {
      if (person.pending) pendingEdit = await this.app.api.get(`/api/edits/${person.pending.editId}`).catch(() => null);
      else if (!person.masked) [detail, kin] = await Promise.all([this.app.api.get(`/api/people/${person.id}`), this.kinshipTo(person)]);
    } catch (error) {
      if (this.person !== person) return;
      this.app.fail(error);
      return this.app.select(null, { force: true });
    }
    if (this.person !== person) return;         // someone else was tapped while this loaded
    Object.assign(this, { detail, kin, pendingEdit });
    this.el.classList.remove('loading');
    this.render(!quiet);
    if (this.el.classList.contains('open')) {
      this.place(!quiet);
    } else {
      this.el.classList.remove('settled', 'tall');
      this.el.style.transform = '';
      this.el.hidden = false;
      this.place(true);
      void this.el.offsetWidth;
      this.el.classList.add('open');
      // From here on, following its leaf is a glide and not a jump
      requestAnimationFrame(() => this.el.classList.add('settled'));
    }
    if (fromKeys) this.el.focus({ preventScroll: true });
  }

  /* What this person is to the viewer, in a word or two, when both are on the tree. */
  async kinshipTo(person) {
    const me = this.app.session.user?.personId;
    if (!me || me === person.id || !this.app.people.has(me)) return null;
    const { connected, steps } = await this.app.api.get(`/api/relationship?from=${me}&to=${person.id}`).catch(() => ({ connected: false }));
    return connected ? describeKinship(steps) ?? 'related to you' : null;
  }

  /* The family changed. Draw again with fresh data, unless that would pull a form out from under someone. */
  async refresh() {
    if (!this.person || this.mode !== 'view' || this.dirty) return;
    const current = this.app.people.get(this.person.id);
    if (!current) return this.app.select(null, { force: true });
    await this.open(current, 'view', {}, true);
  }

  close() {
    const hadFocus = this.el.contains(document.activeElement);
    this.person = null;
    this.dirty = false;
    this.el.classList.remove('open', 'loading');
    this.closing = setTimeout(() => {
      this.el.hidden = true;
      this.el.style.transform = '';
    }, 260);
    // The keyboard goes back to the leaf it came from, or to the tree if that leaf has been redrawn
    if (!hadFocus) return;
    if (this.returnTo?.isConnected) this.returnTo.focus({ preventScroll: true });
    else this.app.view.focus();
  }

  /*
   * Run `go` once it is fine to move on. Typing that has not been saved is not
   * thrown away silently: the card asks first. `force` skips the question.
   */
  leave(go, force = false) {
    if (force || !this.dirty) {
      this.dirty = false;
      return go();
    }
    this.asking?.remove();
    const keep = h('button', { type: 'button', class: 'small', onclick: () => this.asking.remove() }, 'Keep editing');
    this.asking = h('div', { class: 'card-ask', role: 'alertdialog', 'aria-label': 'Unsaved changes' },
      h('span', { text: 'Leave without saving?' }), keep,
      h('button', { type: 'button', class: 'small danger', onclick: () => { this.dirty = false; go(); } }, 'Discard'));
    this.el.append(this.asking);
    keep.focus({ preventScroll: true });
  }

  /*
   * Beside the leaf on a wide screen, on the side away from the trunk so it
   * hangs off the outside of the tree and not across its middle. It follows
   * the leaf when the tree moves. On a phone it is a sheet, and with `reveal`
   * the tree moves so the leaf stays in view above it.
   */
  place(reveal = false) {
    if (!this.person || this.el.hidden) return;
    const leaf = this.app.view.leafRect(this.person.id);
    if (!leaf) return;
    if (PHONE.matches) {
      this.el.style.left = this.el.style.top = this.el.style.transformOrigin = '';
      if (!reveal) return;
      const dy = Math.min(0, this.el.offsetTop - 16 - leaf.bottom);
      const dx = leaf.left < 12 ? 12 - leaf.left : leaf.right > innerWidth - 12 ? innerWidth - 12 - leaf.right : 0;
      if (dx || dy) this.app.view.panBy(dx, dy);
      return;
    }
    const { view } = this.app;
    const free = this.app.freeWidth, width = this.el.offsetWidth, height = this.el.offsetHeight;
    const cx = leaf.left + leaf.width / 2, cy = leaf.top + leaf.height / 2;
    const gap = view.editing ? 150 : 44;        // in edit mode the + buds around the leaf stay uncovered
    const sides = { left: cx - gap - width, right: cx + gap };
    const fits = (x) => x >= 12 && x + width <= free - 12;
    const outward = cx < view.trunkX ? 'left' : 'right', inward = outward === 'left' ? 'right' : 'left';
    const left = Math.max(12, Math.min(free - width - 12, fits(sides[outward]) || !fits(sides[inward]) ? sides[outward] : sides[inward]));
    const top = Math.max(76, Math.min(innerHeight - height - 92, cy - height / 2));
    Object.assign(this.el.style, { left: `${left}px`, top: `${top}px`, transformOrigin: `${cx - left}px ${cy - top}px` });
  }

  /* On a phone the card is a sheet: pull it up to read more, down to put it away. */
  listenForDrag() {
    let drag = null;
    this.el.addEventListener('pointerdown', (e) => {
      if (!PHONE.matches || !e.target.closest('.card-grab, .head') || e.target.closest('button')) return;
      drag = { y: e.clientY, dy: 0, at: performance.now(), onGrab: Boolean(e.target.closest('.card-grab')) };
      this.el.setPointerCapture(e.pointerId);
      this.el.style.transition = 'none';
    });
    this.el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      drag.dy = e.clientY - drag.y;
      // Pulled up it resists: the sheet grows when let go, it does not chase the finger
      this.el.style.transform = `translateY(${drag.dy > 0 ? drag.dy : drag.dy / 4}px)`;
    });
    const end = () => {
      if (!drag) return;
      const { dy, at, onGrab } = drag;
      const tall = this.el.classList.contains('tall');
      const flicked = Math.abs(dy) > 24 && performance.now() - at < 220;
      drag = null;
      this.el.style.transition = this.el.style.transform = '';
      if (Math.abs(dy) < 6) { if (onGrab) this.el.classList.toggle('tall'); return; }
      if (dy < -40 || (flicked && dy < 0)) return this.el.classList.add('tall');
      if (dy < 70 && !flicked) return;
      if (tall) return this.el.classList.remove('tall');
      this.app.select(null);
      // Gone, unless there was unsaved typing and the card stayed to ask about it
      if (!this.person) this.el.style.transform = 'translateY(110%)';
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  }

  /* ---------- Drawing ---------- */

  render(animated = true) {
    const content = this.person.masked ? this.maskedView()
      : this.person.pending ? this.pendingView()
        : this.mode === 'edit' ? this.editForm()
          : this.mode === 'add' ? this.addForm()
            : this.view();
    const held = this.el.contains(document.activeElement);
    const scroll = this.body?.scrollTop ?? 0;
    this.body = h('div', { class: animated ? 'card-body swap' : 'card-body' }, content);
    fill(this.el,
      h('div', { class: 'card-grab', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: () => this.app.select(null) }, '×'),
      this.body);
    if (!animated) this.body.scrollTop = scroll;
    if (held) this.el.focus({ preventScroll: true });
    this.el.setAttribute('aria-label', displayName(this.person));
  }

  head(person, lines = [], more = null) {
    const medal = h('div', { class: 'medal' });
    medal.innerHTML = leafPortrait(person);     // fixed markup, nothing typed by a person
    return h('div', { class: 'head' }, medal, h('div', {},
      h('h2', { text: displayName(person) }),
      person.birthName && h('p', { class: 'born-as', text: `born ${person.birthName}` }),
      lines.map((line) => h('p', { class: 'life', text: line })),
      more));
  }

  maskedView() {
    return [
      this.head(this.person, ['Details are private']),
      h('p', { class: 'hint-line', text: 'Living people are shown only to relatives who sign in.' }),
      !this.app.session.user && h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'primary', onclick: () => this.app.openPanel('signin') }, 'Sign in')),
    ];
  }

  /* Someone who is only suggested or drafted so far. */
  pendingView() {
    const edit = this.pendingEdit;
    const draft = this.person.pending.status === 'draft';
    return [
      this.head(this.person, [this.person.born ? `born ${this.person.born}` : '', draft ? 'A draft, not on the tree yet' : `Suggested by ${this.person.pending.by}`].filter(Boolean)),
      edit?.note && h('p', { class: 'pencil', text: edit.note }),
      h('p', { class: 'hint-line', text: draft ? 'Only you can see this until you apply it.' : 'Waiting for a steward or admin to decide.' }),
      h('div', { class: 'form-actions' },
        h('button', { type: 'button', class: 'primary', onclick: () => this.app.openPanel('inbox', { tab: draft || !edit?.canReview ? 'mine' : 'review', editId: this.person.pending.editId }) },
          draft ? 'Review the draft' : edit?.canReview ? 'Review it' : 'See the suggestion')),
    ];
  }

  view() {
    const d = this.detail, app = this.app;
    const birth = d.facts.find((fact) => fact.type === 'birth');
    const death = d.facts.find((fact) => fact.type === 'death');
    const life = [birth?.dateText && `born ${birth.dateText}`, death?.dateText && `died ${death.dateText}`].filter(Boolean).join(', ') || lifespan(d);
    const others = d.facts.filter((fact) => fact.type !== 'birth' && fact.type !== 'death');
    const go = (relative) => (relative.id
      ? h('button', { type: 'button', class: 'link', onclick: () => app.select(relative.id, { fly: true }) }, relative.name)
      : h('span', { text: relative.name }));
    const sentence = (label, people) => people.length ? h('li', {}, `${label} `, people.flatMap((p, i) => [i ? (i === people.length - 1 ? ' and ' : ', ') : '', go(p)])) : null;
    const branch = app.view.hasBranch(d.id);
    // What they are to the person reading: tap it to see the way between the two leaves
    const kin = d.isSelf ? h('p', { class: 'kin', text: 'This is you' })
      : this.kin && h('p', { class: 'kin' }, h('button', { type: 'button', class: 'link', onclick: () => app.showRelationship(this.person) }, this.kin[0].toUpperCase() + this.kin.slice(1)));

    return [
      this.head(d, [life, birth?.place].filter(Boolean), kin),
      d.waiting.map((edit) => h('div', { class: 'pencil' },
        h('div', { text: `${edit.author} suggests: ${edit.lines.map((line) => [line.text, ...line.fields.map((f) => `${f.was ?? ''} → ${f.to}`)].join(' ')).join('; ')}` }),
        edit.note && h('div', { text: `“${edit.note}”` }),
        h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'small', onclick: () => app.openPanel('inbox', { tab: edit.canReview ? 'review' : 'mine', editId: edit.id }) }, edit.canReview ? 'Review' : 'Open')))),

      others.length ? h('ul', { class: 'facts' }, others.map((fact) => h('li', {},
        h('span', { class: 'kind', text: fact.type }),
        h('span', { class: 'what', text: [fact.value, fact.dateText, fact.place].filter(Boolean).join(', ') })))) : null,

      h('h3', { text: 'Family' }),
      h('ul', { class: 'relatives' },
        sentence('Child of', d.parents),
        d.unions.map((union) => [
          union.partner && h('li', {}, union.status === 'ended' ? 'Was partner of ' : 'Partner of ', go(union.partner), union.since ? ` since ${union.since}` : ''),
          sentence(union.children.length === 1 ? 'Child:' : 'Children:', union.children),
        ]),
        sentence(d.siblings.length === 1 ? 'Sibling:' : 'Siblings:', d.siblings),
        !d.parents.length && !d.unions.length && h('li', { text: 'Nobody is connected yet.' })),

      d.bio && [h('h3', { text: 'Story' }), h('p', { class: 'story', text: d.bio })],

      (d.memories.length || app.session.user) && h('h3', { text: 'Memories' }),
      d.memories.map((memory) => h('div', { class: 'memory' }, h('p', { text: memory.body }), h('small', { text: `${memory.author}, ${when(memory.at)}` }))),
      app.session.user && this.memoryForm(),

      h('div', { class: 'form-actions' },
        d.editing !== 'none' && h('button', { type: 'button', class: 'primary', onclick: () => this.switchTo('edit') }, d.editing === 'apply' ? 'Edit' : 'Suggest a fix'),
        h('button', { type: 'button', onclick: () => app.focusOn(d.id) }, 'Focus here'),
        branch && h('button', { type: 'button', onclick: () => { app.view.toggleBranch(d.id); this.render(false); } }, branch.collapsed ? 'Show branch' : 'Fold branch'),
        app.session.user && h('button', { type: 'button', onclick: () => app.openPanel('history', { personId: d.id, name: d.name }) }, 'History')),
      d.editing !== 'none' && h('div', { class: 'add-row' }, h('span', { text: 'Add a' }),
        app.view.addable(d.id).map((relation) => h('button', { type: 'button', class: 'small', onclick: () => this.switchTo('add', { relation }) }, icon(relation), relation))),
    ];
  }

  memoryForm() {
    const d = this.detail;
    const text = h('textarea', {
      class: 'short', placeholder: `Share a memory of ${d.given || 'them'}`, rows: 2, 'aria-label': `A memory of ${d.name}`,
      onkeydown: (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) text.form.requestSubmit(); },
    });
    return this.form(text, {
      saveLabel: 'Add memory', small: true, unsaved: () => Boolean(text.value.trim()),
      save: async () => {
        if (!text.value.trim()) return;
        await this.app.submit([{ type: 'memory.add', person: d.id, body: text.value }], `A memory of ${d.name}`, { quiet: 'Memory added' });
        await this.saved(true);
      },
    });
  }

  switchTo(mode, extra = {}) {
    Object.assign(this, { mode, extra, dirty: false });
    this.render();
    this.place(true);
  }

  /* After a save: show the person again, as they now are. `inPlace` keeps the reader where they were. */
  async saved(inPlace = false) {
    this.dirty = false;
    const current = this.app.people.get(this.person.id);
    if (current) await this.open(current, 'view', {}, inPlace);
    else this.app.select(null, { force: true });
  }

  /*
   * A form in the card. Enter saves, the button shows that it is saving and
   * cannot be pressed twice, and a refusal is shown beside it. `save` throws
   * whatever should be shown. What is typed counts as unsaved until then.
   */
  form(content, { saveLabel, save, small = false, cancel = false, more = null, unsaved = () => true }) {
    const problem = h('p', { class: 'warning', role: 'alert', hidden: true });
    const submit = h('button', { type: 'submit', class: small ? 'small' : 'primary' }, saveLabel);
    return h('form', {
      novalidate: true,
      oninput: () => { this.dirty = unsaved(); },
      onsubmit: async (e) => {
        e.preventDefault();
        if (submit.disabled) return;
        problem.hidden = true;
        submit.disabled = true;
        submit.textContent = 'Saving…';
        try {
          await save();
        } catch (error) {
          problem.textContent = error.message;
          problem.hidden = false;
          problem.scrollIntoView({ block: 'nearest' });
        } finally {
          submit.disabled = false;
          submit.textContent = saveLabel;
        }
      },
    }, content, problem, h('div', { class: 'form-actions' },
      submit, cancel && h('button', { type: 'button', onclick: () => this.switchTo('view') }, 'Cancel'), more));
  }

  /* Name and email, asked of a visitor so the family can reach them. */
  contactFields() {
    if (this.app.session.user) return { nodes: [], read: () => null };
    const name = h('input', { type: 'text', autocomplete: 'name' }), email = h('input', { type: 'email', autocomplete: 'email' });
    return { nodes: [field('Your name', name), field('Your email', email)], read: () => ({ name: name.value, email: email.value }) };
  }

  /* ---------- Editing one person ---------- */

  editForm() {
    const d = this.detail, app = this.app;
    const direct = d.editing === 'apply';
    const birth = d.facts.find((fact) => fact.type === 'birth'), death = d.facts.find((fact) => fact.type === 'death');
    const input = (value, props = {}) => h('input', { type: 'text', value: value ?? '', autocomplete: 'off', ...props });
    const f = {
      given: input(d.given), family: input(d.family), birthName: input(d.birthName),
      sex: select(titled(SEXES), d.sex), living: select([['yes', 'Living'], ['no', 'Has died'], ['unknown', 'Not known']], d.living),
      born: input(birth?.dateText, { placeholder: 'about 1890, March 1921, 4 March 1921' }), birthPlace: input(birth?.place),
      died: input(death?.dateText), bio: h('textarea', { rows: 4 }, d.bio),
      privacy: select(Object.entries(PRIVACY_LABELS).filter(([key]) => key !== 'public' || (d.isSelf && !d.gone)), d.privacy),
      note: input('', { placeholder: 'How do you know? A document, a gravestone, a memory' }),
    };
    const contact = this.contactFields();

    // When someone died is asked only once they are said to have died
    const died = dateField('Died', f.died);
    const showDied = () => { died.hidden = f.living.value === 'yes' && !f.died.value.trim(); };
    f.living.addEventListener('change', showDied);
    showDied();

    // Other facts: change them in place, mark one for removal, or add a new one
    const removed = new Set();
    const factRows = d.facts.filter((fact) => fact !== birth && fact !== death).map((fact) => {
      const row = {
        fact, value: input(fact.value, { placeholder: 'Detail', 'aria-label': `${fact.type}: detail` }),
        date: input(fact.dateText, { placeholder: 'When', 'aria-label': `${fact.type}: when` }), place: input(fact.place, { placeholder: 'Where', 'aria-label': `${fact.type}: where` }),
      };
      row.node = h('div', { class: 'fields' },
        h('strong', { class: 'wide', text: fact.type[0].toUpperCase() + fact.type.slice(1) }), row.value, row.date, row.place,
        h('button', { type: 'button', class: 'small danger', onclick: () => { removed.add(fact.id); row.node.remove(); this.dirty = true; } }, 'Remove'));
      return row;
    });
    // A new fact asks for its details only once its kind is chosen
    const fresh = {
      type: select([['', 'Add a fact…'], ...titled(OTHER_FACTS)], '', { 'aria-label': 'Add a fact' }),
      value: input('', { placeholder: 'Detail', 'aria-label': 'New fact: detail' }), date: input('', { placeholder: 'When', 'aria-label': 'New fact: when' }),
      place: input('', { placeholder: 'Where', 'aria-label': 'New fact: where' }), certainty: select(titled(CERTAINTY), 'certain', { 'aria-label': 'How certain' }),
    };
    const freshDetails = [fresh.value, fresh.date, fresh.place, fresh.certainty];
    const showFresh = () => { for (const control of freshDetails) control.hidden = !fresh.type.value; };
    fresh.type.addEventListener('change', () => { showFresh(); if (fresh.type.value) fresh.value.focus(); });
    showFresh();

    const save = async () => {
      const ops = [];
      const set = {};
      for (const key of ['given', 'family', 'birthName', 'bio']) if (f[key].value.trim() !== (d[key] ?? '')) set[key] = f[key].value.trim();
      for (const key of ['sex', 'living', 'privacy']) if (f[key].value !== d[key]) set[key] = f[key].value;
      if (Object.keys(set).length) ops.push({ type: 'person.update', person: d.id, set });

      const lifeFact = (existing, type, dateText, place) => {
        const date = parseDate(dateText);
        const same = existing && existing.dateText === dateText.trim() && existing.place === place;
        if (same || (!existing && !date && !place)) return;
        if (!existing) ops.push({ type: 'fact.add', subject: { type: 'person', id: d.id }, set: { type, date, place } });
        else if (!date && !place) ops.push({ type: 'fact.remove', fact: existing.id });
        else {
          // Only what actually changed, so a reviewer sees one clear difference
          const change = {};
          if (existing.dateText !== dateText.trim()) change.date = date;
          if (existing.place !== place) change.place = place;
          ops.push({ type: 'fact.update', fact: existing.id, set: change });
        }
      };
      lifeFact(birth, 'birth', f.born.value, f.birthPlace.value.trim());
      lifeFact(death, 'death', f.died.value, death?.place ?? '');

      for (const id of removed) ops.push({ type: 'fact.remove', fact: id });
      for (const row of factRows) {
        if (removed.has(row.fact.id)) continue;
        const change = {};
        if (row.value.value.trim() !== row.fact.value) change.value = row.value.value.trim();
        if (row.date.value.trim() !== row.fact.dateText) change.date = parseDate(row.date.value);
        if (row.place.value.trim() !== row.fact.place) change.place = row.place.value.trim();
        if (Object.keys(change).length) ops.push({ type: 'fact.update', fact: row.fact.id, set: change });
      }
      if (fresh.type.value) {
        ops.push({ type: 'fact.add', subject: { type: 'person', id: d.id }, set: { type: fresh.type.value, value: fresh.value.value.trim(), date: parseDate(fresh.date.value), place: fresh.place.value.trim(), certainty: fresh.certainty.value } });
      }
      if (!ops.length) return this.switchTo('view');
      await app.submit(ops, `${direct ? 'Update' : 'Correct'} ${d.name}`, { note: f.note.value, contact: contact.read() });
      await this.saved();
    };
    const remove = async () => {
      try {
        await app.submit([{ type: 'person.remove', person: d.id }], `Remove ${d.name}`, { quiet: `${d.name} moved to the compost` });
        app.select(null, { force: true });
      } catch (error) {
        app.fail(error);
      }
    };

    return [
      this.head(d, [direct ? 'Changes are published at once' : 'Changes go to a steward for review']),
      this.form([
        h('div', { class: 'fields' },
          field('Given name', f.given), field('Family name', f.family), field('Born as', f.birthName), field('Sex', f.sex),
          dateField('Born', f.born), field('Birthplace', f.birthPlace), field('Living', f.living), died,
          field('Story', f.bio, { class: 'wide' }),
          (d.isSelf || app.isAdmin) && field('Who can see this person', f.privacy, { class: 'wide' })),
        h('h3', { text: 'Other facts' }),
        factRows.map((row) => row.node),
        h('div', { class: 'fields' }, h('div', { class: 'wide' }, fresh.type), freshDetails),
        !direct && h('div', { class: 'fields review-fields' }, field('A note for the reviewer', f.note, { class: 'wide' }), contact.nodes),
      ], {
        saveLabel: direct ? 'Save' : 'Send for review', save, cancel: true,
        more: d.canRemove && confirmButton('Remove', 'Really remove?', remove, { class: 'danger' }),
      }),
    ];
  }

  /* ---------- Adding a relative ---------- */

  addForm() {
    const d = this.detail, app = this.app, relation = this.extra.relation;
    const direct = d.editing === 'apply';
    const keepsName = relation === 'child' || relation === 'sibling';
    const f = {
      given: h('input', { type: 'text', autocomplete: 'off' }), family: h('input', { type: 'text', autocomplete: 'off', value: keepsName ? d.family : '' }),
      born: h('input', { type: 'text', autocomplete: 'off', placeholder: 'A year, or as exactly as you know' }),
      died: h('input', { type: 'text', autocomplete: 'off', placeholder: 'Leave empty if living' }),
      sex: select(titled(SEXES), 'unknown'),
      // A child belongs to one of the person's partnerships
      union: d.unions.length > 1 && relation === 'child'
        ? select(d.unions.map((union) => [union.id, union.partner ? `with ${union.partner.name}` : 'with no recorded partner']), d.unions[0].id) : null,
    };
    const contact = this.contactFields();

    const save = async () => {
      const details = { given: f.given.value.trim(), family: f.family.value.trim(), birthName: '', sex: f.sex.value, born: f.born.value, died: f.died.value };
      if (!details.given) {
        f.given.focus();
        throw new Error('Enter at least a given name.');
      }
      const openUnion = relation === 'partner' ? d.unions.find((union) => !union.partner)?.id : null;
      const { ops, ref } = addRelative(lookupFrom(app.tree), { of: d.id, relation, details, unionId: f.union?.value ?? openUnion ?? null });
      const done = await app.submit(ops, relativeMessage(relation, details, d.name), { contact: contact.read() });
      this.dirty = false;
      // Published: go to the new leaf. Sent for review: stay with the person it was added to.
      if (done.created?.[ref]) app.select(done.created[ref], { fly: true });
      else await this.saved();
    };

    setTimeout(() => f.given.focus({ preventScroll: true }), 80);
    return [
      this.head(d, [`Add a ${relation}`]),
      this.form([
        h('div', { class: 'fields' },
          field('Given name', f.given), field('Family name', f.family), dateField('Born', f.born), dateField('Died', f.died), field('Sex', f.sex),
          f.union && field('Child', f.union), !direct && contact.nodes),
        h('p', { class: 'hint-line', text: direct ? 'Only what you know. The rest can be added later.' : 'This is outside your branch, so it will be sent for review.' }),
      ], { saveLabel: direct ? `Add ${relation}` : 'Send for review', save, cancel: true }),
    ];
  }
}
