/*
 * The living tree.
 *
 * Draws a family as a tree that grows: roots first, then trunk, branches and
 * leaves. It is given the tree as the server allows this viewer to see it, and
 * redraws whenever that changes: new people grow in, everyone else moves to
 * make room.
 *
 * The drawing itself is the design approved in docs/design. What is new here
 * is that the family is live data, and that a leaf can be edited.
 */

const NS = 'http://www.w3.org/2000/svg';
const SPREAD = (92 * Math.PI) / 180;
const RADII = [0, 185, 355, 520, 680];
const RADIUS_STEP = 150;                 // each generation beyond the fifth
const TRUNK = 160;
const NAME_SIZE = 23;
const YEARS_SIZE = 16;
const BRANCH_BASE = 3.3;
const ROOT_SEED = 0.1;                   // the reach of the first root, before any trunk
const ROOT_EASE = 1.6;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3.2;
const THIS_YEAR = new Date().getFullYear();

/* Leaf shapes. Stem at 0,0, tip pointing up. People who marry in bring their own. */
const SHAPES = {
  beech: {
    d: 'M0,-8 C-18,-18 -20,-44 0,-64 C20,-44 18,-18 0,-8 Z',
    v: 'M0,-8 L0,-58 M0,-18 L-10,-27 M0,-18 L10,-27 M0,-28 L-12,-38 M0,-28 L12,-38 M0,-38 L-10,-47 M0,-38 L10,-47 M0,-48 L-6,-55 M0,-48 L6,-55',
  },
  olive: {
    d: 'M0,-8 C-10,-20 -11,-46 0,-66 C11,-46 10,-20 0,-8 Z',
    v: 'M0,-8 L0,-60 M0,-24 L-5,-31 M0,-24 L5,-31 M0,-38 L-5,-45 M0,-38 L5,-45',
  },
  ginkgo: {
    d: 'M0,-12 C-8,-18 -28,-28 -31,-44 C-24,-56 -9,-58 -2,-50 L0,-45 L2,-50 C9,-58 24,-56 31,-44 C28,-28 8,-18 0,-12 Z',
    v: 'M0,-12 L-23,-45 M0,-12 L-13,-52 M0,-12 L0,-44 M0,-12 L13,-52 M0,-12 L23,-45',
  },
  linden: {
    d: 'M0,-8 C-10,-6 -26,-16 -24,-36 C-22,-52 -8,-56 0,-66 C8,-56 22,-52 24,-36 C26,-16 10,-6 0,-8 Z',
    v: 'M0,-8 L0,-60 M0,-20 L-14,-30 M0,-20 L14,-30 M0,-32 L-13,-43 M0,-32 L13,-43 M0,-44 L-8,-52 M0,-44 L8,-52',
  },
};
const GRAFT_SHAPES = ['olive', 'ginkgo', 'linden'];
const RELATIONS = ['child', 'partner', 'parent', 'sibling'];

/* ---------- Small helpers ---------- */

function el(name, attrs, parent) {
  const node = document.createElementNS(NS, name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (parent) parent.appendChild(node);
  return node;
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const rnd = (id, salt) => hash(`${id}|${salt}`);

function norm(v) {
  const length = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / length, y: v.y / length };
}

function bez(b, t) {
  const u = 1 - t;
  return {
    x: u * u * u * b[0].x + 3 * u * u * t * b[1].x + 3 * u * t * t * b[2].x + t * t * t * b[3].x,
    y: u * u * u * b[0].y + 3 * u * u * t * b[1].y + 3 * u * t * t * b[2].y + t * t * t * b[3].y,
  };
}

function bezTangent(b, t) {
  const u = 1 - t;
  return norm({
    x: 3 * u * u * (b[1].x - b[0].x) + 6 * u * t * (b[2].x - b[1].x) + 3 * t * t * (b[3].x - b[2].x),
    y: 3 * u * u * (b[1].y - b[0].y) + 6 * u * t * (b[2].y - b[1].y) + 3 * t * t * (b[3].y - b[2].y),
  });
}

/* A small, fast, repeatable noise for the pen-drawn edge of a branch */
function grain(seed, i) {
  let n = (seed + Math.imul(i, 374761393)) | 0;
  n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
  n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}
function edgeNoise(seed, x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const a = grain(seed, i), b = grain(seed, i + 1);
  return (a + (b - a) * u) * 2 - 1;
}
const inkFor = (id, length, amount = 1) => ({ seed: Math.floor(hash(id) * 2147483647), length, amount });

/*
 * A filled, tapered outline of the first `t` of a curve, with a pointed growing
 * tip and a slightly uneven, pen-drawn edge that is part of the shape itself.
 * A finished branch ends square so it meets the next one without a notch.
 * This runs for every growing branch on every frame, so it is written plainly.
 */
function outline(b, widthAt, t, ink, squareEnd) {
  if (t <= 0.002) return '';
  const N = Math.max(6, Math.min(34, Math.ceil((ink.length * t) / 9)));
  const x0 = b[0].x, y0 = b[0].y, x1 = b[1].x, y1 = b[1].y, x2 = b[2].x, y2 = b[2].y, x3 = b[3].x, y3 = b[3].y;
  const tipLen = Math.min(t, 0.25) * (1 - Math.max(0, (t - 0.8) / 0.2)) + 1e-4;
  const pointed = !(squareEnd && t >= 1);
  let left = '', right = '';
  for (let i = 0; i <= N; i++) {
    const s = (t * i) / N, u = 1 - s;
    const c0 = u * u * u, c1 = 3 * u * u * s, c2 = 3 * u * s * s, c3 = s * s * s;
    const px = c0 * x0 + c1 * x1 + c2 * x2 + c3 * x3;
    const py = c0 * y0 + c1 * y1 + c2 * y2 + c3 * y3;
    let tx = 3 * u * u * (x1 - x0) + 6 * u * s * (x2 - x1) + 3 * s * s * (x3 - x2);
    let ty = 3 * u * u * (y1 - y0) + 6 * u * s * (y2 - y1) + 3 * s * s * (y3 - y2);
    const tl = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= tl; ty /= tl;
    let w = widthAt(s) / 2;
    const k = pointed ? (t - s) / tipLen : 1;
    if (k < 1) w *= Math.sqrt(k > 0 ? k : 0);
    const rough = Math.min(1.5, 0.3 + w * 0.16) * (k < 1 ? (k > 0 ? k : 0) : 1) * ink.amount;
    const along = (s * ink.length) / 22;
    const wl = w + edgeNoise(ink.seed, along) * rough;
    const wr = w + edgeNoise(ink.seed + 7717, along) * rough;
    left += `${i ? 'L' : 'M'}${Math.round((px - ty * wl) * 10) / 10},${Math.round((py + tx * wl) * 10) / 10}`;
    right = `L${Math.round((px + ty * wr) * 10) / 10},${Math.round((py - tx * wr) * 10) / 10}${right}`;
  }
  return `${left}${right}Z`;
}

const easeOut = (t) => 1 - Math.pow(1 - t, 2.2);
const radiusOf = (depth) => RADII[depth] ?? RADII[RADII.length - 1] + (depth - RADII.length + 1) * RADIUS_STEP;
const branchWidth = (count) => BRANCH_BASE * Math.sqrt(count);

function leafMarkup(shape, depth, goldIndex) {
  return '<circle class="glow cool" cx="0" cy="-36" r="46" fill="url(#leafGlow)"/>' +
    '<circle class="glow warm" cx="0" cy="-36" r="46" fill="url(#warmGlow)"/>' +
    '<circle class="you-ring" cx="0" cy="-36" r="40"/>' +
    '<circle class="tint-ring" cx="0" cy="-36" r="34"/>' +
    '<circle class="pulse" cx="0" cy="-36" r="30"/>' +
    '<path class="stem" d="M0,0 L0,-12"/>' +
    `<path class="hatch" d="${shape.d}" fill="url(#hatch)"/>` +
    `<path class="blade g${Math.min(depth, 4)} au${goldIndex}" d="${shape.d}"/>` +
    `<path class="wash" d="${shape.d}" fill="url(#wash)"/>` +
    `<path class="vein" d="${shape.v}"/>`;
}

const BLOSSOM = Array.from({ length: 5 }, (_, i) => `<ellipse class="petal" cx="0" cy="-6.5" rx="3.6" ry="5.6" transform="rotate(${i * 72})"/>`).join('') +
  '<circle class="blossom-heart" r="2.4"/>';

/* A leaf for the card's portrait, drawn exactly as on the tree. Built from fixed markup only, never from anything a person typed. */
export function leafPortrait(person) {
  return `<svg viewBox="-36 -72 72 76" aria-hidden="true"><g class="leaf-node on state-${stateOf(person, THIS_YEAR)}">${leafMarkup(SHAPES.beech, 2, person.id.length % 3)}</g></svg>`;
}

function stateOf(person, year) {
  if (person.masked) return 'masked';
  if (person.pending) return 'pending';
  if (!person.given) return 'ghost';
  if (person.died ? person.died <= year : person.gone) return 'gone';
  return 'living';
}

/* ---------- The view ---------- */

export class TreeView {
  /*
   * on: {
   *   select(person | null)            a leaf was tapped, or the open ground
   *   add({ person, relation })        a + bud was tapped or pulled out
   *   hold({ person, x, y, keyboard }) a leaf was long-pressed, right-clicked, or its menu key pressed
   *   holdMove(x, y), holdEnd(x, y)    where the finger that is still down went, and where it lifted
   *   moved()                          the camera moved
   * }
   */
  constructor({ stage, world, svg, on }) {
    Object.assign(this, { stage, world, svg, on });
    this.still = /(?:^|[#&])still(?:&|$)/.test(location.hash) || matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.classList.toggle('still', this.still);

    this.year = THIS_YEAR;
    this.editing = false;
    this.selectedId = null;
    this.hoverId = null;
    this.collapsed = new Set();
    this.nodes = [];
    this.leaves = [];
    this.leafOf = new Map();            // person id -> their main leaf
    this.trunk = { p: 0, ink: inkFor('trunk', TRUNK) };
    this.shift = 1;                     // 0 to 1 while everyone moves to make room after a change
    this.rootReach = 0;
    this.bounds = { x0: -900, x1: 900, y0: -820, y1: TRUNK + 150 };
    this.cam = { x: 0, y: 0, k: 1 };
    this.userMoved = false;
    this.fitted = false;
    this.cameraRun = 0;
    this.sharpAt = 0;
    this.velocity = { x: 0, y: 0 };
    this.pointers = new Map();
    this.stageBox = stage.getBoundingClientRect();
    this.insets = { right: 0, top: 0 }; // space taken by an open side panel and a banner, kept clear when fitting
    this.wasOn = new Set();             // leaves that were showing before the last change, so they do not unfurl again
    this.freshIds = new Set();          // people who have just arrived
    this.matches = null;                // people a search is pointing at
    this.route = null;                  // two people whose connection is lit

    this.layer = {};
    for (const name of ['back', 'roots', 'branches', 'blossoms', 'leaves', 'fallen', 'labels', 'handles']) {
      this.layer[name] = el('g', { class: `layer-${name}` }, svg);
    }
    this.trunkPath = el('path', { class: 'branch trunk' }, this.layer.branches);
    this.twig = el('path', { class: 'twig' }, this.layer.handles);
    this.twigTip = el('g', { class: 'twig-tip' }, this.layer.handles);
    this.twigTip.innerHTML = `<path class="twig-leaf" d="${SHAPES.beech.d}" transform="scale(0.6)"/><text class="handle-label" text-anchor="middle" y="26"></text>`;
    this.buildRoots();
    this.listen();
    this.gustSoon(5200);
    new ResizeObserver(() => { if (!this.userMoved) this.fit(); }).observe(stage);
  }

  /* ---------- Data ---------- */

  /* The tree as the server sent it. `viewerId` is the leaf of the person signed in. */
  setData(tree, { viewerId = null, focusId = null } = {}) {
    const people = new Map(tree.people.map((p) => [p.id, p]));
    const before = new Map(this.nodes.map((n) => [n.id, n]));
    const known = new Set(this.people?.keys() ?? []);
    const oldLeaves = this.leaves;
    const firstTime = !this.nodes.length;
    this.viewerId = viewerId;
    this.people = people;
    this.unions = tree.unions;

    const rootId = this.topOf(focusId && people.has(focusId) ? focusId : tree.rootId);
    this.nodes = rootId ? this.buildNodes(rootId) : [];
    this.layout();

    this.wasOn = new Set(oldLeaves.filter((leaf) => leaf.on).map((leaf) => `${leaf.person.id}@${leaf.node.id}`));
    const inkedFrom = new Set();
    let moved = false;
    for (const n of this.nodes) {
      let old = before.get(n.id);
      // Someone who was only pencilled in and is now approved takes the pencil leaf's place and turns to ink
      n.inked = false;
      if (!old && !n.person.pending && n.parent) {
        old = [...before.values()].find((o) => o.person.pending && o.parent?.id === n.parent.id && o.person.given === n.person.given);
        if (old) {
          n.inked = true;
          inkedFrom.add(old.id);
          if (old.leaves[0].on) this.wasOn.add(`${n.id}@${n.id}`);
        }
      }
      n.p = old ? old.p : 0;
      n.fx = old ? old.x : n.tx;
      n.fy = old ? old.y : n.ty;
      n.ftheta = old ? old.theta : n.ttheta;
      n.blossomOn = Boolean(old?.blossomEl?.classList.contains('on'));
      if (old && Math.hypot(n.fx - n.tx, n.fy - n.ty) > 1) moved = true;
    }

    // One or two changes are shown as they happen: a new leaf glints, a removed one drifts down.
    // A wholesale change, such as signing in, is not a moment for either.
    const arrived = [...people.keys()].filter((id) => !known.has(id) && !people.get(id).masked);
    const left = oldLeaves.filter((leaf) => leaf.on && !people.has(leaf.person.id) && !inkedFrom.has(leaf.person.id) && !leaf.person.masked);
    const quiet = firstTime || this.still;
    this.freshIds = new Set(!quiet && arrived.length <= 8 ? arrived.filter((id) => !this.nodes.find((n) => n.id === id)?.inked) : []);
    if (!quiet && left.length <= 6) this.dropLeaves(left);

    this.shift = moved && !this.still ? 0 : 1;
    this.shiftStart = performance.now();
    this.pose(this.shift);
    this.rebuild();
    this.measure();
    if (firstTime || !this.userMoved) this.fit(false, !firstTime);
    else this.paintCamera();
    if (this.selectedId && !this.leafOf.has(this.selectedId)) this.setSelected(null);
    this.refreshLit();
    this.kick();
  }

  /* Leaves that are no longer on the tree let go and drift down. A pencilled leaf that was withdrawn is rubbed out. */
  dropLeaves(leaves) {
    for (const leaf of leaves) {
      const wrap = el('g', { class: leaf.person.pending ? 'erased' : 'falling' }, this.layer.fallen);
      const copy = leaf.el.cloneNode(true);
      copy.removeAttribute('tabindex');
      wrap.appendChild(copy);
      setTimeout(() => wrap.remove(), 1300);
    }
  }

  /* Give an element a class for a moment, for an effect that plays once. */
  flash(element, name, ms) {
    if (this.still) return;
    element.classList.add(name);
    setTimeout(() => element.classList.remove(name), ms);
  }

  /* The top of someone's family: up through their birth family's host until nobody is recorded. */
  topOf(personId) {
    const seen = new Set();
    let current = personId;
    while (current && !seen.has(current)) {
      seen.add(current);
      const born = this.unions.find((u) => u.children.some((c) => c.id === current));
      if (!born) break;
      current = born.host ?? born.partners[0];
    }
    return current;
  }

  /* The family as a tree of descendants: each person once, partners beside them. */
  buildNodes(rootId) {
    const list = [];
    const seen = new Set();
    const bornOf = (id) => this.people.get(id)?.born ?? Infinity;
    const grow = (personId, depth, parent) => {
      seen.add(personId);
      const node = { id: personId, person: this.people.get(personId), depth, parent, partners: [], children: [] };
      list.push(node);
      const unions = this.unions.filter((u) => u.partners.includes(personId))
        .sort((a, b) => (a.since ?? bornOf(a.children[0]?.id)) - (b.since ?? bornOf(b.children[0]?.id)));
      for (const union of unions) {
        const partnerId = union.partners.find((id) => id !== personId);
        if (partnerId && this.people.has(partnerId)) node.partners.push({ person: this.people.get(partnerId), union });
        const kids = union.children.map((c) => c.id).filter((id) => this.people.has(id) && !seen.has(id))
          .sort((a, b) => bornOf(a) - bornOf(b) || (a < b ? -1 : 1));
        for (const kid of kids) if (!seen.has(kid)) node.children.push(grow(kid, depth + 1, node));
      }
      node.unionId = unions[0]?.id ?? null;
      return node;
    };
    grow(rootId, 0, null);
    return list;
  }

  /* Generations on arcs, the order of the family as the angle. Sets where each node is heading. */
  layout() {
    if (!this.nodes.length) return;
    const maxDepth = Math.max(4, ...this.nodes.map((n) => n.depth));
    const weigh = (n) => {
      let kids = 0;
      n.count = 1 + n.partners.length;
      for (const child of n.children) {
        weigh(child);
        kids += child.weight;
        n.count += child.count;
      }
      const own = (maxDepth / Math.max(n.depth, 1.5)) * (1 + 0.5 * n.partners.length);
      n.weight = Math.max(own, kids);
    };
    const place = (n, a0, a1) => {
      const kids = n.children;
      if (kids.length) {
        const sum = kids.reduce((s, c) => s + c.weight, 0);
        const span = ((a1 - a0) * sum) / n.weight;
        let cursor = (a0 + a1) / 2 - span / 2;
        for (const child of kids) {
          const width = (span * child.weight) / sum;
          place(child, cursor, cursor + width);
          cursor += width;
        }
        n.ttheta = (kids[0].ttheta + kids[kids.length - 1].ttheta) / 2;
      } else {
        n.ttheta = (a0 + a1) / 2;
      }
      if (n.depth > 0) n.ttheta += (rnd(n.id, 't') - 0.5) * 0.035;
      const r = radiusOf(n.depth) + (n.depth ? (rnd(n.id, 'r') - 0.5) * 30 : 0);
      n.tx = r * Math.sin(n.ttheta);
      n.ty = -r * Math.cos(n.ttheta);
    };
    weigh(this.nodes[0]);
    place(this.nodes[0], -SPREAD, SPREAD);
  }

  /* Put everyone `e` of the way from where they were to where they are going, and shape the branches. */
  pose(e) {
    for (const n of this.nodes) {
      n.x = n.fx + (n.tx - n.fx) * e;
      n.y = n.fy + (n.ty - n.fy) * e;
      n.theta = n.ftheta + (n.ttheta - n.ftheta) * e;
      if (!n.parent) {
        n.dir = { x: 0, y: -1 };
        continue;
      }
      const p = n.parent;
      const P0 = { x: p.x, y: p.y }, P3 = { x: n.x, y: n.y };
      const length = Math.hypot(P3.x - P0.x, P3.y - P0.y) || 1;
      const chord = { x: (P3.x - P0.x) / length, y: (P3.y - P0.y) / length };
      const radial = { x: Math.sin(n.theta), y: -Math.cos(n.theta) };
      const dIn = norm({ x: p.dir.x * 0.65 + chord.x * 0.35, y: p.dir.y * 0.65 + chord.y * 0.35 });
      const dOut = norm({ x: radial.x * 0.6 + chord.x * 0.4, y: radial.y * 0.6 + chord.y * 0.4 });
      const side = { x: -chord.y, y: chord.x };
      const wobA = (rnd(n.id, 'a') - 0.5) * length * 0.16, wobB = (rnd(n.id, 'b') - 0.5) * length * 0.16;
      const P1 = { x: P0.x + dIn.x * length * 0.4 + side.x * wobA, y: P0.y + dIn.y * length * 0.4 + side.y * wobA };
      const P2 = { x: P3.x - dOut.x * length * 0.36 + side.x * wobB, y: P3.y - dOut.y * length * 0.36 + side.y * wobB };
      n.bz = [P0, P1, P2, P3];
      n.dir = norm({ x: P3.x - P2.x, y: P3.y - P2.y });
      n.w0 = branchWidth(n.count);
      n.w1 = n.children.length ? n.w0 * 0.8 : 2;
      n.duration = Math.max(320, Math.min(700, (480 * length) / 200));
      n.ink = n.ink ?? inkFor(n.id, 1);
      n.ink.length = length * 1.08;
    }
  }

  /* ---------- Drawing ---------- */

  /* Throw away the leaves, branches and names and draw them again for the new family. */
  rebuild() {
    for (const name of ['blossoms', 'leaves', 'labels']) this.layer[name].replaceChildren();
    for (const path of [...this.layer.branches.children]) if (path !== this.trunkPath) path.remove();
    this.leaves = [];
    this.leafOf = new Map();

    for (const n of this.nodes) {
      if (n.parent) n.pathEl = el('path', { class: 'branch' }, this.layer.branches);
      const offsets = n.partners.length ? [-0.66, ...n.partners.map((_, i) => 0.66 + i * 0.6)]
        : n.children.length ? [rnd(n.id, 's') > 0.5 ? 0.7 : -0.7] : [0];
      n.leaves = [this.makeLeaf(n.person, n, offsets[0], false)];
      n.partners.forEach((partner, i) => n.leaves.push(this.makeLeaf(partner.person, n, offsets[i + 1], true)));
      if (n.partners.length) {
        n.blossomEl = el('g', { class: `blossom${n.blossomOn ? ' on' : ''}` }, this.layer.blossoms);
        n.blossomEl.innerHTML = `<g class="unfurl">${BLOSSOM}</g>`;
      }
      if (n.children.length) {
        n.budEl = el('g', { class: 'bud', 'data-node': n.id, tabindex: '-1', role: 'button', 'aria-label': 'Show this branch' }, this.layer.leaves);
        n.budEl.innerHTML = '<g class="unfurl"><circle class="bud-shape" r="18"/><text class="bud-count" text-anchor="middle" y="5.5"></text></g>';
      }
    }
    this.placeElements();
    if (this.shift >= 1) this.placeLabels();
    this.drawTrunk();
    for (const n of this.nodes) if (n.parent) this.drawBranch(n);
    this.svg.classList.toggle('editing', this.editing);
    this.drawHandles();
    // Whoever was chosen stays chosen, without the ripple of being chosen again
    this.leafOf.get(this.selectedId)?.el.classList.add('selected', 'kept');
    this.setTabStop();
    if (this.tints) this.setTints(this.tints);
    if (this.matches) this.setMatches(this.matches);
    this.paintRoute();
    for (const leaf of this.leaves) if (leaf.inked) this.flash(leaf.el, 'inked', 1600);
  }

  makeLeaf(person, node, offset, isPartner) {
    const scale = person.born >= THIS_YEAR - 5 ? 0.58 : person.born >= THIS_YEAR - 18 ? 0.8 : 1;
    const shape = SHAPES[isPartner ? GRAFT_SHAPES[Math.floor(hash(person.birthName || person.id) * GRAFT_SHAPES.length)] : 'beech'];
    // A leaf that was already showing is drawn showing, in its right colour, so nothing unfurls or changes colour twice
    const on = this.wasOn.has(`${person.id}@${node.id}`);
    const state = stateOf(person, this.year);
    const group = el('g', { class: `leaf-node state-${state}${on ? ' on' : ''}`, 'data-id': person.id, tabindex: '-1', role: 'button' }, this.layer.leaves);
    const gustDelay = (node.tx / radiusOf(4) + 1) * 0.6 + rnd(person.id, 'd') * 0.25;
    group.innerHTML = `<g class="unfurl"><g class="sway" style="--dl:${gustDelay.toFixed(2)}s">${leafMarkup(shape, node.depth, person.id.length % 3)}<path class="hit" d="${shape.d}"/></g></g>`;
    group.classList.toggle('you', person.id === this.viewerId);
    group.classList.toggle('outside', person.editing !== 'apply');
    const leaf = { person, node, offset, scale, isPartner, el: group, on, state, fresh: this.freshIds.has(person.id), inked: !isPartner && node.inked };
    this.leaves.push(leaf);
    if (!isPartner || !this.leafOf.has(person.id)) this.leafOf.set(person.id, leaf);
    return leaf;
  }

  /* The tree is one stop for the Tab key. Arrow keys travel from there along the family. */
  setTabStop(personId = this.selectedId ?? this.viewerId) {
    const stop = this.leafOf.get(personId) ?? this.nodes[0]?.leaves[0];
    for (const leaf of this.leaves) leaf.el.setAttribute('tabindex', leaf === stop ? '0' : '-1');
  }

  /* Put the keyboard on the tree, on the leaf the Tab key would reach. */
  focus() {
    this.svg.querySelector('.leaf-node[tabindex="0"]')?.focus({ preventScroll: true });
  }

  /* The relative an arrow key leads to: Up to a child, Down to a parent, sideways along partners and siblings. */
  neighbour(leaf, key) {
    const n = leaf.node, showing = (candidate) => (candidate?.on ? candidate : null);
    if (key === 'ArrowDown') return showing(n.parent?.leaves[0]);
    if (key === 'ArrowUp') return n.children.map((child) => child.leaves[0]).find((candidate) => candidate.on) ?? null;
    const step = key === 'ArrowRight' ? 1 : -1;
    const beside = showing(n.leaves[n.leaves.indexOf(leaf) + step]);
    if (beside) return beside;
    const siblings = n.parent?.children ?? [];
    for (let i = siblings.indexOf(n) + step; siblings[i]; i += step) {
      const group = siblings[i].leaves.filter((candidate) => candidate.on);
      if (group.length) return step > 0 ? group[0] : group[group.length - 1];
    }
    return null;
  }

  /* Move every leaf, blossom and bud to where its node is now. */
  placeElements() {
    for (const n of this.nodes) {
      const base = Math.atan2(n.dir.x, -n.dir.y);
      for (const leaf of n.leaves) {
        leaf.angle = base + leaf.offset;
        leaf.el.setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)}) rotate(${((leaf.angle * 180) / Math.PI).toFixed(1)}) scale(${leaf.scale})`);
      }
      if (n.blossomEl) n.blossomEl.setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`);
      if (n.budEl) n.budEl.setAttribute('transform', `translate(${(n.x + n.dir.x * 86).toFixed(1)} ${(n.y + n.dir.y * 86).toFixed(1)})`);
    }
  }

  /* Each name tries a few spots around its leaf and takes the one that overlaps the least. */
  placeLabels() {
    this.layer.labels.replaceChildren();
    const blobs = this.leaves.map((leaf) => ({
      leaf, x: leaf.node.x + Math.sin(leaf.angle) * 38 * leaf.scale, y: leaf.node.y - Math.cos(leaf.angle) * 38 * leaf.scale, r: 25 * leaf.scale,
    }));
    const placed = [];
    const boxAt = (x, y, ox, oy, width) => {
      const box = { x, y };
      if (Math.abs(ox) >= 0.38) {
        box.anchor = ox > 0 ? 'start' : 'end';
        box.x += ox > 0 ? 3 : -3;
        box.nameDy = NAME_SIZE * 0.15;
        box.yearsDy = box.nameDy + YEARS_SIZE + 3;
      } else if (oy < 0) {
        box.anchor = 'middle';
        box.yearsDy = -2;
        box.nameDy = -2 - YEARS_SIZE - 3;
      } else {
        box.anchor = 'middle';
        box.nameDy = NAME_SIZE;
        box.yearsDy = NAME_SIZE + YEARS_SIZE + 3;
      }
      box.left = box.anchor === 'start' ? box.x : box.anchor === 'end' ? box.x - width : box.x - width / 2;
      box.right = box.left + width;
      box.top = box.y + box.nameDy - NAME_SIZE * 0.8;
      box.bottom = box.y + box.yearsDy + 3;
      return box;
    };
    const costOf = (box, self) => {
      let cost = 0;
      for (const other of placed) {
        if (box.left < other.right + 4 && box.right > other.left - 4 && box.top < other.bottom + 2 && box.bottom > other.top - 2) cost += 3;
      }
      for (const blob of blobs) {
        if (blob.leaf === self) continue;
        const nx = Math.max(box.left, Math.min(blob.x, box.right)), ny = Math.max(box.top, Math.min(blob.y, box.bottom));
        if (Math.hypot(nx - blob.x, ny - blob.y) < blob.r) cost += 2;
      }
      return cost;
    };

    for (const leaf of [...this.leaves].sort((a, b) => b.node.depth - a.node.depth)) {
      leaf.labelEl = leaf.yearsEl = null;
      if (leaf.person.masked) continue;        // a private relative is an unnamed leaf
      const { node: n, scale: s } = leaf;
      const dx = Math.sin(leaf.angle), dy = -Math.cos(leaf.angle), px = -dy, py = dx;
      const name = this.nameOf(leaf.person);
      const width = Math.max(name.length * NAME_SIZE * 0.58, 9 * YEARS_SIZE * 0.5);
      const tip = 66 * s + 12, side = 28 * s + 10;
      const spots = [
        [dx * tip, dy * tip], [dx * 40 * s + px * side, dy * 40 * s + py * side], [dx * 40 * s - px * side, dy * 40 * s - py * side],
        [dx * (tip + 22), dy * (tip + 22)], [dx * 62 * s + px * side, dy * 62 * s + py * side], [dx * 62 * s - px * side, dy * 62 * s - py * side],
        [dx * 14 * s + px * (side + 8), dy * 14 * s + py * (side + 8)], [dx * 14 * s - px * (side + 8), dy * 14 * s - py * (side + 8)],
      ];
      let best = null, bestCost = Infinity;
      spots.forEach((spot, index) => {
        const length = Math.hypot(spot[0], spot[1]) || 1;
        const box = boxAt(n.x + spot[0], n.y + spot[1], spot[0] / length, spot[1] / length, width);
        const cost = costOf(box, leaf) + index * 0.1;
        if (cost < bestCost) { bestCost = cost; best = box; }
      });
      placed.push(best);
      leaf.labelEl = el('g', { class: 'label', transform: `translate(${best.x.toFixed(1)} ${best.y.toFixed(1)})` }, this.layer.labels);
      el('text', { class: 'name', 'text-anchor': best.anchor, y: best.nameDy.toFixed(1) }, leaf.labelEl).textContent = name;
      leaf.yearsEl = el('text', { class: 'years', 'text-anchor': best.anchor, y: best.yearsDy.toFixed(1) }, leaf.labelEl);
      leaf.yearsEl.textContent = leaf.yearsNow ?? '';
      leaf.labelEl.classList.toggle('on', leaf.on);
    }
    if (this.matches) this.setMatches(this.matches);
  }

  nameOf(person) {
    if (person.masked) return 'Living relative';
    return person.given || 'Unknown';
  }

  yearsOf(person) {
    if (person.masked) return '';
    if (person.pending) return person.pending.status === 'draft' ? 'draft' : 'suggested';
    if (!person.born) return '';
    return person.died && person.died <= this.year ? `${person.born}–${person.died}` : String(person.born);
  }

  trunkWidth(s) {
    const top = branchWidth(this.nodes[0]?.count ?? 1) * 0.95;
    return top + top * 1.5 * Math.pow(1 - s, 2.6);
  }

  drawTrunk() {
    const bz = [{ x: 0, y: TRUNK }, { x: 9, y: TRUNK * 0.66 }, { x: -7, y: TRUNK * 0.33 }, { x: 0, y: 0 }];
    this.trunkPath.setAttribute('d', outline(bz, (s) => this.trunkWidth(s), easeOut(this.trunk.p), this.trunk.ink, true));
  }

  drawBranch(n) {
    n.pathEl.setAttribute('d', outline(n.bz, (s) => n.w0 + (n.w1 - n.w0) * s, easeOut(n.p), n.ink, true));
  }

  /* ---------- Roots: a small tree of their own, growing in step with the crown ---------- */

  buildRoots() {
    this.roots = [];
    const add = (b, width, birth, span) => {
      if (birth > 0.95) return null;
      const root = {
        b, width, birth, span: Math.max(0.04, Math.min(span, 1 - birth)),
        ink: inkFor(`root${this.roots.length}`, Math.hypot(b[3].x - b[0].x, b[3].y - b[0].y) * 1.1, 0.7),
        el: el('path', { class: 'root' }, this.layer.roots),
      };
      this.roots.push(root);
      return root;
    };
    /* A root sets off along its heading (0 is straight down), wanders, and turns partway down by its tip. */
    const curve = (id, from, heading, length, sink) => {
      const d0 = { x: Math.sin(heading), y: Math.cos(heading) };
      const end = heading * (1 - sink);
      const d1 = { x: Math.sin(end), y: Math.cos(end) };
      const side = { x: d0.y, y: -d0.x };
      const deepest = TRUNK + 142;
      const tip = { x: from.x + d0.x * length * 0.55 + d1.x * length * 0.45, y: Math.min(deepest, from.y + d0.y * length * 0.55 + d1.y * length * 0.45) };
      const w1 = (rnd(id, 'w1') - 0.5) * length * 0.22, w2 = (rnd(id, 'w2') - 0.5) * length * 0.22;
      return [
        from,
        { x: from.x + d0.x * length * 0.33 + side.x * w1, y: from.y + d0.y * length * 0.33 + side.y * w1 },
        { x: tip.x - d1.x * length * 0.3 + side.x * w2, y: Math.min(deepest, tip.y - d1.y * length * 0.3 + side.y * w2) },
        tip,
      ];
    };
    /* A fork is born at the moment its parent's tip passes the fork point. */
    const fork = (parent, id, count, level) => {
      if (!parent) return;
      for (let f = 0; f < count; f++) {
        const fid = `${id}${level === 1 ? 'f' : 'h'}${f}`;
        const at = 0.28 + ((f + rnd(fid, 's')) / count) * 0.55;
        const from = bez(parent.b, at), along = bezTangent(parent.b, at);
        const turn = (f % 2 ? 1 : -1) * (rnd(fid, 'd') > 0.2 ? 1 : -1) * (0.5 + rnd(fid, 'u') * 0.6);
        const heading = Math.max(-1.45, Math.min(1.45, Math.atan2(along.x, along.y) + turn));
        const length = level === 1 ? 46 + rnd(fid, 'l') * 58 : 18 + rnd(fid, 'l') * 24;
        const widthHere = parent.width * Math.pow(1 - at, 0.8) + 0.9;
        const born = parent.birth + (1 - Math.pow(1 - at, 1 / ROOT_EASE)) * parent.span + 0.01;
        const made = add(curve(fid, from, heading, length, 0.45), Math.min(widthHere * 0.7, level === 1 ? 5 : 2.2), born, level === 1 ? 0.3 : 0.16);
        if (made && level === 1 && rnd(fid, 'h') > 0.35) fork(made, fid, 1 + (rnd(fid, 'g') > 0.6 ? 1 : 0), 2);
      }
    };
    const tap = add(curve('tap', { x: 0, y: TRUNK - 6 }, (rnd('tap', 'h') - 0.5) * 0.25, 128, 0.2), 15, 0, 0.6);
    for (let i = 0; i < 8; i++) {
      const id = `lat${i}`, sign = i % 2 ? 1 : -1, tier = Math.floor(i / 2);
      const heading = (sign * (82 - tier * 14 + (rnd(id, 'h') - 0.5) * 10) * Math.PI) / 180;
      const lateral = add(curve(id, { x: sign * (5 + tier * 2.5), y: TRUNK + 2 + tier * 3 }, heading, 215 - tier * 34 + rnd(id, 'l') * 40, 0.32 + rnd(id, 's') * 0.2), 12.5 - tier * 1.6, 0.02 + i * 0.042, 0.62);
      fork(lateral, id, 2 + (rnd(id, 'n') > 0.5 ? 1 : 0), 1);
    }
    fork(tap, 'tap', 3, 1);
  }

  drawRoots() {
    const girthStep = Math.round(this.rootReach * 50);
    for (const root of this.roots) {
      const p = Math.max(0, Math.min(1, (this.rootReach - root.birth) / root.span));
      const drawn = p <= 0 ? 'none' : p >= 1 ? `full:${girthStep}` : `${p}:${girthStep}`;
      if (root.drawn === drawn) continue;
      root.drawn = drawn;
      const t = 1 - Math.pow(1 - p, ROOT_EASE);
      const girth = 0.3 + 0.4 * p + (0.3 * girthStep) / 50;
      root.el.setAttribute('d', outline(root.b, (s) => (root.width * Math.pow(1 - s, 0.8) + 0.9) * girth, t, root.ink, false));
    }
  }

  /* ---------- What is showing ---------- */

  hiddenByCollapse(n) {
    for (let a = n.parent; a; a = a.parent) if (this.collapsed.has(a.id)) return true;
    return false;
  }

  nodeVisible(n) {
    if (this.hiddenByCollapse(n)) return false;
    const born = n.person.born;
    return born ? born <= this.year : !n.parent || this.nodeVisible(n.parent);
  }

  syncLeaf(leaf, on) {
    if (leaf.on !== on) {
      leaf.on = on;
      leaf.el.classList.toggle('on', on);
      leaf.labelEl?.classList.toggle('on', on);
      if (on && leaf.fresh) {
        leaf.fresh = false;
        this.flash(leaf.el, 'glint', 2800);
      }
    }
    const state = stateOf(leaf.person, this.year);
    if (leaf.state !== state) {
      if (leaf.state) leaf.el.classList.remove(`state-${leaf.state}`);
      leaf.el.classList.add(`state-${state}`);
      leaf.state = state;
    }
    const years = this.yearsOf(leaf.person);
    if (leaf.yearsNow !== years) {
      leaf.yearsNow = years;
      if (leaf.yearsEl) leaf.yearsEl.textContent = years;
      leaf.el.setAttribute('aria-label', `${this.nameOf(leaf.person)}${years ? `, ${years}` : ''}`);
    }
  }

  syncNode(n, arrived) {
    const on = arrived && this.nodeVisible(n);
    this.syncLeaf(n.leaves[0], on);
    n.partners.forEach((partner, i) => {
      const since = partner.union.since ?? partner.person.born;
      this.syncLeaf(n.leaves[i + 1], on && (!since || since <= this.year));
    });
    if (n.blossomEl) n.blossomEl.classList.toggle('on', n.leaves.slice(1).some((leaf) => leaf.on));
    if (n.budEl) {
      const waiting = this.collapsed.has(n.id) ? n.children.filter((c) => !c.person.born || c.person.born <= this.year).length : 0;
      n.budEl.classList.toggle('on', on && waiting > 0);
      if (n.budWaiting !== waiting) {
        n.budWaiting = waiting;
        n.budEl.querySelector('.bud-count').textContent = `+${waiting}`;
      }
    }
  }

  /* ---------- The growth loop: first load, the year slider, a new person, opening a bud ---------- */

  kick() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame((now) => this.frame(now));
  }

  frame(now) {
    const dt = Math.min(50, now - this.last);
    this.last = now;
    let active = false;

    // Everyone moving to make room for a change
    if (this.shift < 1) {
      this.shift = Math.min(1, (now - this.shiftStart) / 650);
      const e = this.shift < 0.5 ? 4 * this.shift ** 3 : 1 - Math.pow(-2 * this.shift + 2, 3) / 2;
      this.pose(e);
      this.placeElements();
      for (const n of this.nodes) if (n.parent && n.p > 0) this.drawBranch(n);
      if (this.shift >= 1) {
        this.placeLabels();
        this.drawHandles();
      }
      active = true;
    }

    // The first root goes down before the trunk comes up
    const sprouted = this.still || this.rootReach >= ROOT_SEED * 0.85;
    if (this.trunk.p < 1 && this.nodes.length) {
      if (sprouted) {
        this.trunk.p = this.still ? 1 : Math.min(1, this.trunk.p + dt / 760);
        this.drawTrunk();
      }
      active = true;
    }
    let grown = this.trunk.p;

    for (const n of this.nodes) {
      if (!n.parent) {
        this.syncNode(n, this.trunk.p >= 1);
        continue;
      }
      const want = this.nodeVisible(n);
      const parentP = n.parent.parent ? n.parent.p : this.trunk.p;
      const before = n.p;
      if (want && n.p < 1 && parentP >= 1) {
        n.p = this.still ? 1 : Math.min(1, n.p + dt / n.duration);
      } else if (!want && n.p > 0 && n.children.every((child) => child.p <= 0)) {
        n.p = this.still ? 0 : Math.max(0, n.p - dt / (n.duration * 0.6));
      }
      if (n.p !== before) {
        this.drawBranch(n);
        active = true;
      } else if ((want && n.p < 1) || (!want && n.p > 0)) {
        active = true;
      }
      grown += n.p;
      this.syncNode(n, n.p >= 1);
    }

    // The roots grow in step with everything above ground, a little ahead of it
    const reach = this.nodes.length ? ROOT_SEED + (1 - ROOT_SEED) * Math.pow(grown / this.nodes.length, 0.6) : 0;
    const gap = reach - this.rootReach;
    let rootsMoving = false;
    if (Math.abs(gap) > 0.0008) {
      this.rootReach = this.still ? reach : this.rootReach + gap * (1 - Math.exp(-dt / 280));
      rootsMoving = true;
    } else {
      this.rootReach = reach;
    }
    this.drawRoots();

    this.growing = active;
    if (active || rootsMoving) requestAnimationFrame((time) => this.frame(time));
    else this.running = false;
  }

  /* The first and last year the slider should offer. */
  yearRange() {
    const years = [...(this.people?.values() ?? [])].map((p) => p.born).filter(Boolean);
    return { min: years.length ? Math.min(...years) : THIS_YEAR - 100, max: THIS_YEAR };
  }

  setYear(year) {
    this.year = year;
    this.kick();
  }

  toggleBranch(nodeId) {
    if (this.collapsed.has(nodeId)) this.collapsed.delete(nodeId);
    else this.collapsed.add(nodeId);
    this.kick();
  }

  hasBranch(personId) {
    const node = this.nodes.find((n) => n.id === personId);
    return node?.children.length ? { collapsed: this.collapsed.has(personId) } : null;
  }

  /* ---------- Selecting and editing ---------- */

  setSelected(personId) {
    this.leafOf.get(this.selectedId)?.el.classList.remove('selected', 'kept');
    this.selectedId = personId && this.leafOf.has(personId) ? personId : null;
    this.leafOf.get(this.selectedId)?.el.classList.add('selected');
    this.setTabStop();
    this.refreshLit();
    this.drawHandles();
  }

  /* While searching, the people found keep their colour and everyone else steps back. `null` ends it. */
  setMatches(ids) {
    if (!ids && !this.matches) return;
    this.matches = ids;
    this.svg.classList.toggle('searching', Boolean(ids));
    for (const leaf of this.leaves) {
      const match = Boolean(ids?.has(leaf.person.id));
      leaf.el.classList.toggle('match', match);
      leaf.labelEl?.classList.toggle('match', match);
    }
  }

  /* Light the branches that connect two people, one after another, from the first to the second. No arguments clears it. */
  setRoute(fromId = null, toId = null) {
    this.route = this.leafOf.has(fromId) && this.leafOf.has(toId) ? [fromId, toId] : null;
    const along = this.paintRoute();
    if (!along) return;
    for (const id of this.route) this.flash(this.leafOf.get(id).el, 'glint', 2800);
    // Bring the whole way between the two into view
    const xs = along.map((n) => n.tx), ys = along.map((n) => n.ty);
    this.showArea({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
  }

  paintRoute() {
    for (const n of this.nodes) n.pathEl?.classList.remove('route');
    const [a, b] = (this.route ?? []).map((id) => this.leafOf.get(id)?.node);
    if (!a || !b) return null;
    const upFrom = (n) => { const list = []; for (; n; n = n.parent) list.push(n); return list; };
    const up = upFrom(a), down = upFrom(b);
    const shared = up.find((n) => down.includes(n));
    const path = [...up.slice(0, up.indexOf(shared)), ...down.slice(0, down.indexOf(shared)).reverse()];
    path.forEach((n, i) => {
      n.pathEl.style.transitionDelay = `${i * 70}ms`;
      n.pathEl.classList.add('route');
    });
    return [...path, shared];
  }

  /* Ring each person's leaf in the colour of the steward who looks after them. `tints` maps person id to a colour. */
  setTints(tints) {
    this.tints = tints;
    for (const leaf of this.leaves) {
      const colour = tints?.get(leaf.person.id) ?? null;
      leaf.el.classList.toggle('tinted', Boolean(colour));
      leaf.el.style.setProperty('--tint', colour ?? 'transparent');
    }
  }

  setEditing(editing) {
    this.editing = editing;
    this.svg.classList.toggle('editing', editing);
    this.drawHandles();
  }

  /* Light the way from the chosen leaf down to the trunk. */
  refreshLit() {
    const target = this.leafOf.get(this.selectedId) ?? this.leafOf.get(this.hoverId);
    for (const n of this.nodes) {
      if (!n.pathEl) continue;
      n.pathEl.classList.remove('lit');
      n.pathEl.style.transitionDelay = '0ms';
    }
    this.trunkPath.classList.toggle('lit', Boolean(target));
    // The light climbs from the trunk, one branch after another
    const chain = [];
    for (let n = target?.node; n?.parent; n = n.parent) chain.unshift(n);
    chain.forEach((n, i) => {
      n.pathEl.style.transitionDelay = `${(i + 1) * 55}ms`;
      n.pathEl.classList.add('lit');
    });
  }

  /* In edit mode the chosen leaf grows four small buds: pull one out to add a relative. */
  drawHandles() {
    for (const handle of [...this.layer.handles.querySelectorAll('.handle')]) handle.remove();
    const leaf = this.editing && this.shift >= 1 ? this.leafOf.get(this.selectedId) : null;
    if (!leaf || leaf.person.masked || leaf.person.pending) return;
    const n = leaf.node;
    const dx = Math.sin(leaf.angle), dy = -Math.cos(leaf.angle), px = -dy, py = dx;
    const spots = {
      child: [dx * 118, dy * 118], partner: [dx * 46 + px * 74, dy * 46 + py * 74],
      sibling: [dx * 46 - px * 74, dy * 46 - py * 74], parent: [-dx * 44, -dy * 44],
    };
    for (const relation of this.addable(leaf.person.id)) {
      const [ox, oy] = spots[relation];
      const handle = el('g', {
        class: 'handle', 'data-relation': relation, tabindex: '0', role: 'button', 'aria-label': `Add ${relation}`,
        transform: `translate(${(n.x + ox).toFixed(1)} ${(n.y + oy).toFixed(1)})`,
      }, this.layer.handles);
      handle.innerHTML = '<circle class="handle-shape" r="17"/><path class="handle-plus" d="M-7,0 H7 M0,-7 V7"/>';
      el('text', { class: 'handle-label', 'text-anchor': 'middle', y: 34 }, handle).textContent = relation;
      handle.origin = { x: n.x + dx * 30, y: n.y + dy * 30 };
    }
  }

  /* ---------- Camera: a transform on the world, moved by the graphics card ---------- */

  measure() {
    const b = { x0: -400, x1: 400, y0: -300, y1: TRUNK + 150 };
    for (const n of this.nodes) {
      b.x0 = Math.min(b.x0, n.tx); b.x1 = Math.max(b.x1, n.tx); b.y0 = Math.min(b.y0, n.ty);
    }
    b.x0 -= 150; b.x1 += 150; b.y0 -= 125;
    const changed = ['x0', 'x1', 'y0', 'y1'].some((key) => Math.abs(b[key] - this.bounds[key]) > 0.5) || !this.decorated;
    this.bounds = b;
    const width = b.x1 - b.x0, height = b.y1 - b.y0;
    this.svg.setAttribute('viewBox', `${b.x0} ${b.y0} ${width} ${height}`);
    this.svg.setAttribute('width', width);
    this.svg.setAttribute('height', height);
    this.world.style.width = `${width}px`;
    this.world.style.height = `${height}px`;
    if (changed) this.decorate();
  }

  paintCamera() {
    this.cameraQueued = false;
    const { cam, bounds } = this;
    this.world.style.transform = `translate(${(cam.x + bounds.x0 * cam.k).toFixed(2)}px,${(cam.y + bounds.y0 * cam.k).toFixed(2)}px) scale(${cam.k.toFixed(4)})`;
    const zoom = cam.k < 0.3 ? 'far' : cam.k < 0.44 ? 'mid' : 'near';
    if (this.svg.getAttribute('data-zoom') !== zoom) this.svg.setAttribute('data-zoom', zoom);
    this.on.moved?.();
  }

  applyCamera() {
    if (this.cameraQueued) return;
    this.cameraQueued = true;
    requestAnimationFrame(() => this.paintCamera());
  }

  markMoving() {
    this.moving = true;
    clearTimeout(this.moveTimer);
    this.moveTimer = setTimeout(() => {
      this.moving = false;
      if (Math.abs(this.cam.k / this.sharpAt - 1) > 0.02) this.sharpen();
      this.keepInReach();
    }, 160);
  }

  /* Where the trunk stands on the screen. */
  get trunkX() {
    return this.stageBox.left + this.cam.x;
  }

  /* The width of the stage not covered by an open side panel. */
  get freeWidth() {
    return this.stageBox.width - this.insets.right;
  }

  /* The tree can be pushed around freely, but never lost: if it is dragged out of sight it eases back. */
  keepInReach() {
    if (this.pointers.size) return;
    const { cam, bounds: b } = this, w = this.freeWidth, h = this.stageBox.height;
    const reach = Math.min(w, h) * 0.22;
    const left = cam.x + b.x0 * cam.k, right = cam.x + b.x1 * cam.k, top = cam.y + b.y0 * cam.k, bottom = cam.y + b.y1 * cam.k;
    const dx = right < reach ? reach - right : left > w - reach ? w - reach - left : 0;
    const dy = bottom < reach ? reach - bottom : top > h - reach ? h - reach - top : 0;
    if (dx || dy) this.glideTo({ x: cam.x + dx, y: cam.y + dy, k: cam.k }, 380);
  }

  /* A side panel or a banner opened or closed. If the tree has not been moved by hand, it re-centres in the space left. */
  setInsets(insets) {
    if (insets.right === this.insets.right && insets.top === this.insets.top) return;
    this.insets = insets;
    if (!this.userMoved) this.fit(false, true);
  }

  /* Once the tree rests at a new zoom, let the browser draw it again, sharp, at that size. */
  sharpen() {
    this.sharpAt = this.cam.k;
    this.world.style.willChange = 'auto';
    requestAnimationFrame(() => requestAnimationFrame(() => { this.world.style.willChange = 'transform'; }));
  }

  /* Wide screens show the whole tree. An upright phone fills the height and is panned sideways. */
  fit(whole = false, animated = false) {
    const r = (this.stageBox = this.stage.getBoundingClientRect());
    if (r.width < 40 || r.height < 40) return;
    const pad = r.width <= 640 ? { top: 76, bottom: 92, side: 8 } : r.height <= 480 ? { top: 56, bottom: 84, side: 16 } : { top: 84, bottom: 104, side: 16 };
    const bw = this.bounds.x1 - this.bounds.x0, bh = this.bounds.y1 - this.bounds.y0;
    pad.top += this.insets.top;
    const aw = this.freeWidth - pad.side * 2, ah = r.height - pad.top - pad.bottom;
    let k = Math.min(aw / bw, ah / bh);
    if (!whole && aw / bw < ah / bh && k < 0.44) k = Math.min(0.66, ah / bh);
    const to = {
      k,
      x: bw * k <= aw + 1 ? pad.side + (aw - bw * k) / 2 - this.bounds.x0 * k : this.freeWidth / 2,
      y: pad.top + (ah - bh * k) / 2 - this.bounds.y0 * k,
    };
    this.userMoved = whole;
    this.fitted = true;
    if (animated) return this.glideTo(to, 750);
    this.cameraRun++;
    this.cam = to;
    this.paintCamera();
    this.sharpen();
  }

  glideTo(to, ms) {
    const run = ++this.cameraRun;
    this.zoomGoal = null;
    if (this.still) {
      this.cam = to;
      this.paintCamera();
      this.sharpen();
      return;
    }
    const from = { ...this.cam }, start = performance.now();
    this.goal = { ...to, run, until: start + ms };
    const step = (now) => {
      if (run !== this.cameraRun) return;
      const t = Math.min(1, (now - start) / ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.cam.k = from.k * Math.pow(to.k / from.k, e);
      this.cam.x = from.x + (to.x - from.x) * e;
      this.cam.y = from.y + (to.y - from.y) * e;
      this.paintCamera();
      this.markMoving();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* Glide so that one part of the tree fills the view, no closer than is comfortable to read. */
  showArea(box) {
    const top = 84 + this.insets.top, bottom = 104, side = 24;
    const aw = this.freeWidth - side * 2, ah = this.stageBox.height - top - bottom;
    const k = Math.max(MIN_ZOOM, Math.min(0.9, aw / (box.x1 - box.x0 + 220), ah / (box.y1 - box.y0 + 220)));
    this.userMoved = true;
    this.glideTo({ k, x: side + aw / 2 - ((box.x0 + box.x1) / 2) * k, y: top + ah / 2 - ((box.y0 + box.y1) / 2) * k }, 750);
  }

  /* Where the camera is gliding to, or where it is when it is at rest. */
  get heading() {
    return this.goal?.run === this.cameraRun ? this.goal : this.cam;
  }

  /* Shift the view. If the tree is already gliding somewhere, it ends up that much further along, in the same sweep. */
  panBy(dx, dy) {
    const { x, y, k, until = 0 } = this.heading;
    this.userMoved = true;
    this.glideTo({ x: x + dx, y: y + dy, k }, Math.max(320, until - performance.now()));
  }

  /*
   * Where a leaf is on the screen or, while the tree is gliding somewhere, where
   * it will come to rest. For placing its card, which then does not have to follow.
   */
  leafRect(personId) {
    const box = this.leafOf.get(personId)?.el.getBoundingClientRect();
    if (!box) return null;
    const { cam, heading: to } = this, f = to.k / cam.k, ox = this.stageBox.left, oy = this.stageBox.top;
    return new DOMRect((box.left - ox - cam.x) * f + to.x + ox, (box.top - oy - cam.y) * f + to.y + oy, box.width * f, box.height * f);
  }

  /* Bring a person to the middle of the screen, close enough to read. */
  flyTo(personId) {
    const leaf = this.leafOf.get(personId);
    if (!leaf) return;
    const k = Math.max(this.cam.k, 0.7);
    this.userMoved = true;
    this.glideTo({ k, x: this.freeWidth / 2 - leaf.node.tx * k, y: this.stageBox.height / 2 - leaf.node.ty * k }, 800);
  }

  /* Nudge the tree, if needed, so a leaf the keyboard has moved to is comfortably on screen. */
  reveal(leaf) {
    const box = leaf.el.getBoundingClientRect(), edge = 72;
    const right = this.stageBox.left + this.freeWidth, bottom = this.stageBox.bottom;
    const dx = box.left < this.stageBox.left + edge ? this.stageBox.left + edge - box.left : box.right > right - edge ? right - edge - box.right : 0;
    const dy = box.top < this.stageBox.top + edge + 20 ? this.stageBox.top + edge + 20 - box.top : box.bottom > bottom - edge - 40 ? bottom - edge - 40 - box.bottom : 0;
    if (dx || dy) this.panBy(dx, dy);
  }

  /* Glide to a zoom level, keeping the given point of the screen where it is. */
  zoomTo(px, py, k, ms = 260) {
    const target = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k)), f = target / this.cam.k;
    this.userMoved = true;
    this.glideTo({ k: target, x: px - (px - this.cam.x) * f, y: py - (py - this.cam.y) * f }, ms);
  }

  /* One step in or out, about the middle of the screen. For the zoom buttons and the + and - keys. */
  zoomStep(factor) {
    this.zoomTo(this.freeWidth / 2, this.stageBox.height / 2, this.cam.k * factor);
  }

  zoomAt(px, py, factor) {
    this.cameraRun++;
    const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.cam.k * factor));
    const f = k / this.cam.k;
    this.cam.x = px - (px - this.cam.x) * f;
    this.cam.y = py - (py - this.cam.y) * f;
    this.cam.k = k;
    this.userMoved = true;
    this.markMoving();
  }

  /* ---------- Input ---------- */

  /* The twig that follows the finger while a + bud is pulled out, with a leaf at its tip. `null` puts it away. */
  showTwig(handle, to = null) {
    this.twigTip.classList.toggle('on', Boolean(handle));
    if (!handle) return this.twig.setAttribute('d', '');
    const from = handle.origin;
    this.twig.setAttribute('d', `M${from.x.toFixed(1)},${from.y.toFixed(1)} Q${((from.x + to.x) / 2).toFixed(1)},${(from.y + (to.y - from.y) * 0.2).toFixed(1)} ${to.x.toFixed(1)},${to.y.toFixed(1)}`);
    this.twigTip.setAttribute('transform', `translate(${to.x.toFixed(1)} ${to.y.toFixed(1)})`);
    this.twigTip.lastChild.textContent = handle.getAttribute('data-relation');
  }

  listen() {
    const { stage } = this;
    const list = () => [...this.pointers.values()];
    const onTree = (target) => target?.closest?.('.leaf-node.on, .bud, .handle');
    const personAt = (leafEl) => this.people.get(leafEl.getAttribute('data-id'));
    let downTarget = null, dragged = false, pinch = null, lastMoveAt = 0, pulling = null;
    let holdTimer = null, holding = false, lastTap = null, oneHand = null;

    const local = (e) => ({ x: e.clientX - this.stageBox.left, y: e.clientY - this.stageBox.top });
    const worldPoint = (e) => ({ x: (local(e).x - this.cam.x) / this.cam.k, y: (local(e).y - this.cam.y) / this.cam.k });

    stage.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;                 // the other mouse buttons belong to the menu and the browser
      this.cameraRun++;
      this.zoomGoal = null;
      this.velocity.x = this.velocity.y = 0;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      const all = list();
      clearTimeout(holdTimer);
      if (all.length === 1) {
        downTarget = e.target;
        dragged = holding = false;
        pulling = e.target.closest?.('.handle') ?? null;
        // A second tap on open ground soon after the first: zoom in, or keep the finger down and slide to zoom with one hand
        const again = lastTap && performance.now() - lastTap.at < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 32;
        oneHand = again && !onTree(e.target) ? { y: e.clientY, k: this.cam.k, at: local(e), slid: false, out: e.shiftKey } : null;
        // Keeping a finger on a leaf opens its menu
        const leafEl = e.target.closest?.('.leaf-node.on');
        if (leafEl && !pulling) {
          const x = e.clientX, y = e.clientY;
          holdTimer = setTimeout(() => {
            if (dragged || this.pointers.size !== 1) return;
            holding = true;
            navigator.vibrate?.(8);
            this.on.hold?.({ person: personAt(leafEl), x, y });
          }, 450);
        }
      } else if (all.length === 2) {
        dragged = true;
        pulling = oneHand = null;
        this.showTwig(null);
        pinch = { d: Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y), k: this.cam.k, at: performance.now(), spread: 0 };
      }
      try { stage.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    });

    stage.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (holding) return this.on.holdMove?.(e.clientX, e.clientY);
      const all = list();
      if (all.length === 2 && pinch) {
        const d = Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y);
        pinch.spread = Math.max(pinch.spread, Math.abs(d / pinch.d - 1));
        this.zoomAt((all[0].x + all[1].x) / 2 - this.stageBox.left, (all[0].y + all[1].y) / 2 - this.stageBox.top, (pinch.k * d) / pinch.d / this.cam.k);
        this.applyCamera();
        return;
      }
      if (all.length !== 1) return;
      if (oneHand) {
        const slide = e.clientY - oneHand.y;
        if (Math.abs(slide) > 6) oneHand.slid = true;
        if (oneHand.slid) {
          this.zoomAt(oneHand.at.x, oneHand.at.y, (oneHand.k * Math.exp(slide * 0.009)) / this.cam.k);
          this.applyCamera();
        }
        return;
      }
      if (!dragged && Math.hypot(p.x - p.sx, p.y - p.sy) < 6) return;
      dragged = true;
      clearTimeout(holdTimer);
      if (pulling) return this.showTwig(pulling, worldPoint(e));
      stage.classList.add('dragging');
      const now = performance.now(), gap = Math.max(1, now - lastMoveAt);
      this.velocity.x = this.velocity.x * 0.6 + (dx / gap) * 0.4;
      this.velocity.y = this.velocity.y * 0.6 + (dy / gap) * 0.4;
      lastMoveAt = now;
      this.cam.x += dx; this.cam.y += dy;
      this.userMoved = true;
      this.applyCamera();
      this.markMoving();
    });

    const end = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      clearTimeout(holdTimer);
      const pinched = pinch;
      this.pointers.delete(e.pointerId);
      stage.classList.remove('dragging');
      if (this.pointers.size) return;
      pinch = null;
      this.showTwig(null);
      const cancelled = e.type === 'pointercancel';
      if (holding) {
        holding = false;
        if (!cancelled) this.on.holdEnd?.(e.clientX, e.clientY);
        return;
      }
      if (cancelled) { oneHand = pulling = null; return; }
      if (pinched) {
        // Two fingers down and up again without spreading: one step back out
        if (performance.now() - pinched.at < 320 && pinched.spread < 0.06) this.zoomStep(1 / 1.7);
        else this.keepInReach();
        return;
      }
      if (oneHand) {
        const { slid, at, out } = oneHand;
        oneHand = lastTap = null;
        if (!slid) this.zoomTo(at.x, at.y, this.cam.k * (out ? 1 / 1.7 : 1.7));
        return;
      }
      if (pulling) {
        this.on.add({ person: this.leafOf.get(this.selectedId).person, relation: pulling.getAttribute('data-relation') });
        pulling = null;
        return;
      }
      if (!dragged) {
        lastTap = onTree(downTarget) ? null : { at: performance.now(), x: e.clientX, y: e.clientY };
        return this.activate(downTarget);
      }
      const flicked = !this.still && performance.now() - lastMoveAt < 90 && Math.hypot(this.velocity.x, this.velocity.y) > 0.08;
      if (flicked) this.coast();
      else this.keepInReach();
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);

    // The right mouse button, or a long press where the browser reports one, opens a leaf's menu
    stage.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const leafEl = e.target.closest?.('.leaf-node.on');
      if (!leafEl || holding) return;
      dragged = true;                           // a Control-click is a menu, not also a tap
      this.on.hold?.({ person: personAt(leafEl), x: e.clientX, y: e.clientY });
    });

    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016));
      const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (this.zoomGoal?.k ?? this.cam.k) * step));
      this.zoomGoal = { k, x: e.clientX - this.stageBox.left, y: e.clientY - this.stageBox.top };
      if (this.still) {
        this.zoomAt(this.zoomGoal.x, this.zoomGoal.y, k / this.cam.k);
        this.paintCamera();
        this.zoomGoal = null;
      } else if (!this.zoomRunning) {
        this.zoomRunning = true;
        let prev = performance.now();
        const ease = (now) => {
          if (!this.zoomGoal) { this.zoomRunning = false; return; }
          const dt = Math.min(40, now - prev);
          prev = now;
          const ratio = this.zoomGoal.k / this.cam.k;
          const arrived = Math.abs(Math.log(ratio)) < 0.002;
          this.zoomAt(this.zoomGoal.x, this.zoomGoal.y, arrived ? ratio : Math.pow(ratio, 1 - Math.exp(-dt / 70)));
          this.paintCamera();
          if (arrived) { this.zoomGoal = null; this.zoomRunning = false; return; }
          requestAnimationFrame(ease);
        };
        requestAnimationFrame(ease);
      }
    }, { passive: false });

    // The keyboard: arrows travel along the family, Enter opens, Space folds a branch, the menu key opens the menu
    stage.addEventListener('keydown', (e) => {
      const leafEl = e.target.closest?.('.leaf-node');
      const leaf = leafEl && this.leaves.find((candidate) => candidate.el === leafEl);
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (e.key === ' ' && leaf && !leaf.isPartner && leaf.node.children.length) return this.toggleBranch(leaf.node.id);
        return this.activate(e.target);
      }
      if (!leaf) return;
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const next = this.neighbour(leaf, e.key);
        if (!next) return;
        next.el.focus({ preventScroll: true });
        this.reveal(next);
      } else if (e.key === '.' || e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault();
        const box = leafEl.getBoundingClientRect();
        this.on.hold?.({ person: leaf.person, x: box.left + box.width / 2, y: box.top + box.height / 2, keyboard: true });
      }
    });
    stage.addEventListener('focusin', (e) => {
      const id = e.target.closest?.('.leaf-node')?.getAttribute('data-id');
      if (id) this.setTabStop(id);
    });
    stage.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const id = e.target.closest?.('.leaf-node.on')?.getAttribute('data-id') ?? null;
      if (id !== this.hoverId) {
        this.hoverId = id;
        this.refreshLit();
      }
    });
  }

  /* A tap or Enter on something in the tree. */
  activate(target) {
    const handle = target?.closest?.('.handle');
    if (handle) return this.on.add({ person: this.leafOf.get(this.selectedId).person, relation: handle.getAttribute('data-relation') });
    const bud = target?.closest?.('.bud');
    if (bud) return this.toggleBranch(bud.getAttribute('data-node'));
    const id = target?.closest?.('.leaf-node.on')?.getAttribute('data-id');
    this.on.select(id && id !== this.selectedId ? this.people.get(id) : null);
  }

  /* Let go of a drag and the tree keeps drifting, slowing to a stop. */
  coast() {
    const run = ++this.cameraRun;
    let prev = performance.now();
    const step = (now) => {
      if (run !== this.cameraRun) return;
      const dt = Math.min(40, now - prev);
      prev = now;
      this.cam.x += this.velocity.x * dt;
      this.cam.y += this.velocity.y * dt;
      const slow = Math.exp(-dt / 300);
      this.velocity.x *= slow;
      this.velocity.y *= slow;
      this.paintCamera();
      this.markMoving();
      if (Math.hypot(this.velocity.x, this.velocity.y) > 0.012) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* Which relatives can be added to this person: the same answer for the + buds and for the menu. */
  addable(personId) {
    const born = this.unions.find((u) => u.children.some((c) => c.id === personId));
    return RELATIONS.filter((relation) => !(relation === 'parent' && born?.partners.length >= 2) && !(relation === 'sibling' && !born));
  }

  /* Now and then a gust crosses the tree. Between gusts nothing moves, so nothing is redrawn. */
  gustSoon(delay) {
    if (this.still) return;
    setTimeout(() => {
      const calm = !this.growing && !this.moving && !document.hidden && !this.pointers.size;
      if (calm) {
        this.svg.classList.add('gust');
        setTimeout(() => this.svg.classList.remove('gust'), 4400);
      }
      this.gustSoon(calm ? 7500 + Math.random() * 4500 : 1500);
    }, delay);
  }

  /* ---------- The sky's furniture and the ground ---------- */

  decorate() {
    this.decorated = true;
    const b = this.bounds, g = TRUNK;
    const spot = (cx, cy, rx, ry) => `left:${(cx - rx - b.x0).toFixed(1)}px;top:${(cy - ry - b.y0).toFixed(1)}px;width:${rx * 2}px;height:${ry * 2}px`;
    let html = `<div class="only-light sun" style="${spot(b.x0 + 250, b.y0 + 150, 330, 330)}"></div>` +
      `<div class="only-light canopy-wash" style="${spot(0, -330, 860, 470)}"></div>` +
      `<div class="only-light soil" style="${spot(0, g + 12, 640, 44)}"></div>`;

    const sky = { x: b.x0 - 360, y: b.y0 - 260, w: b.x1 - b.x0 + 720, h: g - b.y0 + 480 };
    let stars = '';
    for (let i = 0; i < 150; i++) {
      const id = `star${i}`;
      const sx = rnd(id, 'x') * sky.w, sy = rnd(id, 'y') * sky.h, sr = 0.6 + rnd(id, 'r') * 1.3;
      if (i % 6 === 0) html += `<i class="only-dark twinkle" style="${spot(sky.x + sx, sky.y + sy, sr, sr)};animation-delay:-${(rnd(id, 'd') * 5).toFixed(1)}s"></i>`;
      else stars += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${sr.toFixed(2)}" opacity="${(0.2 + rnd(id, 'o') * 0.6).toFixed(2)}"/>`;
    }
    html += `<svg class="only-dark stars" style="${spot(sky.x + sky.w / 2, sky.y + sky.h / 2, sky.w / 2, sky.h / 2)}" viewBox="0 0 ${sky.w} ${sky.h}">${stars}</svg>` +
      `<div class="only-dark moon" style="${spot(b.x0 + 210, b.y0 + 80, 400, 400)}"><span></span></div>`;
    this.world.querySelector('.behind').innerHTML = html;

    this.layer.back.replaceChildren();
    el('path', { class: 'ground', d: `M-560,${g + 4} C-300,${g - 6} -120,${g + 9} 0,${g + 3} C160,${g - 4} 380,${g + 10} 580,${g + 2}` }, this.layer.back);
    for (let i = 0; i < 46; i++) {
      const id = `grass${i}`;
      const x = -540 + rnd(id, 'x') * 1080;
      if (Math.abs(x) < 34) continue;
      const h = 9 + rnd(id, 'h') * 18, lean = (rnd(id, 'l') - 0.5) * 14;
      el('path', { class: 'grass', d: `M${x.toFixed(1)},${g + 5} q${(lean / 2).toFixed(1)},${(-h / 2).toFixed(1)} ${lean.toFixed(1)},${(-h).toFixed(1)}` }, this.layer.back);
    }

    html = '';
    for (let i = 0; i < 22; i++) {
      const id = `fly${i}`;
      const fx = b.x0 + rnd(id, 'x') * (b.x1 - b.x0), fy = b.y0 + 80 + rnd(id, 'y') * (g - b.y0 - 60);
      html += `<i class="only-dark fly" style="${spot(fx, fy, 11, 11)};--t:${(7 + rnd(id, 't') * 9).toFixed(1)}s;--d:-${(rnd(id, 'd') * 9).toFixed(1)}s;--dx:${((rnd(id, 'dx') - 0.5) * 220).toFixed(0)}px;--dy:${((rnd(id, 'dy') - 0.5) * 160).toFixed(0)}px"><b></b></i>`;
    }
    this.world.querySelector('.ahead').innerHTML = html;
  }
}
