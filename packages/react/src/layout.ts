/*
 * Room for everyone on the tree: how far out each generation stands, how the
 * fan is shared between the branches, and where each name is written so that
 * it does not lie over another. Plain numbers in and out and no drawing, so
 * all of it can be checked by a test.
 * Author: George Khananaev
 */

export const NAME_SIZE = 23;
export const YEARS_SIZE = 16;
const NAME_LINE = 24;                    // from one line of a name down to the next
const YEARS_DROP = YEARS_SIZE + 3;       // from a name down to the years under it

const SPREAD = (92 * Math.PI) / 180;     // the fan the family opens into, to each side of straight up
const RADII = [0, 185, 355, 520, 680];
const RADIUS_STEP = 150;                 // each generation beyond the fifth
const LEAF_HALF = 28;                    // half the width of a leaf
const TIP = 78;                          // from a fork to where a name past the leaf's tip is written
const GAP = 14;                          // kept clear between one fork's leaves and names and the next fork's

/* The tightest and the roomiest a tree may be asked to be. 1 is as it comes. */
export const SPACING = { min: 0.5, max: 2 } as const;

/* How far from the top of the trunk a generation stands on a small tree. */
export const radiusOf = (depth: number): number => RADII[depth] ?? RADII[RADII.length - 1] + (depth - RADII.length + 1) * RADIUS_STEP;

export interface Point {
  x: number;
  y: number;
}

export type Bezier = readonly [Point, Point, Point, Point];

export function norm(v: Point): Point {
  const length = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / length, y: v.y / length };
}

export function bez(b: Bezier, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * b[0].x + 3 * u * u * t * b[1].x + 3 * u * t * t * b[2].x + t * t * t * b[3].x,
    y: u * u * u * b[0].y + 3 * u * u * t * b[1].y + 3 * u * t * t * b[2].y + t * t * t * b[3].y,
  };
}

/* How wide a branch is where it leaves its parent, by how many people hang from it. */
export const branchWidth = (count: number): number => 3.3 * Math.sqrt(count);

/* A number from 0 to 1 that is always the same for the same person and purpose: the small ways in which no two branches are alike. */
type Chance = (id: string, salt: string) => number;

/* ---------- Names ---------- */

const WIDE = /[mwMWшщжмюыШЩЖМЮЫ@]/;
const NARROW = /[\sijl.,'’"\-ויןז]/;
const SLIM = /[rtfI]/;
const CAPITAL = /[A-ZА-ЯЁ]/;

/* About how wide a piece of text is when written `size` high, by counting its wide, narrow and plain letters: for where the page's own fonts cannot be asked. */
export function widthOf(text: string, size: number): number {
  let ems = 0;
  for (const letter of text) ems += WIDE.test(letter) ? 0.9 : NARROW.test(letter) ? 0.34 : SLIM.test(letter) ? 0.42 : CAPITAL.test(letter) ? 0.72 : 0.61;
  return ems * size;
}

/* A name as it is written on the tree: on one line, or, when it is long and of several words, on two, broken at the space nearest its middle. */
export function linesOf(name: string): string[] {
  const words = name.trim().split(/\s+/), whole = words.join(' ');
  if (words.length < 2 || whole.length <= 9) return [whole];
  let cut = 1, best = Infinity;
  for (let i = 1; i < words.length; i++) {
    const uneven = Math.abs(2 * words.slice(0, i).join(' ').length + 1 - whole.length);
    if (uneven < best) { best = uneven; cut = i; }
  }
  return [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
}

/* What is written beside a leaf: the lines of the name, how wide the widest line is, and whether years go under it. */
export interface NameTag {
  lines: readonly string[];
  width: number;
  years: boolean;
}

/* How tall a tag is, from the top of its name to the foot of its last line. */
const heightOf = (tag: NameTag): number => tag.lines.length * NAME_LINE + (tag.years ? YEARS_DROP : 0);

/* ---------- Where each fork stands ---------- */

/* One leaf at a fork: how far it leans from the branch, how large it is drawn, and its name. A leaf with no name written has no tag. */
export interface Hung {
  offset: number;
  scale: number;
  tag: NameTag | null;
}

/* A fork of the tree: someone, with their partners beside them, and their children further out. arrange() fills in the last five. */
export interface Fork<Self> {
  id: string;
  depth: number;
  children: Self[];
  hung: readonly Hung[];
  /* How many people hang from here, the fork's own among them. */
  count: number;
  /* How much of the fan the fork asks for. */
  weight: number;
  /* Where it is heading: its angle from straight up, and the spot that is. */
  ttheta: number;
  tx: number;
  ty: number;
}

/*
 * How much of its ring a fork would like, in the ring's own length, for its
 * leaves and their names to stand beside the next fork's. Names are written
 * level, so at the top of the tree, where the ring runs level too, they stand
 * side by side and take their width. Out at the sides the ring runs up and
 * down, and they stack, taking only their height.
 */
function roomOf(fork: { hung: readonly Hung[] }, theta: number): number {
  const level = Math.max(Math.abs(Math.cos(theta)), 1e-6), upright = Math.max(Math.abs(Math.sin(theta)), 1e-6);
  const fanned = fork.hung.length > 1;
  let reach = 0;
  for (const { offset, scale, tag } of fork.hung) {
    const name = tag ? Math.min(tag.width / level, heightOf(tag) / upright) : 0;
    const half = Math.max(LEAF_HALF * scale, name / 2);
    // Partners share a fork and lean away from each other, so their names start that far apart
    reach = Math.max(reach, half + (fanned ? Math.abs(TIP * scale * Math.sin(offset)) : 0));
  }
  return 2 * reach + GAP;
}

/* How far out each generation stands on a small tree, for a family this many generations deep. */
export const smallRings = (generations: number): number[] => Array.from({ length: generations }, (_, depth) => radiusOf(depth));

/*
 * Generations on rings, the order of the family as the angle. Each fork gets
 * the share of the fan its leaves and names would like, or what its children
 * would like between them if that is more. `rings` says how far out each
 * generation stands. A generation it does not reach stands where a small
 * tree's would.
 */
export function arrange<Node extends Fork<Node>>(root: Node, rings: readonly number[], rnd: Chance): void {
  const all: Node[] = [];
  const gather = (n: Node): void => {
    all.push(n);
    n.ttheta = 0;
    n.children.forEach(gather);
  };
  gather(root);
  const out = (depth: number): number => rings[depth] ?? radiusOf(depth);
  // The innermost rings are short, and a fork on one is not given more of the fan than one halfway to the second ring would be
  const inner = (radiusOf(1) + radiusOf(2)) / 2;
  const weigh = (n: Node): void => {
    let kids = 0;
    n.count = n.hung.length;
    for (const child of n.children) {
      weigh(child);
      kids += child.weight;
      n.count += child.count;
    }
    n.weight = Math.max(roomOf(n, n.ttheta) / Math.max(out(n.depth), inner), kids);
  };
  const share = (n: Node, a0: number, a1: number): void => {
    const kids = n.children;
    if (!kids.length) {
      n.ttheta = (a0 + a1) / 2;
      return;
    }
    const sum = kids.reduce((s, c) => s + c.weight, 0);
    const span = ((a1 - a0) * sum) / n.weight;
    let cursor = (a0 + a1) / 2 - span / 2;
    for (const child of kids) {
      const width = (span * child.weight) / sum;
      share(child, cursor, cursor + width);
      cursor += width;
    }
    n.ttheta = (kids[0].ttheta + kids[kids.length - 1].ttheta) / 2;
  };
  // How much room a name would like depends on where on its ring it ends up, which depends on the room everyone would like. A few rounds settle it.
  for (let round = 0; round < 3; round++) {
    weigh(root);
    share(root, -SPREAD, SPREAD);
  }
  for (const n of all) {
    // Nobody stands exactly on their spot: a small step to one side, and nearer or further. On a larger ring the same step is a smaller turn.
    if (n.depth > 0) n.ttheta += ((rnd(n.id, 't') - 0.5) * 0.035 * radiusOf(n.depth)) / Math.max(out(n.depth), radiusOf(n.depth));
    const r = out(n.depth) + (n.depth ? (rnd(n.id, 'r') - 0.5) * 30 : 0);
    n.tx = r * Math.sin(n.ttheta);
    n.ty = -r * Math.cos(n.ttheta);
  }
}

/* The branch that reaches a fork: it leaves along the way its parent's branch was going, and arrives heading outward. Also which way it points as it arrives, and how long it is. */
export function curveOf(id: string, from: Point, heading: Point, to: Point, theta: number, rnd: Chance): { bz: Bezier; dir: Point; length: number } {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const chord = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  const radial = { x: Math.sin(theta), y: -Math.cos(theta) };
  const dIn = norm({ x: heading.x * 0.65 + chord.x * 0.35, y: heading.y * 0.65 + chord.y * 0.35 });
  const dOut = norm({ x: radial.x * 0.6 + chord.x * 0.4, y: radial.y * 0.6 + chord.y * 0.4 });
  const side = { x: -chord.y, y: chord.x };
  const wobA = (rnd(id, 'a') - 0.5) * length * 0.16, wobB = (rnd(id, 'b') - 0.5) * length * 0.16;
  const P1 = { x: from.x + dIn.x * length * 0.4 + side.x * wobA, y: from.y + dIn.y * length * 0.4 + side.y * wobA };
  const P2 = { x: to.x - dOut.x * length * 0.36 + side.x * wobB, y: to.y - dOut.y * length * 0.36 + side.y * wobB };
  return { bz: [from, P1, P2, to], dir: norm({ x: to.x - P2.x, y: to.y - P2.y }), length };
}

/* ---------- Where each name is written ---------- */

/*
 * What a name has to keep clear of, as distances from the fork along the leaf:
 * the round patch that stands for it when other names look for room, then its
 * middle, its far end and half its width.
 */
export interface Body {
  patchAt: number;
  patch: number;
  mid: number;
  reach: number;
  half: number;
}
export const LEAF_BODY: Body = { patchAt: 38, patch: 25, mid: 40, reach: 66, half: LEAF_HALF };

/* A leaf as the names see it: where its fork is, which way it points, and what it wears. A round photo is wide, and nobody's name crosses one. */
export interface Leafage {
  x: number;
  y: number;
  angle: number;
  scale: number;
  body: Body;
  face: boolean;
  tag: NameTag | null;
}

/* A branch, as points along it and half its width. */
export interface Twig {
  points: readonly Point[];
  half: number;
}

/* A branch as the names see it. */
export const twigOf = (bz: Bezier, half: number): Twig => ({ half, points: Array.from({ length: 8 }, (_, i) => bez(bz, (i + 1) / 9)) });

/* Something small and round that a name should not cover, such as a blossom. */
export interface Knot extends Point {
  r: number;
}

/* Where a name is written: the spot, which end of the text is held there, how far down each line and the years are, and the room it takes. */
export interface LabelBox {
  x: number;
  y: number;
  anchor: 'start' | 'end' | 'middle';
  lineDy: number[];
  yearsDy: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Room {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function boxAt(x: number, y: number, ox: number, oy: number, tag: NameTag): LabelBox {
  const more = (tag.lines.length - 1) * NAME_LINE;
  let anchor: LabelBox['anchor'] = 'middle', first: number;
  if (Math.abs(ox) >= 0.38) {
    // Beside the leaf: the name's middle is level with the spot
    anchor = ox > 0 ? 'start' : 'end';
    x += ox > 0 ? 3 : -3;
    first = NAME_SIZE * 0.15 - more / 2;
  } else if (oy < 0) {
    // Above it: the last line sits just over the spot, with nothing left empty where years would have been
    first = (tag.years ? -2 - YEARS_DROP : -5) - more;
  } else {
    first = NAME_SIZE;
  }
  const last = first + more, yearsDy = last + YEARS_DROP;
  const left = anchor === 'start' ? x : anchor === 'end' ? x - tag.width : x - tag.width / 2;
  return {
    x, y, anchor, yearsDy,
    lineDy: tag.lines.map((_, i) => first + i * NAME_LINE),
    left, right: left + tag.width,
    top: y + first - NAME_SIZE * 0.8,
    bottom: y + (tag.years ? yearsDy + 3 : last + NAME_SIZE * 0.28),
  };
}

/* The spots a name may take around its leaf, the likeliest first: past the tip, beside the middle, then further off. */
function spotsOf({ angle, scale: s, body, tag }: Leafage): [number, number][] {
  const dx = Math.sin(angle), dy = -Math.cos(angle), px = -dy, py = dx;
  const tip = body.reach * s + 12, side = body.half * s + 10;
  const mid = body.mid * s, high = (body.reach - 4) * s, low = (body.mid - 26) * s;
  // A whole name further out, so that the names of two leaves at one fork can sit one above the other
  const row = tip + (tag ? heightOf(tag) : 0) + 6;
  const at = (along: number, across: number): [number, number] => [dx * along + px * across, dy * along + py * across];
  return [
    at(tip, 0), at(mid, side), at(mid, -side), at(tip + 22, 0), at(high, side), at(high, -side), at(low, side + 8), at(low, -side - 8),
    at(tip + 6, side + 4), at(tip + 6, -side - 4), at(row, 0), at(mid, side + 30), at(mid, -side - 30), at(row, side), at(row, -side),
  ];
}

/* Things on the tree, filed by where they are, so that a name looking for room asks only about what is near it. */
class Nearby {
  private readonly cells = new Map<number, number[]>();
  private readonly homes = new Map<number, number[]>();

  private static keysOf({ left, right, top, bottom }: Room): number[] {
    const keys: number[] = [];
    for (let cx = Math.floor(left / 160); cx <= Math.floor(right / 160); cx++) {
      for (let cy = Math.floor(top / 160); cy <= Math.floor(bottom / 160); cy++) keys.push(cx * 100_003 + cy);
    }
    return keys;
  }

  put(index: number, room: Room): void {
    this.take(index);
    const keys = Nearby.keysOf(room);
    this.homes.set(index, keys);
    for (const key of keys) {
      const cell = this.cells.get(key);
      if (cell) cell.push(index);
      else this.cells.set(key, [index]);
    }
  }

  take(index: number): void {
    for (const key of this.homes.get(index) ?? []) {
      const cell = this.cells.get(key);
      if (cell) cell.splice(cell.indexOf(index), 1);
    }
    this.homes.delete(index);
  }

  /* Everything filed anywhere near this room, each once. */
  near(room: Room): Set<number> {
    const found = new Set<number>();
    for (const key of Nearby.keysOf(room)) for (const index of this.cells.get(key) ?? []) found.add(index);
    return found;
  }
}

/* The air kept between two names, so that none reads as part of the one beside it, and a letter that hangs low does not touch the name under it. */
const AIR = 6;

const sizeOf = (box: Room): number => (box.right - box.left) * (box.bottom - box.top);
/* How much of the smaller of two boxes the other covers, from 0 to 1, counting the air between them as covered. */
function overlap(a: Room, b: Room, air: number): number {
  const wide = Math.min(a.right, b.right) - Math.max(a.left, b.left) + air;
  const tall = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) + air;
  return wide > 0 && tall > 0 ? Math.min(1, (wide * tall) / Math.min(sizeOf(a), sizeOf(b))) : 0;
}
/* How far inside a round thing a box reaches, from 0 (not at all) to 1 (over its middle). */
function into(box: Room, round: Knot): number {
  const nx = Math.max(box.left, Math.min(round.x, box.right)), ny = Math.max(box.top, Math.min(round.y, box.bottom));
  return Math.max(0, 1 - Math.hypot(nx - round.x, ny - round.y) / round.r);
}
const around = ({ x, y, r }: Knot): Room => ({ left: x - r, right: x + r, top: y - r, bottom: y + r });
/* The round patch that stands for a leaf when names look for room. */
const patchOf = ({ x, y, angle, scale, body }: Leafage): Knot => {
  const along = body.patchAt * scale;
  return { x: x + Math.sin(angle) * along, y: y - Math.cos(angle) * along, r: body.patch * scale };
};

/*
 * Each name tries the spots around its leaf and takes the one that is in the
 * way of the least: another name most of all, then a leaf, a blossom, a
 * branch. How much of a name is covered counts, so that where nothing is free
 * the least is hidden. Once all are down, the ones still in the way of
 * something look again, now that they know where everyone else went. The
 * leaves are taken in the order given. Gives back a box for each, or null for
 * a leaf with no name written.
 */
export function placeNames(leaves: readonly Leafage[], twigs: readonly Twig[] = [], knots: readonly Knot[] = []): (LabelBox | null)[] {
  const patches = leaves.map(patchOf);
  const reaches = twigs.map(({ points, half }) => ({
    points, half,
    left: Math.min(...points.map((p) => p.x)) - half, right: Math.max(...points.map((p) => p.x)) + half,
    top: Math.min(...points.map((p) => p.y)) - half, bottom: Math.max(...points.map((p) => p.y)) + half,
  }));
  const placed: (LabelBox | null)[] = leaves.map(() => null);
  const names = new Nearby(), blobs = new Nearby(), blossoms = new Nearby(), branches = new Nearby();
  patches.forEach((patch, index) => blobs.put(index, around(patch)));
  knots.forEach((knot, index) => blossoms.put(index, around(knot)));
  reaches.forEach((reach, index) => branches.put(index, reach));

  const costOf = (box: LabelBox, self: number): number => {
    let cost = 0;
    for (const index of names.near({ left: box.left - AIR, right: box.right + AIR, top: box.top - AIR, bottom: box.bottom + AIR })) {
      // Whatever is filed under names has been placed
      const covered = index === self ? 0 : overlap(box, placed[index]!, AIR);
      if (covered > 0) cost += 3 + 6 * covered;
    }
    for (const index of blobs.near(box)) {
      // A name may lean over its own leaf, which is narrow. A face is round and wide, and nobody's name crosses it.
      if (index === self && !leaves[index].face) continue;
      const deep = into(box, patches[index]);
      if (deep > 0) cost += 2 + 2 * deep;
    }
    for (const index of blossoms.near(box)) if (into(box, knots[index]) > 0) cost += 1;
    let crossed = 0;
    for (const index of branches.near(box)) {
      const { points, half } = reaches[index];
      if (crossed < 3 && points.some((p) => p.x > box.left - half && p.x < box.right + half && p.y > box.top - half && p.y < box.bottom + half)) crossed++;
    }
    return cost + crossed * 0.7;
  };

  /* Put one name on its best spot, given where the others are now. */
  const settle = (index: number): void => {
    const leaf = leaves[index], { tag } = leaf;
    if (!tag) return;
    let best: LabelBox | null = null, least = Infinity;
    spotsOf(leaf).forEach((spot, order) => {
      const length = Math.hypot(spot[0], spot[1]) || 1;
      const box = boxAt(leaf.x + spot[0], leaf.y + spot[1], spot[0] / length, spot[1] / length, tag);
      const cost = costOf(box, index) + order * 0.045;
      if (cost < least) { least = cost; best = box; }
    });
    placed[index] = best;
    // There is always a first spot, so there is always a best one
    names.put(index, best!);
  };

  leaves.forEach((_, index) => settle(index));
  for (let round = 0; round < 2; round++) {
    // The worst off choose first. A name that costs less than a crossed branch is only on a spot it likes less, in nobody's way.
    const unsettled = placed.map((box, index) => ({ cost: box ? costOf(box, index) : 0, index })).filter(({ cost }) => cost >= 0.7).sort((a, b) => b.cost - a.cost);
    if (!unsettled.length) break;
    for (const { index } of unsettled) settle(index);
  }
  return placed;
}

/*
 * What is in the way of something else: a name written over another name, or
 * closer to it than a little air, or into someone else's leaf, and two leaves
 * of different forks lying over each other. Each as the two leaves it is
 * between.
 */
export function clashesIn(leaves: readonly Leafage[], boxes: readonly (LabelBox | null)[]): [number, number][] {
  const patches = leaves.map(patchOf), clashes: [number, number][] = [];
  const filed = new Nearby();
  patches.forEach((patch, index) => filed.put(index, around(patch)));
  boxes.forEach((box, i) => {
    if (!box) return;
    for (let j = i + 1; j < boxes.length; j++) {
      const other = boxes[j];
      if (other && overlap(box, other, AIR) > 0) clashes.push([i, j]);
    }
    for (const j of filed.near(box)) if (j !== i && into(box, patches[j]) > 0.12) clashes.push([i, j]);
  });
  patches.forEach((patch, i) => {
    for (const j of filed.near(around(patch))) {
      // Partners share a fork and are drawn to overlap there
      if (j <= i || (leaves[i].x === leaves[j].x && leaves[i].y === leaves[j].y)) continue;
      if (Math.hypot(patch.x - patches[j].x, patch.y - patches[j].y) < 0.62 * (patch.r + patches[j].r)) clashes.push([i, j]);
    }
  });
  return clashes;
}

/* ---------- How large the tree has to be ---------- */

/* The leaves and branches of an arranged family, as the names see them, deepest generation first: those have the least room and choose before the others. */
export function drawingOf<Node extends Fork<Node>>(root: Node, rnd: Chance): { leaves: Leafage[]; twigs: Twig[]; knots: Knot[] } {
  const found: { depth: number; leaf: Leafage }[] = [], twigs: Twig[] = [], knots: Knot[] = [];
  const walk = (n: Node, dir: Point): void => {
    const angle = Math.atan2(dir.x, -dir.y);
    for (const { offset, scale, tag } of n.hung) found.push({ depth: n.depth, leaf: { x: n.tx, y: n.ty, angle: angle + offset, scale, body: LEAF_BODY, face: false, tag } });
    if (n.hung.length > 1) knots.push({ x: n.tx, y: n.ty, r: 10 });
    for (const child of n.children) {
      const curve = curveOf(child.id, { x: n.tx, y: n.ty }, dir, { x: child.tx, y: child.ty }, child.ttheta, rnd);
      twigs.push(twigOf(curve.bz, branchWidth(child.count) / 2));
      walk(child, curve.dir);
    }
  };
  walk(root, { x: 0, y: -1 });
  found.sort((a, b) => b.depth - a.depth);
  return { leaves: found.map(({ leaf }) => leaf), twigs, knots };
}

/*
 * How far out each generation would stand for every fork to have all the room
 * it would like beside its neighbours on the ring: the roomiest the tree ever
 * needs to be. Where two neighbours stand closer than they would like, their
 * ring moves out until they do not, and no ring is nearer the one inside it
 * than on a small tree.
 */
function roomyRings<Node extends Fork<Node>>(root: Node, rnd: Chance): number[] {
  const byRing: Node[][] = [];
  const gather = (n: Node): void => {
    // In the order of the family, which is the order they stand in
    (byRing[n.depth] ??= []).push(n);
    n.children.forEach(gather);
  };
  gather(root);
  const rings = smallRings(byRing.length);
  // How much of the fan a fork is given depends on how far out its ring is, and that on how close the forks then stand. A few rounds settle it.
  for (let round = 0; round < 4; round++) {
    arrange(root, rings, () => 0.5);
    for (let depth = 1; depth < rings.length; depth++) {
      const ring = byRing[depth];
      let need = Math.max(radiusOf(depth), rings[depth - 1] + radiusOf(depth) - radiusOf(depth - 1));
      for (let i = 1; i < ring.length; i++) {
        const apart = Math.max(ring[i].ttheta - ring[i - 1].ttheta, 1e-6);
        need = Math.max(need, (roomOf(ring[i], ring[i].ttheta) + roomOf(ring[i - 1], ring[i - 1].ttheta)) / 2 / apart);
      }
      rings[depth] = need;
    }
  }
  arrange(root, rings, rnd);
  return rings;
}

/*
 * How far out each generation has to stand for no name to be written over
 * another and no leaf to lie on its neighbour: found by trying. A small
 * family fits on a small tree's rings. A large one is moved out towards where
 * everyone has all the room they would like, and back in, until it only just
 * fits.
 */
export function ringsFor<Node extends Fork<Node>>(root: Node, rnd: Chance): number[] {
  const fitsOn = (rings: readonly number[]): boolean => {
    arrange(root, rings, rnd);
    const { leaves, twigs, knots } = drawingOf(root, rnd);
    return !clashesIn(leaves, placeNames(leaves, twigs, knots)).length;
  };
  let roomy = roomyRings(root, rnd);
  const small = smallRings(roomy.length);
  if (fitsOn(small)) return small;
  // Where even all the room they asked for leaves two names touching, a little more
  for (let tries = 0; tries < 4 && !fitsOn(roomy); tries++) roomy = roomy.map((ring) => ring * 1.1);
  const partWay = (part: number): number[] => small.map((ring, depth) => ring + (roomy[depth] - ring) * part);
  let tight = 0, fits = 1;
  for (let round = 0; round < 5; round++) {
    const between = (tight + fits) / 2;
    if (fitsOn(partWay(between))) fits = between;
    else tight = between;
  }
  return partWay(fits);
}
