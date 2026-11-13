/*
 * The app: holds what this browser knows (who is signed in, the tree as they
 * may see it), keeps it fresh from the server's live stream, and connects the
 * tree, the person card, the menus and the side panel.
 */

import { describeKinship, stepWord } from '/core/kinship.js';
import { activity, api } from './api.js';
import { Card } from './card.js';
import { $, arrowThrough, fill, h, hidePopover, icon, showPopover, toast } from './dom.js';
import { Drawer } from './drawer.js';
import { branchOf, displayName } from './family.js';
import { connect } from './panel-connect.js';
import { help } from './panel-help.js';
import { history as personHistory, inbox } from './panel-inbox.js';
import { STEWARD_COLOURS, manage } from './panel-manage.js';
import { invite, signin } from './panel-signin.js';
import { PetalMenu } from './petal-menu.js';
import { TreeView } from './tree-view.js';

/* Panels anyone may open. The rest need a signed-in relative. */
const OPEN_PANELS = new Set(['signin', 'invite', 'help']);

const app = {
  api, toast,
  session: null,
  tree: null,
  people: new Map(),
  focusId: null,          // whose family the tree is showing, when not the default
  undoLast: null,         // takes back this browser's last published change, for Cmd/Ctrl + Z
  painting: null,         // { member, members } while branches are being assigned on the tree

  get isAdmin() { return this.session.user?.role === 'owner' || this.session.user?.role === 'admin'; },
  /* The width of the window not covered by the side panel. */
  get freeWidth() { return innerWidth - this.view.insets.right; },
  fail(error) { toast(error.message, { bad: true }); },

  /* ---------- Loading ---------- */

  async reloadSession() {
    this.session = await api.get('/api/session');
    drawTools();
  },

  async reloadTree() {
    const tree = await api.get('/api/tree');
    const known = this.people;
    const viewer = this.session.user?.id ?? 'visitor';
    const sameViewer = this.tree && !this.tree.closed && this.viewer === viewer;
    this.viewer = viewer;
    this.tree = tree;
    this.people = new Map(tree.people.map((p) => [p.id, p]));
    $('#familyName').textContent = tree.family.name;
    $('#familyLine').textContent = tree.family.description;
    document.title = tree.family.name;
    $('#closedNote')?.remove();
    if (tree.closed) {
      $('#stage').append(h('div', { id: 'closedNote', class: 'closed-note' },
        h('h2', { text: 'This family tree is private' }), h('p', { text: 'Relatives can sign in to see it.' }),
        h('div', {}, h('button', { type: 'button', class: 'primary', onclick: () => this.openPanel('signin') }, 'Sign in'))));
    }
    this.view.setData(tree, { viewerId: this.session.user?.personId ?? null, focusId: this.focusId });

    const range = this.view.yearRange();
    const slider = $('#year');
    const atEnd = !slider.max || Number(slider.value) >= Number(slider.max);
    slider.min = range.min;
    slider.max = range.max;
    if (atEnd) setYear(range.max);
    if (this.painting) this.showBranches(this.painting.members);
    drawNote();

    // Someone else just added to the tree: say so, and offer to go there
    if (sameViewer && Date.now() - activity.lastWrite > 2500) {
      const arrived = tree.people.filter((p) => p.given && !p.masked && !p.pending && !known.has(p.id));
      if (arrived.length && arrived.length <= 3) {
        toast(`New on the tree: ${arrived.map(displayName).join(', ')}`, { action: 'Show', ms: 9000, onAction: () => this.select(arrived[0].id, { fly: true }) });
      }
    }
  },

  /* Everything again: after this browser changed something, or the server said someone else did. */
  async refresh() {
    await this.reloadSession();
    await this.reloadTree();
    if (this.painting) {
      const { members } = await api.get('/api/members');
      this.painting.members = members;
      this.showBranches(members);
    }
    await Promise.all([card.refresh(), drawer.refresh()]);
  },

  async signedIn() {
    this.focusId = this.undoLast = null;
    closeBanner();
    this.closePanel();
    this.select(null, { force: true });
    await this.refresh();
    listenToServer();
    followLink();
  },

  /* ---------- Acting ---------- */

  /*
   * Choose a person: open their card, or, while assigning branches, give or
   * take their branch. Unsaved typing in the card is not thrown away silently.
   */
  select(id, { fly = false, force = false } = {}) {
    const person = id ? this.people.get(id) : null;
    if (this.painting && person) return togglePaint(person);
    card.leave(() => {
      this.view.setSelected(person?.id ?? null);
      if (!person) return card.close();
      if (fly) this.view.flyTo(person.id);
      card.open(person);
    }, force);
  },

  /* Open a person's card straight into editing them or adding a relative. */
  openCard(person, mode = 'view', extra = {}) {
    card.leave(() => {
      this.view.setSelected(person.id);
      card.open(person, mode, extra);
    });
  },

  /*
   * Send an edit. Says what happened in a toast: saved (with Undo), or sent for
   * review. Returns the server's answer. A refusal is thrown, so a form can
   * show it beside what caused it.
   */
  async submit(ops, message, { note = '', contact = null, quiet = null } = {}) {
    const result = await api.post('/api/edits', { ops, message, note, contact });
    if (result.status === 'applied') {
      const undo = async () => {
        this.undoLast = null;
        try { await api.post(`/api/edits/${result.editId}/revert`); toast('Undone'); await this.refresh(); } catch (error) { this.fail(error); }
      };
      this.undoLast = undo;
      toast(quiet ?? 'Saved', { action: 'Undo', onAction: undo });
    } else {
      toast(`Sent for review. ${result.reasons[0] ?? ''}`.trim());
    }
    for (const warning of result.warnings.slice(0, 2)) toast(warning.message, { ms: 9000 });
    await this.refresh();
    return result;
  },

  /* Show the family this person belongs to: the tree re-roots on their oldest known ancestor. */
  async focusOn(personId) {
    this.focusId = personId === this.tree.rootId ? null : personId;
    this.select(null, { force: true });
    await this.reloadTree();
    this.view.fit(false, true);
    if (this.focusId) {
      toast(`Showing the family of ${displayName(this.people.get(personId))}`, { action: 'Back to everyone', ms: 9000, onAction: () => this.focusOn(this.tree.rootId) });
    }
  },

  openPanel(name, args = {}, options = {}) {
    closePopovers();
    return drawer.open(OPEN_PANELS.has(name) || this.session.user ? name : 'signin', args, options);
  },
  closePanel() { drawer.close(); },

  /*
   * Something that covers part of the stage opened, closed or changed size: the
   * side panel on a wide screen, the banner, the window itself. The tree and
   * the controls move over to keep clear of it.
   */
  makeRoom() {
    const right = drawer.isOpen && innerWidth > 900 ? drawer.el.offsetWidth : 0;
    const banner = $('#banner');
    document.body.style.setProperty('--inset', `${right}px`);
    document.body.classList.toggle('tight', innerWidth - right < 920);
    this.view.setInsets({ right, top: banner.hidden ? 0 : banner.offsetHeight + 8 });
    card.place();
  },

  /* Light the branches between the viewer and someone, and say what they are to each other. */
  async showRelationship(person) {
    const me = this.session.user.personId;
    try {
      const { connected, steps } = await api.get(`/api/relationship?from=${me}&to=${person.id}`);
      if (!connected) return toast(`No connection between you and ${displayName(person)} is recorded yet.`);
      const term = describeKinship(steps);
      this.select(null);
      showBanner(h('span', {},
        h('strong', { text: displayName(person) }), term ? ` is ${term}.` : ' is connected to you.',
        h('small', { text: ['You', ...steps.map((step) => `${stepWord(step)} ${step.name}`)].join(' \u2192 ') })), () => this.view.setRoute());
      // After the banner, so the way between the two is framed in the room the banner leaves
      this.view.setRoute(me, person.id);
    } catch (error) {
      this.fail(error);
    }
  },

  /* ---------- Branches on the tree ---------- */

  /* Ring everyone in the colour of the steward who looks after them. `null` clears it. */
  showBranches(members) {
    if (!members) return this.view.setTints(null);
    const tints = new Map();
    members.forEach((member, index) => {
      for (const anchor of member.anchors) {
        for (const id of branchOf(this.tree, anchor)) if (!tints.has(id)) tints.set(id, STEWARD_COLOURS[index % STEWARD_COLOURS.length]);
      }
    });
    this.view.setTints(tints);
  },

  startPainting(member, members) {
    this.painting = { member, members };
    this.closePanel();
    this.select(null, { force: true });
    this.showBranches(members);
    showBanner(h('span', { text: `Tap a person to give ${member.name} their branch. Tap them again to take it away.` }), () => {
      this.painting = null;
      this.openPanel('manage', { tab: 'branches' });
    });
  },
};

async function togglePaint(person) {
  if (person.masked || person.pending) return;
  const { member } = app.painting;
  const current = app.painting.members.find((m) => m.id === member.id);
  try {
    if (current.anchors.includes(person.id)) await api.del(`/api/members/${member.id}/branches/${person.id}`);
    else await api.post(`/api/members/${member.id}/branches`, { anchor: person.id });
    await app.refresh();
  } catch (error) {
    app.fail(error);
  }
}

/* ---------- The banner: one line across the top while a mode is on, with a way out ---------- */

let bannerDone = null;

function showBanner(content, onDone) {
  closeBanner();
  bannerDone = onDone;
  fill($('#banner'), content, h('button', { type: 'button', class: 'primary small', onclick: closeBanner }, 'Done'));
  $('#banner').hidden = false;
  app.makeRoom();
}

function closeBanner() {
  const done = bannerDone;
  bannerDone = null;
  if (!$('#banner').hidden) {
    $('#banner').hidden = true;
    app.makeRoom();
  }
  done?.();
}

/* ---------- The ring of actions around a leaf ---------- */

const petals = new PetalMenu();

function petalsFor(person) {
  const cardAction = (mode, extra) => () => app.openCard(person, mode, extra);
  if (app.view.editing && person.editing !== 'none') {
    return [
      ...app.view.addable(person.id).map((relation) => ({ label: `Add ${relation}`, icon: relation, action: cardAction('add', { relation }) })),
      { label: person.editing === 'apply' ? 'Edit details' : 'Suggest a fix', icon: 'edit', action: cardAction('edit') },
      { label: 'Open', icon: 'open', action: cardAction() },
    ];
  }
  const me = app.session.user?.personId;
  const branch = app.view.hasBranch(person.id);
  return [
    { label: 'Open', icon: 'open', action: cardAction() },
    { label: 'Focus here', icon: 'focus', action: () => app.focusOn(person.id) },
    me && me !== person.id && app.people.has(me) && { label: 'How are we related?', icon: 'related', action: () => app.showRelationship(person) },
    person.editing !== 'none' && { label: person.editing === 'apply' ? 'Edit' : 'Suggest a fix', icon: 'edit', action: cardAction('edit') },
    branch && { label: branch.collapsed ? 'Show branch' : 'Fold branch', icon: branch.collapsed ? 'unfold' : 'fold', action: () => app.view.toggleBranch(person.id) },
    { label: 'Copy link', icon: 'link', action: () => copyLink(person) },
  ].filter(Boolean);
}

async function copyLink(person) {
  const link = `${location.origin}/#person=${person.id}`;
  try {
    await navigator.clipboard.writeText(link);
    toast(`Link to ${displayName(person)} copied`);
  } catch {
    toast(link, { ms: 12000 });
  }
}

/* ---------- The pieces ---------- */

app.view = new TreeView({
  stage: $('#stage'), world: $('#world'), svg: $('#tree'),
  on: {
    select: (person) => app.select(person?.id ?? null),
    add: ({ person, relation }) => app.openCard(person, 'add', { relation }),
    hold: ({ person, x, y, keyboard = false }) => {
      // A private or pencilled leaf has nothing more to offer than a tap does
      if (person.masked || person.pending || app.painting) return;
      const box = app.view.leafRect(person.id);
      petals.open({ x: box ? box.left + box.width / 2 : x, y: box ? box.top + box.height / 2 : y, title: displayName(person), items: petalsFor(person), focus: keyboard });
    },
    holdMove: (x, y) => petals.move(x, y),
    holdEnd: (x, y) => petals.release(x, y),
    // Keep the card beside its leaf once the tree has come to rest
    moved: () => { clearTimeout(app.placing); app.placing = setTimeout(() => card.place(), 200); },
  },
});
const card = new Card(app);
const drawer = new Drawer(app, { signin, invite, inbox, history: personHistory, manage, connect, help });

/* ---------- Top bar ---------- */

const avatar = (user) => h('b', { class: 'avatar', text: user.name.split(/\s+/).map((word) => word[0]).slice(0, 2).join('') });

function drawTools() {
  const { user, counts } = app.session;
  const waiting = counts.review + counts.drafts + counts.unread;
  $('#editToggle').hidden = !user;
  $('#inboxOpen').hidden = !user;
  $('#myLeaf').hidden = !user?.personId;
  const badge = $('#inboxOpen .badge');
  badge.hidden = !waiting;
  badge.textContent = waiting;
  $('#inboxOpen').setAttribute('aria-label', waiting ? `Inbox, ${waiting} waiting` : 'Inbox');
  fill($('#menuOpen'), user ? [avatar(user), h('span', { text: user.name.split(' ')[0] })] : 'Sign in');
  $('#menuOpen').classList.toggle('primary', !user);
  if (!user && app.view.editing) setEditing(false);
}

/* What a visitor is not being shown, said plainly. */
function drawNote() {
  const hidden = app.tree.people.filter((p) => p.masked).length;
  const note = $('#note');
  note.hidden = Boolean(app.session.user) || !hidden;
  if (note.hidden) return;
  fill(note, `${hidden} living relative${hidden === 1 ? ' is' : 's are'} private. `,
    h('button', { type: 'button', class: 'link', onclick: () => app.openPanel('signin') }, 'Sign in to see them'));
}

let editHintShown = false;

function setEditing(on) {
  app.view.setEditing(on);
  card.place();                 // the card stands further off while the + buds are out
  $('#stage').classList.toggle('editing', on);
  $('#editToggle').setAttribute('aria-pressed', String(on));
  if (!on || editHintShown) return;
  editHintShown = true;
  toast('Tap a leaf, then pull a + bud to add a relative. Hold a leaf for more.', { ms: 7000 });
}

/* ---------- Menus ---------- */

const showing = (selector) => $(selector).classList.contains('open');

function closePopovers() {
  for (const [panel, opener] of [['#menu', '#menuOpen'], ['#search', '#searchOpen']]) {
    hidePopover($(panel));
    $(opener).setAttribute('aria-expanded', 'false');
  }
  app.view.setMatches(null);
}

function openMenu() {
  const { user } = app.session;
  if (!user) return app.openPanel('signin');
  const item = (iconName, label, action, props = {}) => h('button', { type: 'button', role: 'menuitem', ...props, onclick: () => { closePopovers(); action(); } }, icon(iconName), h('span', { text: label }));
  const theme = document.documentElement.getAttribute('data-theme');
  const appearance = h('div', { class: 'appearance', role: 'group', 'aria-label': 'Appearance' },
    ['light', 'dark'].map((name) => h('button', { type: 'button', 'aria-pressed': String(name === theme), onclick: () => { setAppearance(name); closePopovers(); } }, name[0].toUpperCase() + name.slice(1))));
  const waiting = app.session.counts.drafts;
  const menu = $('#menu');
  fill(menu,
    h('div', { class: 'who' }, avatar(user),
      h('div', {}, h('strong', { text: user.name }), h('small', { text: { owner: 'Owner', admin: 'Admin', member: user.anchors.length ? 'Steward' : 'Member' }[user.role] }))),
    user.personId && item('leaf', 'My leaf', () => app.select(user.personId, { fly: true })),
    item('inbox', `My suggestions and drafts${waiting ? ` (${waiting})` : ''}`, () => app.openPanel('inbox', { tab: 'mine' })),
    (app.isAdmin || user.anchors.length > 0) && item('manage', app.isAdmin ? 'Manage family' : 'Manage my branch', () => app.openPanel('manage')),
    item('spark', 'Connect your AI', () => app.openPanel('connect')),
    item('keys', 'Gestures and keys', () => app.openPanel('help')),
    h('hr'),
    appearance,
    h('hr'),
    item('signout', 'Sign out', async () => {
      await api.post('/api/auth/signout');
      await app.signedIn();
    }));
  showPopover(menu);
  $('#menuOpen').setAttribute('aria-expanded', 'true');
  menu.querySelector('[role="menuitem"]').focus();
}

/* Light or dark. A cross-fade where the browser can, with every colour inside switching at once. */
function setAppearance(theme) {
  const root = document.documentElement;
  if (theme === root.getAttribute('data-theme')) return;
  try { localStorage.setItem('rft-appearance', theme); } catch { /* private browsing */ }
  const show = () => {
    root.setAttribute('data-theme', theme);
    $('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#0C1322' : '#FFFFFF');
  };
  if (app.view.still || !document.startViewTransition) return show();
  root.classList.add('theme-cut');
  document.startViewTransition(show).updateCallbackDone.then(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-cut')));
  });
}

/* ---------- Search ---------- */

let searchRun = 0;

/* The text with the words that were typed marked, so it is clear why each person was found. */
function marked(text, query) {
  const words = query.split(/\s+/).filter(Boolean).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return text;
  return text.split(new RegExp(`(${words.join('|')})`, 'ig')).map((part, index) => (index % 2 ? h('mark', { text: part }) : part));
}

async function search() {
  const query = $('#searchInput').value.trim();
  const run = ++searchRun;
  const { people } = query ? await api.get(`/api/people?q=${encodeURIComponent(query)}`) : { people: [] };
  if (run !== searchRun) return;                // an answer to something typed earlier
  // On the tree, the people found keep their colour and everyone else steps back
  app.view.setMatches(query ? new Set(people.map((p) => p.id)) : null);
  const go = (p) => { closePopovers(); app.select(p.id, { fly: true }); };
  fill($('#searchResults'), people.length || !query
    ? people.map((p) => h('li', {}, h('button', { type: 'button', onclick: () => go(p) },
      h('span', {}, marked(p.name, query), p.birthName && h('small', {}, ' born ', marked(p.birthName, query))),
      h('small', { text: p.born ? `${p.born}${p.died ? `–${p.died}` : ''}` : '' }))))
    : h('li', { class: 'empty', text: app.session.user ? 'Nobody by that name.' : 'Nobody by that name. Living people can be found only by relatives who sign in.' }));
}

function openSearch() {
  closePopovers();
  showPopover($('#search'));
  $('#searchOpen').setAttribute('aria-expanded', 'true');
  $('#searchInput').focus();
  $('#searchInput').select();
  search();
}

/* ---------- The year slider ---------- */

let playing = null;

function setYear(year) {
  const slider = $('#year');
  const value = Math.max(Number(slider.min), Math.min(Number(slider.max), Number(year)));
  const past = value < Number(slider.max);
  slider.value = value;
  slider.style.setProperty('--filled', `${((value - slider.min) / Math.max(1, slider.max - slider.min)) * 100}%`);
  $('#yearOut').textContent = value;
  $('#today').hidden = !past;
  // Away from today, the year stands in the sky behind the tree
  $('#yearGhost').textContent = value;
  $('#yearGhost').classList.toggle('on', past);
  app.view.setYear(value);
}

function drawPlay() {
  fill($('#play'), icon(playing ? 'pause' : 'play'));
  $('#play').setAttribute('aria-label', playing ? 'Pause' : 'Play the family growing');
}

function stopPlaying() {
  clearInterval(playing);
  playing = null;
  drawPlay();
}

function togglePlay() {
  if (playing) return stopPlaying();
  const slider = $('#year');
  if (Number(slider.value) >= Number(slider.max)) setYear(slider.min);
  playing = setInterval(() => {
    if (Number(slider.value) >= Number(slider.max)) return stopPlaying();
    setYear(Number(slider.value) + 1);
  }, 110);
  drawPlay();
}

/* ---------- Live updates ---------- */

let stream = null;
let refreshing = null;

/* The server says only "something changed". This browser then asks for what it may see. */
function listenToServer() {
  stream?.close();
  stream = new EventSource('/api/stream');
  const soon = () => {
    clearTimeout(refreshing);
    refreshing = setTimeout(() => app.refresh().catch(() => {}), 120);
  };
  stream.addEventListener('changed', soon);
  stream.addEventListener('inbox', soon);
}

/* A link that was opened: a sign-in link, an invitation, a person, or an edit an AI asked its owner to look at. */
async function followLink() {
  const query = new URLSearchParams(location.search);
  const fromHash = (name) => new RegExp(`(?:^|[#&])${name}=([\\w-]+)`).exec(location.hash)?.[1];
  if (query.has('signin')) {
    history.replaceState(null, '', location.pathname + location.hash);
    try {
      await api.post('/api/auth/redeem', { token: query.get('signin') });
      await app.signedIn();
      toast(`Signed in as ${app.session.user.name}`);
    } catch (error) { app.fail(error); }
  } else if (query.has('invite') && !app.session.user) {
    app.openPanel('invite', { token: query.get('invite') });
  } else if (fromHash('edit')) {
    const editId = fromHash('edit');
    if (app.session.user) history.replaceState(null, '', location.pathname);
    app.openPanel('inbox', { tab: 'mine', editId });
  } else if (app.people.has(fromHash('person'))) {
    app.select(fromHash('person'), { fly: true });
  }
}

/* ---------- Wiring ---------- */

fill($('#zoomIn'), icon('plus'));
fill($('#zoomOut'), icon('minus'));
fill($('#fit'), icon('fit'));
fill($('#myLeaf'), icon('leaf'));
drawPlay();

const goToMyLeaf = () => app.session.user?.personId && app.select(app.session.user.personId, { fly: true });
const wholeTree = () => { app.select(null); app.view.fit(true, true); };

$('#editToggle').addEventListener('click', () => setEditing(!app.view.editing));
$('#menuOpen').addEventListener('click', () => { const wasOpen = showing('#menu'); closePopovers(); if (!wasOpen) openMenu(); });
$('#inboxOpen').addEventListener('click', () => app.openPanel('inbox', { tab: app.session.counts.review ? 'review' : 'mine' }));
$('#searchOpen').addEventListener('click', () => (showing('#search') ? closePopovers() : openSearch()));
$('#searchInput').addEventListener('input', search);
$('#year').addEventListener('input', (e) => { if (playing) stopPlaying(); setYear(e.target.value); });
$('#play').addEventListener('click', togglePlay);
$('#today').addEventListener('click', () => { if (playing) stopPlaying(); setYear($('#year').max); });
$('#zoomIn').addEventListener('click', () => app.view.zoomStep(1.5));
$('#zoomOut').addEventListener('click', () => app.view.zoomStep(1 / 1.5));
$('#fit').addEventListener('click', wholeTree);
$('#myLeaf').addEventListener('click', goToMyLeaf);

// Menus: arrow keys move through them, a tap anywhere else closes them
$('#menu').addEventListener('keydown', (e) => arrowThrough(e, [...$('#menu').querySelectorAll('[role="menuitem"]')]));
$('#search').addEventListener('keydown', (e) => {
  const results = [...$('#searchResults').querySelectorAll('button')];
  if (e.target === $('#searchInput')) {
    if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); results[0].focus(); }
    if (e.key === 'Enter' && results.length) results[0].click();
  } else if (e.key === 'ArrowUp' && e.target === results[0]) {
    e.preventDefault();
    $('#searchInput').focus();
  } else {
    arrowThrough(e, results);
  }
});
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#menu, #search, #menuOpen, #searchOpen')) closePopovers();
}, true);
addEventListener('resize', () => app.makeRoom());

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
  if (e.key === 'Escape') {
    // Whatever is on top closes first
    if (petals.isOpen) petals.close();
    else if (showing('#menu') || showing('#search')) { const opener = showing('#menu') ? '#menuOpen' : '#searchOpen'; closePopovers(); $(opener).focus(); }
    else if (drawer.isOpen) app.closePanel();
    else if (card.isOpen) app.select(null);
    else if (bannerDone) closeBanner();
    else if (app.view.editing) setEditing(false);
    return;
  }
  if (typing) return;
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && app.undoLast) {
    e.preventDefault();
    return app.undoLast();
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const slider = $('#year');
  const keys = {
    '/': openSearch,
    '?': () => app.openPanel('help'),
    e: () => app.session.user && setEditing(!app.view.editing),
    m: goToMyLeaf,
    f: () => app.view.selectedId && app.focusOn(app.view.selectedId),
    p: togglePlay,
    '+': () => app.view.zoomStep(1.5),
    '=': () => app.view.zoomStep(1.5),
    '-': () => app.view.zoomStep(1 / 1.5),
    0: wholeTree,
    '[': () => { if (playing) stopPlaying(); setYear(Number(slider.value) - 1); },
    ']': () => { if (playing) stopPlaying(); setYear(Number(slider.value) + 1); },
  };
  const action = keys[e.key] ?? keys[e.key.toLowerCase()];
  if (!action) return;
  e.preventDefault();
  action();
});

app.makeRoom();
await app.reloadSession();
await app.reloadTree();
listenToServer();
await followLink();
// A first-time visitor on a wide screen is offered the demo accounts once the tree has grown
if (!app.session.user && !drawer.isOpen && !app.view.still && innerWidth > 900) setTimeout(() => { if (!app.session.user && !drawer.isOpen) app.openPanel('signin', {}, { focus: false }); }, 3200);
