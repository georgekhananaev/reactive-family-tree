/*
 * Small helpers for building the interface. Everything a person typed reaches
 * the page as text, never as markup.
 */

/*
 * h('button', { class: 'primary', onclick: save }, 'Save')
 * Props starting with "on" are listeners, `class`, `text` and `hidden` are what
 * they say, everything else is an attribute. Children may be elements, strings,
 * arrays, or null.
 */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'value') node.value = value;
    else if (key === 'checked' || key === 'hidden' || key === 'disabled') node[key] = Boolean(value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  return put(node, ...children);
}

/* Add children: lists are flattened, and anything missing (null, undefined, false) is skipped. */
export function put(parent, ...children) {
  parent.append(...children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false));
  return parent;
}

/* Replace what an element holds. */
export function fill(parent, ...children) {
  parent.replaceChildren();
  return put(parent, ...children);
}

export const $ = (selector, root = document) => root.querySelector(selector);

/* A labelled control. */
export const field = (label, control, extra = {}) => h('label', extra, label, control);

export function select(options, value, props = {}) {
  return h('select', props, options.map(([key, label]) => h('option', { value: key, selected: key === value }, label)));
}

/* A value with a button that copies it. */
export function copyRow(value) {
  const input = h('input', { type: 'text', readonly: true, value, onfocus: (e) => e.target.select() });
  const button = h('button', { type: 'button', class: 'small', onclick: async () => {
    try { await navigator.clipboard.writeText(value); } catch { input.select(); document.execCommand('copy'); }
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy'; }, 1600);
  } }, 'Copy');
  return h('div', { class: 'copy' }, input, button);
}

/* A button that asks once more before doing something that is hard to take back. */
export function confirmButton(label, sure, action, props = {}) {
  const button = h('button', { type: 'button', ...props, onclick: () => {
    if (button.dataset.armed) return action();
    button.dataset.armed = '1';
    button.textContent = sure;
    setTimeout(() => { delete button.dataset.armed; button.textContent = label; }, 4000);
  } }, label);
  return button;
}

/* A short message at the bottom, optionally with one action such as Undo. */
export function toast(message, { action = null, onAction = null, bad = false, ms = 6000 } = {}) {
  const node = h('div', { class: `toast${bad ? ' bad' : ''}`, role: bad ? 'alert' : 'status' }, h('span', { text: message }));
  const leave = () => {
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 260);
  };
  if (action) node.append(h('button', { type: 'button', onclick: () => { leave(); onAction(); } }, action));
  $('#toasts').append(node);
  setTimeout(leave, ms);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* "today, 14:05" or "3 Nov 2026" */
export function when(isoTime) {
  if (!isoTime) return '';
  const date = new Date(isoTime);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (date.toDateString() === new Date().toDateString()) return `today, ${time}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function lifespan(person) {
  if (!person.born) return person.died ? `died ${person.died}` : '';
  return person.died ? `${person.born} to ${person.died}` : `born ${person.born}`;
}

/* Read a file the person picked, as text. */
export function pickFile(accept, onText) {
  const input = h('input', { type: 'file', accept, hidden: true, onchange: async () => {
    const file = input.files[0];
    if (file) onText(await file.text(), file.name);
    input.remove();
  } });
  document.body.append(input);
  input.click();
}

/* ---------- Icons: one weight of line, drawn to match the ink of the branches ---------- */

const ring = (cx, cy, r) => `M${cx - r},${cy}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0`;
const ICONS = {
  open: `M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z ${ring(12, 12, 2.8)}`,
  focus: `${ring(12, 12, 6.5)} M12 2.5v4 M12 17.5v4 M2.5 12h4 M17.5 12h4`,
  related: `${ring(6.5, 7, 3)} ${ring(17.5, 17, 3)} M9 9.2l6 5.6`,
  edit: 'M4 20l4-1 10-10-3-3L5 16l-1 4z M14 7l3 3',
  fold: 'M7 4.5l5 5 5-5 M7 19.5l5-5 5 5',
  unfold: 'M7 9.5l5-5 5 5 M7 14.5l5 5 5-5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  child: 'M12 21V10 M12 10c0-3.3 2.6-5.5 6.5-5.5 0 3.3-2.6 5.5-6.5 5.5z M12 14.5c0-2.7-2.1-4.5-5.5-4.5 0 2.7 2.1 4.5 5.5 4.5z',
  partner: 'M12 20s-7.5-4.6-7.5-10.2a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z',
  parent: 'M12 3.5v12 M7 10.5l5 5 5-5 M5 20.5h14',
  sibling: 'M8 21V11 M8 11c0-3-1.8-5-4.5-5.5 0 3 1.8 5 4.5 5.5z M16 21V11 M16 11c0-3 1.8-5 4.5-5.5 0 3-1.8 5-4.5 5.5z',
  history: `${ring(12, 12, 8.5)} M12 7.5V12l3 2`,
  leaf: 'M12 21.5V10 M12 14.5C5.5 12 5 6 12 2.5 19 6 18.5 12 12 14.5z',
  inbox: 'M4 13l2.5-8h11L20 13v6H4v-6z M4 13h5l1 2h4l1-2h5',
  manage: `M4 7h9 M19 7h1 M4 17h3 M13 17h7 ${ring(16, 7, 2.3)} ${ring(10, 17, 2.3)}`,
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z',
  signout: 'M10 4.5H5.5v15H10 M14 8l4 4-4 4 M18 12H9.5',
  plus: 'M12 5.5v13 M5.5 12h13',
  minus: 'M5.5 12h13',
  fit: 'M4.5 9V4.5H9 M15 4.5h4.5V9 M19.5 15v4.5H15 M9 19.5H4.5V15',
  play: 'M8 5.5l10.5 6.5L8 18.5z',
  pause: 'M8.5 5.5v13 M15.5 5.5v13',
  today: 'M4.5 12a7.5 7.5 0 1 0 2.4-5.5 M4.5 4.5v4h4',
  keys: 'M3.5 7.5h17v9h-17z M7 10.5h.01 M10.3 10.5h.01 M13.6 10.5h.01 M17 10.5h.01 M7.5 13.5h9',
};

/* A small line icon by name. Built from fixed paths. */
export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon icon-${name}`);
  svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'path')).setAttribute('d', ICONS[name]);
  return svg;
}

/* ---------- Popovers: small panels that open from a button and close on Escape or a tap elsewhere ---------- */

const closing = new WeakMap();

export function showPopover(panel) {
  clearTimeout(closing.get(panel));
  panel.hidden = false;
  void panel.offsetWidth;
  panel.classList.add('open');
}

export function hidePopover(panel) {
  if (panel.hidden) return;
  panel.classList.remove('open');
  closing.set(panel, setTimeout(() => { panel.hidden = true; }, 160));
}

/* Arrow keys move through a list of buttons, Home and End jump to its ends. Returns true if the key was used. */
export function arrowThrough(event, buttons) {
  const moves = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
  const at = buttons.indexOf(document.activeElement);
  let next = null;
  if (event.key in moves) next = buttons[(at + moves[event.key] + buttons.length) % buttons.length];
  else if (event.key === 'Home') next = buttons[0];
  else if (event.key === 'End') next = buttons[buttons.length - 1];
  if (!next) return false;
  event.preventDefault();
  next.focus();
  return true;
}
