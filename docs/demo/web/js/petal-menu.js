/*
 * The petal menu: a ring of actions that opens around a leaf.
 *
 * It opens on a long press, a right click, or the menu key. On touch it works
 * as a marking menu: keep the finger down, slide to a petal, let go. Once
 * learned that takes a quarter of a second and no looking. It also works as
 * tap to open, tap to choose, and with the arrow keys.
 */

import { arrowThrough, h, icon } from './dom.js';

const RADIUS = 92;        // from the leaf to the middle of each petal
const REACH = 40;         // how close a sliding finger must be to a petal to choose it
const ROOM = { side: 138, above: 162, below: 164 };   // what the ring and its captions need around the leaf

export class PetalMenu {
  constructor() {
    this.items = [];
    this.buttons = [];
    this.el = h('div', { class: 'petal-menu', hidden: true, role: 'menu', onpointerdown: (e) => { if (e.target === this.el) this.close(); } });
    document.body.append(this.el);
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); this.close(); } else arrowThrough(e, this.buttons);
    });
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('resize', () => this.close());
  }

  get isOpen() { return this.el.classList.contains('open'); }

  /*
   * items: [{ label, icon, action }], drawn clockwise from the top.
   * `focus` moves the keyboard into the ring, for when the keyboard opened it.
   */
  open({ x, y, title, items, focus = false }) {
    clearTimeout(this.closing);
    this.items = items;
    this.returnTo = focus ? document.activeElement : null;
    // Keep the whole ring, and its captions, on the screen
    const side = Math.min(ROOM.side, innerWidth / 2);
    const cx = Math.max(side, Math.min(innerWidth - side, x));
    const cy = Math.max(ROOM.above, Math.min(innerHeight - ROOM.below, y));
    this.el.style.setProperty('--x', `${cx}px`);
    this.el.style.setProperty('--y', `${cy}px`);
    this.el.setAttribute('aria-label', `Actions for ${title}`);

    this.buttons = items.map((item, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / items.length;
      const dx = Math.cos(angle) * RADIUS, dy = Math.sin(angle) * RADIUS;
      const button = h('button', {
        type: 'button', class: 'petal-item', role: 'menuitem',
        style: `--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;--i:${index}`,
        onclick: () => this.choose(index),
      }, icon(item.icon), h('span', { text: item.label }));
      button.at = { x: cx + dx, y: cy + dy };
      return button;
    });
    this.el.replaceChildren(...this.buttons);
    this.el.hidden = false;
    void this.el.offsetWidth;
    this.el.classList.add('open');
    if (focus) this.buttons[0]?.focus();
  }

  /* The petal under a sliding finger, if any. */
  near(x, y) {
    return this.buttons.findIndex((button) => Math.hypot(x - button.at.x, y - button.at.y) < REACH);
  }

  /* The finger that opened the menu is still down and has moved. */
  move(x, y) {
    const hot = this.near(x, y);
    if (hot === this.hot) return;
    this.hot = hot;
    this.buttons.forEach((button, index) => button.classList.toggle('hot', index === hot));
    if (hot >= 0) navigator.vibrate?.(5);
  }

  /* That finger lifted. On a petal, it chooses. Anywhere else the menu stays open for a tap. */
  release(x, y) {
    const hot = this.near(x, y);
    if (hot >= 0) this.choose(hot);
  }

  choose(index) {
    const item = this.items[index];
    this.close();
    item.action();
  }

  close() {
    if (!this.isOpen) return;
    this.hot = -1;
    this.el.classList.remove('open');
    this.closing = setTimeout(() => { this.el.hidden = true; }, 180);
    if (this.returnTo?.isConnected) this.returnTo.focus({ preventScroll: true });
  }
}
