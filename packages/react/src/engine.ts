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
 *
 * This is the engine on its own: plain DOM and no React, because what it
 * writes on every frame has to go straight to the page. FamilyTree.tsx wraps
 * it in a component. It is the demo's tree-view.js with types, in the same
 * order, so the two can be read side by side.
 * Author: George Khananaev
 */

import type { PersonLeaf, Relation, TreePerson, TreeSnapshot, TreeUnion } from '@reactive-family-tree/core';
import { SHAPES, THIS_YEAR, goldOf, stateOf } from './leaf';
import type { LeafShape, LeafState, ShapeName } from './leaf';
import { litOutline, moonFor, skyOver } from './sky';
import type { MoonChoice } from './sky';
import type { Place } from './sky';
import { PONDS, startLeap } from './pond';
import type { Pond, PondChoice } from './pond';
import { LEAF_BODY, NAME_SIZE, SPACING, YEARS_SIZE, arrange, bez, branchWidth, curveOf, linesOf, norm, placeNames, radiusOf, ringsFor, twigOf, widthOf } from './layout';
import type { Bezier, Body, Fork, Hung, Knot, Leafage, NameTag, Point, Twig } from './layout';

const NS = 'http://www.w3.org/2000/svg';
const TRUNK = 160;
const MOON_RADIUS = 59;                 // of the moon's disc, in its own drawing, which is 120 across
const FAR_DRIFT = 0.25;                 // how much of the tree's movement across the screen the sun and the moon follow
const FAR_GROWTH = 0.3;                 // how much of a zoom they follow: twice as near makes them a quarter larger
const ROOT_SEED = 0.1;                   // the reach of the first root, before any trunk
const ROOT_EASE = 1.6;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3.2;
const FAR_ZOOM = 0.3;                    // further out than this on a small tree, and the names are too small to read and step aside
const MID_ZOOM = 0.44;                   // further out than this, and the years under them do
const ZOOM_REACH = 1.5;                  // a larger tree keeps its names to that much further out, and no further

const GRAFT_SHAPES: readonly ShapeName[] = ['olive', 'ginkgo', 'linden'];
const RELATIONS: readonly Relation[] = ['child', 'partner', 'parent', 'sibling'];

/*
 * The moon: a dark disc and the lit part over it, plain, as it looks from a
 * distance. paintSky() gives the lit part its outline, turned the way it is
 * seen tonight.
 */
const MOON = '<i class="halo"></i><svg class="disc" viewBox="-60 -60 120 120">' +
  `<radialGradient id="moonFace" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${MOON_RADIUS}"><stop class="moon-middle" offset="0.3"/><stop class="moon-edge" offset="1"/></radialGradient>` +
  `<circle class="unlit" r="${MOON_RADIUS}"/><path class="lit"/></svg>`;

/* How much of the warm light of the horizon something has, from 0 to 1 by how high it stands: all of it within a few degrees of the horizon, none a hand's width above it or once it is well down. */
const lowLight = (height: number | null): number => (height === null ? 0 : Math.max(0, Math.min(1, (14 - height) / 10, (height + 6) / 5)));

/* ---------- What the engine is given, and what it tells ---------- */

/*
 * select(person | null)            a leaf was tapped, or the open ground
 * add({ person, relation })        a + bud was tapped or pulled out
 * hold({ person, x, y, keyboard }) a leaf was long-pressed, right-clicked, or its menu key pressed
 * holdMove(x, y), holdEnd(x, y)    where the finger that is still down went, and where it lifted
 * moved()                          the camera moved
 */
export interface TreeEngineEvents {
  select(person: TreePerson | null): void;
  add(detail: { person: TreePerson; relation: Relation }): void;
  hold?(detail: { person: TreePerson; x: number; y: number; keyboard?: boolean }): void;
  holdMove?(x: number, y: number): void;
  holdEnd?(x: number, y: number): void;
  moved?(): void;
}

/* The words the tree writes on itself. A page in another language gives its own. */
export interface TreeLabels {
  /* The bud at the end of a folded branch, for a screen reader. */
  showBranch: string;
  /* A living relative kept private, for a screen reader. */
  livingRelative: string;
  /* Someone whose name nobody has written down. */
  unknown: string;
  /* Under a leaf in place of its years: a draft only its author sees, or a suggestion waiting for review. */
  draft: string;
  suggested: string;
  /* The word under each + bud, and on the twig while one is pulled out. */
  relations: Readonly<Record<Relation, string>>;
  /* What a + bud is called, for a screen reader. */
  addRelation(relation: Relation): string;
}

const ENGLISH: TreeLabels = {
  showBranch: 'Show this branch',
  livingRelative: 'Living relative',
  unknown: 'Unknown',
  draft: 'draft',
  suggested: 'suggested',
  relations: { child: 'child', partner: 'partner', parent: 'parent', sibling: 'sibling' },
  addRelation: (relation) => `Add ${relation}`,
};

export interface TreeEngineOptions {
  stage: HTMLElement;
  world: HTMLElement;
  svg: SVGSVGElement;
  on: TreeEngineEvents;
  /* Where someone's photo is, if they have one. Asked only while faces are shown. */
  portraitOf?(person: PersonLeaf): string | null;
}

/* The family as the engine needs it: the people, how they are joined, and whose family to start from. */
export type TreeData = Pick<TreeSnapshot, 'people' | 'unions' | 'rootId'>;

/* Where the tree's origin (the top of the trunk) is on the stage, and how far it is zoomed. */
export interface Camera {
  x: number;
  y: number;
  k: number;
}

/* Space taken by an open side panel and a banner, kept clear when fitting. A page read from the right opens its panel on the left. */
export interface TreeInsets {
  right: number;
  top: number;
  left?: number;
}

export interface BranchState {
  collapsed: boolean;
}

export interface YearRange {
  min: number;
  max: number;
}

/* ---------- The parts of the drawing ---------- */

/* The pen a branch is drawn with: its own grain, the length that grain is spread along, and how rough it is. */
interface Ink {
  seed: number;
  length: number;
  amount: number;
}

interface Area {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface Partner {
  person: TreePerson;
  union: TreeUnion;
}

/* One place on the tree: a person, with their partners beside them and their children further out. layout() says how much of the family hangs here and where the node is heading. */
interface TreeNode extends Fork<TreeNode> {
  person: TreePerson;
  parent: TreeNode | null;
  partners: Partner[];
  /* layout(): the leaves here, the person's first, with how far each leans, its size and its name */
  hung: Hung[];
  /* setData(): where it comes from, and how far its branch has grown */
  inked: boolean;
  p: number;
  fx: number;
  fy: number;
  ftheta: number;
  blossomOn: boolean;
  /* pose(): where it is now, and the shape of the branch that reaches it. The root has no branch. */
  x: number;
  y: number;
  theta: number;
  dir: Point;
  bz?: Bezier;
  w0: number;
  w1: number;
  duration: number;
  ink?: Ink;
  /* rebuild(): what is drawn for it */
  pathEl?: SVGPathElement;
  leaves: Leaf[];
  blossomEl?: SVGGElement;
  budEl?: SVGGElement;
  budWaiting?: number;
}

interface Leaf {
  person: TreePerson;
  node: TreeNode;
  offset: number;
  scale: number;
  isPartner: boolean;
  el: SVGGElement;
  on: boolean;
  state: LeafState;
  fresh: boolean;
  inked: boolean;
  angle: number;
  /* Their photo, once faces have been asked for and they have one. It stays upright while the leaf leans along its branch. */
  face?: SVGGElement;
  labelEl?: SVGGElement | null;
  yearsEl?: SVGTextElement | null;
  yearsNow?: string;
}

interface Root {
  b: Bezier;
  width: number;
  birth: number;
  span: number;
  ink: Ink;
  el: SVGPathElement;
  drawn?: string;
}

/* A + bud remembers which relative it adds, and where on its leaf the twig starts when it is pulled out. */
type HandleElement = SVGGElement & { relation: Relation; origin: Point };

type LayerName = 'back' | 'roots' | 'branches' | 'blossoms' | 'leaves' | 'fallen' | 'labels' | 'handles';

/* Where a glide is heading, which glide it is, and when it will be there. */
interface CameraGoal extends Camera {
  run: number;
  until: number;
}

/* The zoom a turning wheel is easing towards, and the point on the stage that stays put under the pointer. */
interface ZoomGoal {
  k: number;
  x: number;
  y: number;
}

type Timer = ReturnType<typeof setTimeout>;

/* ---------- Small helpers ---------- */

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string>, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (parent) parent.appendChild(node);
  return node;
}

/* The nearest thing matching the selector around whatever was touched, if what was touched is an element at all. */
function closest<E extends Element = Element>(target: EventTarget | null, selector: string): E | null {
  return target instanceof Element ? target.closest<E>(selector) : null;
}

/* A masked leaf has only an id. Everything else is read through this, and reads as nothing when the leaf is masked. */
const unmasked = (person: TreePerson | undefined): PersonLeaf | undefined => (person?.masked ? undefined : person);

/* How large someone's leaf is drawn: small for a small child, in between for the young. With no birth year on record, full size. */
function scaleOf(person: TreePerson): number {
  const born = unmasked(person)?.born ?? -Infinity;
  return born >= THIS_YEAR - 5 ? 0.58 : born >= THIS_YEAR - 18 ? 0.8 : 1;
}

function hash(text: string): number {
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
const rnd = (id: string, salt: string): number => hash(`${id}|${salt}`);

function bezTangent(b: Bezier, t: number): Point {
  const u = 1 - t;
  return norm({
    x: 3 * u * u * (b[1].x - b[0].x) + 6 * u * t * (b[2].x - b[1].x) + 3 * t * t * (b[3].x - b[2].x),
    y: 3 * u * u * (b[1].y - b[0].y) + 6 * u * t * (b[2].y - b[1].y) + 3 * t * t * (b[3].y - b[2].y),
  });
}

/* A small, fast, repeatable noise for the pen-drawn edge of a branch */
function grain(seed: number, i: number): number {
  let n = (seed + Math.imul(i, 374761393)) | 0;
  n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
  n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}
function edgeNoise(seed: number, x: number): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const a = grain(seed, i), b = grain(seed, i + 1);
  return (a + (b - a) * u) * 2 - 1;
}
const inkFor = (id: string, length: number, amount = 1): Ink => ({ seed: Math.floor(hash(id) * 2147483647), length, amount });

/*
 * A filled, tapered outline of the first `t` of a curve, with a pointed growing
 * tip and a slightly uneven, pen-drawn edge that is part of the shape itself.
 * A finished branch ends square so it meets the next one without a notch.
 * This runs for every growing branch on every frame, so it is written plainly.
 */
function outline(b: Bezier, widthAt: (s: number) => number, t: number, ink: Ink, squareEnd: boolean): string {
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

const easeOut = (t: number): number => 1 - Math.pow(1 - t, 2.2);

/*
 * A leaf, as markup. Built from fixed markup only, never from anything a person typed. The same goes for every
 * piece of markup in this file: it is made of fixed strings and numbers, and names reach the page through
 * textContent. LeafPortrait.tsx draws this same leaf as elements.
 */
/*
 * A face is about as wide as its leaf is long, and sits far enough out along
 * it that partners, whose leaves share a fork, stay clear of each other. A
 * short stem reaches it. tree.css moves a leaf's rings out by the same amount.
 */
const FACE_CENTRE = -49;
export const FACE_RADIUS = 28;

/* What a name has to keep clear of where a round photo stands in for the leaf. */
const FACE_BODY: Body = { patchAt: -FACE_CENTRE, patch: FACE_RADIUS + 2, mid: -FACE_CENTRE, reach: FACE_RADIUS - FACE_CENTRE, half: FACE_RADIUS };

function leafMarkup(shape: LeafShape, depth: number, goldIndex: number): string {
  return '<circle class="glow cool" cx="0" cy="-36" r="46" fill="url(#leafGlow)"/>' +
    '<circle class="glow warm" cx="0" cy="-36" r="46" fill="url(#warmGlow)"/>' +
    '<circle class="you-ring" cx="0" cy="-36" r="40"/>' +
    '<circle class="tint-ring" cx="0" cy="-36" r="34"/>' +
    '<circle class="pulse" cx="0" cy="-36" r="30"/>' +
    '<path class="stem" d="M0,0 L0,-12"/>' +
    `<path class="stem face-stem" d="M0,-12 L0,${FACE_CENTRE + FACE_RADIUS}"/>` +
    `<path class="hatch" d="${shape.d}" fill="url(#hatch)"/>` +
    `<path class="blade g${Math.min(depth, 4)} au${goldIndex}" d="${shape.d}"/>` +
    `<path class="wash" d="${shape.d}" fill="url(#wash)"/>` +
    `<path class="vein" d="${shape.v}"/>`;
}

const BLOSSOM = Array.from({ length: 5 }, (_, i) => `<ellipse class="petal" cx="0" cy="-6.5" rx="3.6" ry="5.6" transform="rotate(${i * 72})"/>`).join('') +
  '<circle class="blossom-heart" r="2.4"/>';

/* ---------- The view ---------- */

export class TreeEngine {
  /* Reduced motion, or `#still` in the address: everything is shown at once, and nothing moves by itself. */
  readonly still: boolean;
  /* Read these freely. Change them through setEditing(), setSelected() and setInsets(), and the camera through the methods that move it. */
  editing: boolean;
  selectedId: string | null;
  insets: TreeInsets;                 // space taken by an open side panel and a banner, kept clear when fitting
  cam: Camera;

  private readonly stage: HTMLElement;
  private readonly world: HTMLElement;
  /* Where the sun, the moon and the stars are drawn: a layer of the stage that the camera does not move. */
  private readonly heavens: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly on: TreeEngineEvents;
  private readonly portraitOf: TreeEngineOptions['portraitOf'];
  private faces = false;
  private labels = ENGLISH;
  /* How much roomier or tighter than it comes the family asked the tree to be. */
  private spacing = 1;
  /* How far out each generation stands before that, found when the family last changed, and how many times larger than a small tree this one now is. */
  private rings: number[] = [];
  private grown = 1;
  /* For measuring names as the page's own fonts write them, and what has been measured since the fonts last changed. */
  private readonly pen = document.createElement('canvas').getContext('2d');
  private fonts: Record<'name' | 'years', string> | null = null;
  private readonly widths = new Map<string, number>();

  private year: number;
  private hoverId: string | null;
  private readonly collapsed: Set<string>;
  private nodes: TreeNode[];
  private leaves: Leaf[];
  private leafOf: Map<string | null, Leaf>; // person id -> their main leaf. Asked for `null` when nobody is chosen, and nobody is found
  private readonly trunk: { p: number; ink: Ink };
  private shift: number;              // 0 to 1 while everyone moves to make room after a change
  private rootReach: number;
  private bounds: Area;
  private userMoved: boolean;
  private cameraRun: number;
  private sharpAt: number;
  private readonly velocity: Point;
  private readonly pointers: Map<number, { x: number; y: number; sx: number; sy: number }>;
  private stageBox: DOMRect;
  private wasOn: Set<string>;         // leaves that were showing before the last change, so they do not unfurl again
  private freshIds: Set<string>;      // people who have just arrived
  private matches: ReadonlySet<string> | null; // people a search is pointing at
  private route: [string, string] | null; // two people whose connection is lit

  private readonly layer: Record<LayerName, SVGGElement>;
  private readonly trunkPath: SVGPathElement;
  private readonly twig: SVGPathElement;
  private readonly twigTip: SVGGElement;

  /* What plain JavaScript left unset until it was first needed */
  private viewerId: string | null = null;
  private people = new Map<string, TreePerson>();
  private unions: TreeUnion[] = [];
  private tints: ReadonlyMap<string, string> | null = null;
  private roots: Root[] = [];
  private shiftStart = 0;
  private running = false;
  private growing = false;
  private moving = false;
  private last = 0;
  private readonly arrived = new Set<string>();   // the addresses of photos that have loaded once
  private decorated = false;
  /* The sun, the moon and the sheet of stars, each with the spot on the tree it is counted from. The stars also say how large their sheet is. */
  private far: { el: HTMLElement; x: number; y: number; sheet: { w: number; h: number } | null }[] = [];
  /* Where the family is, if the tree has been told. The moon is turned as it is seen from there. */
  private place: Place | null = null;
  /* Which moon the family chose to show after dark. */
  private moon: MoonChoice = 'tonight';
  /* The pond beside the tree while one is shown, with its drawing, and which run of leaps is the live one: a change of pond starts a new run and ends the old. */
  private pond: { kind: Pond; drawing: SVGSVGElement } | null = null;
  private leaps = 0;
  /* A pond out of sight rests: whatever moves in it stops where it is until it is looked at again. */
  private readonly pondWatch = new IntersectionObserver((sightings) => {
    const drawing = this.pond?.drawing, seen = sightings.at(-1)?.isIntersecting ?? true;
    if (!drawing) return;
    drawing.classList.toggle('unseen', !seen);
    if (seen) drawing.unpauseAnimations();
    else drawing.pauseAnimations();
  });
  private skyClock: ReturnType<typeof setInterval> | undefined;
  private cameraQueued = false;
  private goal: CameraGoal | null = null;
  private zoomGoal: ZoomGoal | null = null;
  private zoomRunning = false;
  private moveTimer: Timer | undefined;

  /* Kept only so that destroy() can stop them */
  private readonly abort = new AbortController();
  private readonly resizer: ResizeObserver;
  private readonly timers = new Set<Timer>();
  private frameId = 0;
  private cameraFrame = 0;

  constructor({ stage, world, svg, on, portraitOf }: TreeEngineOptions) {
    this.stage = stage;
    this.world = world;
    this.heavens = stage.querySelector<HTMLElement>('.heavens')!;   // part of the markup the engine is given, as .behind and .ahead are
    this.svg = svg;
    this.on = on;
    this.portraitOf = portraitOf;
    this.still = /(?:^|[#&])still(?:&|$)/.test(location.hash) || matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The real sky changes slowly. Once a minute keeps the moon and the sun right on a page that is left open.
    if (!this.still) this.skyClock = setInterval(() => this.paintSky(), 60_000);
    document.documentElement.classList.toggle('still', this.still);

    this.year = THIS_YEAR;
    this.editing = false;
    this.selectedId = null;
    this.hoverId = null;
    this.collapsed = new Set();
    this.nodes = [];
    this.leaves = [];
    this.leafOf = new Map();
    this.trunk = { p: 0, ink: inkFor('trunk', TRUNK) };
    this.shift = 1;
    this.rootReach = 0;
    this.bounds = { x0: -900, x1: 900, y0: -820, y1: TRUNK + 150 };
    this.cam = { x: 0, y: 0, k: 1 };
    this.userMoved = false;
    this.cameraRun = 0;
    this.sharpAt = 0;
    this.velocity = { x: 0, y: 0 };
    this.pointers = new Map();
    this.stageBox = stage.getBoundingClientRect();
    this.insets = { right: 0, top: 0 };
    this.wasOn = new Set();
    this.freshIds = new Set();
    this.matches = null;
    this.route = null;

    const layer = (name: LayerName): SVGGElement => el('g', { class: `layer-${name}` }, svg);
    this.layer = {
      back: layer('back'), roots: layer('roots'), branches: layer('branches'), blossoms: layer('blossoms'),
      leaves: layer('leaves'), fallen: layer('fallen'), labels: layer('labels'), handles: layer('handles'),
    };
    this.trunkPath = el('path', { class: 'branch trunk' }, this.layer.branches);
    this.twig = el('path', { class: 'twig' }, this.layer.handles);
    this.twigTip = el('g', { class: 'twig-tip' }, this.layer.handles);
    this.twigTip.innerHTML = `<path class="twig-leaf" d="${SHAPES.beech.d}" transform="scale(0.6)"/><text class="handle-label" text-anchor="middle" y="26"></text>`;
    this.buildRoots();
    this.listen();
    // A font that arrives after the names were written writes them a little wider or narrower, so they are measured and placed again
    document.fonts.addEventListener('loadingdone', () => {
      this.widths.clear();
      if (this.shift >= 1 && this.leaves.length) this.placeLabels();
    }, { signal: this.abort.signal });
    this.gustSoon(5200);
    this.resizer = new ResizeObserver(() => {
      if (!this.userMoved) return this.fit();
      // A tree that was moved by hand keeps its place. The room it stands in is still measured anew, so that what goes by that
      // room goes by it as it is now: the sky, the way to a leaf, the middle a zoom holds, where a card may open. And a phone
      // turned on its side does not leave the tree out of sight.
      this.stageBox = this.stage.getBoundingClientRect();
      this.paintCamera();
      this.keepInReach();
    });
    this.resizer.observe(stage);
  }

  /* ---------- Data ---------- */

  /* The tree as the server sent it. `viewerId` is the leaf of the person signed in. */
  setData(tree: TreeData, { viewerId = null, focusId = null }: { viewerId?: string | null; focusId?: string | null } = {}): void {
    const people = new Map(tree.people.map((p): [string, TreePerson] => [p.id, p]));
    const before = new Map(this.nodes.map((n): [string, TreeNode] => [n.id, n]));
    const known = new Set(this.people.keys());
    const oldLeaves = this.leaves;
    const firstTime = !this.nodes.length;
    this.viewerId = viewerId;
    this.people = people;
    this.unions = tree.unions;

    const rootId = this.topOf(focusId && people.has(focusId) ? focusId : tree.rootId);
    this.nodes = rootId ? this.buildNodes(rootId) : [];
    // With nobody on it, as when someone signs out of a private tree, there is no trunk standing either. It grows again with the family.
    if (!this.nodes.length) this.trunk.p = 0;
    this.layout();

    this.wasOn = new Set(oldLeaves.filter((leaf) => leaf.on).map((leaf) => `${leaf.person.id}@${leaf.node.id}`));
    const inkedFrom = new Set<string>();
    let moved = false;
    for (const n of this.nodes) {
      const { parent } = n;
      let old = before.get(n.id);
      // Someone who was only pencilled in and is now approved takes the pencil leaf's place and turns to ink
      n.inked = false;
      if (!old && !unmasked(n.person)?.pending && parent) {
        old = [...before.values()].find((o) => unmasked(o.person)?.pending && o.parent?.id === parent.id && unmasked(o.person)?.given === unmasked(n.person)?.given);
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
    const arrived = [...people.keys()].filter((id) => !known.has(id) && !people.get(id)?.masked);
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
  private dropLeaves(leaves: Leaf[]): void {
    for (const leaf of leaves) {
      const wrap = el('g', { class: unmasked(leaf.person)?.pending ? 'erased' : 'falling' }, this.layer.fallen);
      const copy = leaf.el.cloneNode(true) as SVGGElement;   // a copy of a <g> is a <g>
      copy.removeAttribute('tabindex');
      wrap.appendChild(copy);
      this.later(() => wrap.remove(), 1300);
    }
  }

  /* Give an element a class for a moment, for an effect that plays once. */
  private flash(element: Element, name: string, ms: number): void {
    if (this.still) return;
    element.classList.add(name);
    this.later(() => element.classList.remove(name), ms);
  }

  /* The top of someone's family: up through their birth family's host until nobody is recorded. */
  private topOf(personId: string | null): string | null {
    const seen = new Set<string>();
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
  private buildNodes(rootId: string): TreeNode[] {
    const list: TreeNode[] = [];
    const seen = new Set<string>();
    const bornOf = (id: string): number => unmasked(this.people.get(id))?.born ?? Infinity;
    const grow = (personId: string, depth: number, parent: TreeNode | null): TreeNode => {
      seen.add(personId);
      const node: TreeNode = {
        // Children are looked up before they are grown. The root is whoever the server names, and is taken to be among the people it sent
        id: personId, person: this.people.get(personId)!, depth, parent, partners: [], children: [], leaves: [], hung: [],
        // Filled in by layout(), setData() and pose() before anything reads them
        count: 0, weight: 0, tx: 0, ty: 0, ttheta: 0, inked: false, p: 0, fx: 0, fy: 0, ftheta: 0, blossomOn: false,
        x: 0, y: 0, theta: 0, dir: { x: 0, y: -1 }, w0: 0, w1: 0, duration: 0,
      };
      list.push(node);
      const unions = this.unions.filter((u) => u.partners.includes(personId))
        .sort((a, b) => (a.since ?? bornOf(a.children[0]?.id)) - (b.since ?? bornOf(b.children[0]?.id)));
      for (const union of unions) {
        const partnerId = union.partners.find((id) => id !== personId);
        const partner = partnerId && this.people.get(partnerId);
        if (partner) node.partners.push({ person: partner, union });
        const kids = union.children.map((c) => c.id).filter((id) => this.people.has(id) && !seen.has(id))
          .sort((a, b) => bornOf(a) - bornOf(b) || (a < b ? -1 : 1));
        for (const kid of kids) if (!seen.has(kid)) node.children.push(grow(kid, depth + 1, node));
      }
      return node;
    };
    grow(rootId, 0, null);
    return list;
  }

  /*
   * Generations on rings, the order of the family as the angle. Sets where each node is heading. How far out the rings
   * stand is worked out again only when asked, as when the family has changed: making the tree roomier or tighter keeps it.
   */
  private layout(family = true): void {
    const root = this.nodes[0];
    if (!root) return;
    if (family) {
      for (const n of this.nodes) {
        // A partner's leaf leans away from the person's. Alone, someone with children leans to one side of the branch that goes on to them.
        const offsets = n.partners.length ? [-0.66, ...n.partners.map((_, i) => 0.66 + i * 0.6)]
          : n.children.length ? [rnd(n.id, 's') > 0.5 ? 0.7 : -0.7] : [0];
        n.hung = [n.person, ...n.partners.map((partner) => partner.person)].map((person, i) => ({ offset: offsets[i], scale: scaleOf(person), tag: this.tagOf(person) }));
      }
      this.rings = ringsFor(root, rnd);
    }
    const rings = this.rings.map((ring) => ring * this.spacing), last = rings.length - 1;
    arrange(root, rings, rnd);
    this.grown = last ? rings[last] / radiusOf(last) : 1;
  }

  /* What is written beside someone's leaf, and how wide the page's fonts write it. A private relative is an unnamed leaf. */
  private tagOf(person: TreePerson): NameTag | null {
    if (person.masked) return null;
    const lines = linesOf(this.nameOf(person));
    // The years as wide as they will ever be written: someone who has died has both years once the slider is past the second
    const years = person.pending ? this.yearsOf(person) : person.born ? (person.died ? `${person.born}–${person.died}` : String(person.born)) : '';
    return { lines, years: Boolean(years), width: Math.max(...lines.map((line) => this.measured(line, 'name')), years ? this.measured(years, 'years') : 0) };
  }

  /* How wide the page writes a name, or the years under one. Where it cannot be asked, by counting letters. */
  private measured(text: string, kind: 'name' | 'years'): number {
    const counted = widthOf(text, kind === 'name' ? NAME_SIZE : YEARS_SIZE);
    if (!this.pen) return counted;
    const key = `${kind}|${text}`;
    let width = this.widths.get(key);
    if (width === undefined) {
      this.fonts ??= this.readFonts();
      this.pen.font = this.fonts[kind];
      width = this.pen.measureText(text).width || counted;
      this.widths.set(key, width);
    }
    return width;
  }

  /* The fonts tree.css gives a name and its years, read from a name that is written for a moment and taken away. */
  private readFonts(): Record<'name' | 'years', string> {
    const probe = el('g', { class: 'label' }, this.layer.labels);
    const fontOf = (kind: 'name' | 'years'): string => {
      const { fontWeight, fontSize, fontFamily } = getComputedStyle(el('text', { class: kind }, probe));
      return `${fontWeight} ${fontSize} ${fontFamily}`;
    };
    const fonts = { name: fontOf('name'), years: fontOf('years') };
    probe.remove();
    return fonts;
  }

  /* Put everyone `e` of the way from where they were to where they are going, and shape the branches. */
  private pose(e: number): void {
    for (const n of this.nodes) {
      n.x = n.fx + (n.tx - n.fx) * e;
      n.y = n.fy + (n.ty - n.fy) * e;
      n.theta = n.ftheta + (n.ttheta - n.ftheta) * e;
      if (!n.parent) {
        n.dir = { x: 0, y: -1 };
        continue;
      }
      const p = n.parent;
      const { bz, dir, length } = curveOf(n.id, { x: p.x, y: p.y }, p.dir, { x: n.x, y: n.y }, n.theta, rnd);
      n.bz = bz;
      n.dir = dir;
      n.w0 = branchWidth(n.count);
      n.w1 = n.children.length ? n.w0 * 0.8 : 2;
      n.duration = Math.max(320, Math.min(700, (480 * length) / 200));
      n.ink = n.ink ?? inkFor(n.id, 1);
      n.ink.length = length * 1.08;
    }
  }

  /* ---------- Drawing ---------- */

  /* Throw away the leaves, branches and names and draw them again for the new family. */
  private rebuild(): void {
    // Where the keyboard is on the tree, so that it is still there once everything is drawn again
    const held = document.activeElement instanceof SVGElement && this.layer.leaves.contains(document.activeElement) ? document.activeElement.getAttribute('data-id') : null;
    for (const name of ['blossoms', 'leaves', 'labels'] as const) this.layer[name].replaceChildren();
    for (const path of [...this.layer.branches.children]) if (path !== this.trunkPath) path.remove();
    this.leaves = [];
    this.leafOf = new Map();

    for (const n of this.nodes) {
      if (n.parent) n.pathEl = el('path', { class: 'branch' }, this.layer.branches);
      n.leaves = [n.person, ...n.partners.map((partner) => partner.person)].map((person, i) => this.makeLeaf(person, n, n.hung[i], i > 0));
      if (n.partners.length) {
        n.blossomEl = el('g', { class: `blossom${n.blossomOn ? ' on' : ''}` }, this.layer.blossoms);
        n.blossomEl.innerHTML = `<g class="unfurl">${BLOSSOM}</g>`;
      }
      if (n.children.length) {
        n.budEl = el('g', { class: 'bud', 'data-node': n.id, tabindex: '-1', role: 'button', 'aria-label': this.labels.showBranch }, this.layer.leaves);
        n.budEl.innerHTML = '<g class="unfurl"><circle class="bud-shape" r="18"/><text class="bud-count" text-anchor="middle" y="5.5"></text></g>';
      }
    }
    this.placeElements();
    if (this.shift >= 1) this.placeLabels();
    this.drawTrunk();
    for (const n of this.nodes) if (n.parent) this.drawBranch(n);
    this.svg.classList.toggle('editing', this.editing);
    this.svg.classList.toggle('faces', this.faces);
    this.drawHandles();
    // Whoever was chosen stays chosen, without the ripple of being chosen again
    this.leafOf.get(this.selectedId)?.el.classList.add('selected', 'kept');
    this.setTabStop();
    if (held) this.leafOf.get(held)?.el.focus({ preventScroll: true });
    if (this.tints) this.setTints(this.tints);
    if (this.matches) this.setMatches(this.matches);
    this.paintRoute();
    for (const leaf of this.leaves) if (leaf.inked) this.flash(leaf.el, 'inked', 1600);
  }

  private makeLeaf(person: TreePerson, node: TreeNode, { offset, scale }: Hung, isPartner: boolean): Leaf {
    const shape = SHAPES[isPartner ? GRAFT_SHAPES[Math.floor(hash(unmasked(person)?.birthName || person.id) * GRAFT_SHAPES.length)] : 'beech'];
    // A leaf that was already showing is drawn showing, in its right colour, so nothing unfurls or changes colour twice
    const on = this.wasOn.has(`${person.id}@${node.id}`);
    const state = stateOf(person, this.year);
    const group = el('g', { class: `leaf-node state-${state}${on ? ' on' : ''}`, 'data-id': person.id, tabindex: '-1', role: 'button' }, this.layer.leaves);
    const gustDelay = (node.tx / radiusOf(4) + 1) * 0.6 + rnd(person.id, 'd') * 0.25;
    group.innerHTML = `<g class="unfurl"><g class="sway" style="--dl:${gustDelay.toFixed(2)}s">${leafMarkup(shape, node.depth, goldOf(person.id))}<path class="hit" d="${shape.d}"/></g></g>`;
    group.classList.toggle('you', person.id === this.viewerId);
    group.classList.toggle('outside', unmasked(person)?.editing !== 'apply');
    const leaf: Leaf = { person, node, offset, scale, isPartner, el: group, on, state, fresh: this.freshIds.has(person.id), inked: !isPartner && node.inked, angle: 0 };
    this.leaves.push(leaf);
    if (!isPartner || !this.leafOf.has(person.id)) this.leafOf.set(person.id, leaf);
    if (this.faces) this.addFace(leaf);
    return leaf;
  }

  /*
   * A round photo over the leaf, for someone who has one. The leaf steps back
   * only once the photo has arrived, and comes back if it never does.
   */
  private addFace(leaf: Leaf): void {
    const person = unmasked(leaf.person);
    const address = person?.portrait ? this.portraitOf?.(person) : null;
    const sway = leaf.el.querySelector('.sway');
    if (!address || !sway || leaf.face) return;
    const face = el('g', { class: 'face' });
    const inner = el('g', { class: 'face-in' }, face);
    // An edge in the colour of the page, so that where two faces meet they read as one in front of the other
    el('circle', { class: 'face-edge', r: String(FACE_RADIUS + 2.6) }, inner);
    const photo = el('image', { href: address, x: String(-FACE_RADIUS), y: String(-FACE_RADIUS), width: String(FACE_RADIUS * 2), height: String(FACE_RADIUS * 2), 'clip-path': 'url(#faceClip)', preserveAspectRatio: 'xMidYMid slice' }, inner);
    el('circle', { class: 'face-ring', r: String(FACE_RADIUS) }, inner);
    // A photo that has arrived before is in the browser's keeping. Drawn again with the tree, it is there from the start,
    // and does not step in a second time over a leaf that shows for a moment.
    if (this.arrived.has(address)) leaf.el.classList.add('has-face');
    photo.addEventListener('load', () => {
      this.arrived.add(address);
      leaf.el.classList.add('has-face');
    }, { once: true });
    photo.addEventListener('error', () => {
      this.arrived.delete(address);
      leaf.el.classList.remove('has-face');
      face.remove();
      leaf.face = undefined;
    }, { once: true });
    sway.insertBefore(face, sway.querySelector('.hit'));
    leaf.face = face;
    this.turnFace(leaf);
  }

  /* Keep a face level, whatever way its leaf leans. */
  private turnFace(leaf: Leaf): void {
    leaf.face?.setAttribute('transform', `translate(0 ${FACE_CENTRE}) rotate(${((-leaf.angle * 180) / Math.PI).toFixed(1)})`);
  }

  /* Show people's photos in place of their leaves, or go back to leaves. */
  setFaces(faces: boolean): void {
    if (faces === this.faces) return;
    this.faces = faces;
    this.svg.classList.toggle('faces', faces);
    if (faces) for (const leaf of this.leaves) this.addFace(leaf);
    // A face reaches further than a leaf, so the names step out of its way, and back
    if (this.shift >= 1) this.placeLabels();
  }

  /* The words the tree writes on itself. Any left out are in English. */
  setLabels(labels: Partial<TreeLabels> = {}): void {
    this.labels = { ...ENGLISH, ...labels };
    // What is drawn already is written again in the new words
    for (const n of this.nodes) n.budEl?.setAttribute('aria-label', this.labels.showBranch);
    for (const leaf of this.leaves) {
      leaf.yearsNow = undefined;
      this.syncLeaf(leaf, leaf.on);
    }
    if (this.shift >= 1) this.placeLabels();
    this.drawHandles();
  }

  /* The tree is one stop for the Tab key. Arrow keys travel from there along the family. */
  private setTabStop(personId: string | null = this.selectedId ?? this.viewerId): void {
    const stop = this.leafOf.get(personId) ?? this.nodes[0]?.leaves[0];
    for (const leaf of this.leaves) leaf.el.setAttribute('tabindex', leaf === stop ? '0' : '-1');
  }

  /* Put the keyboard on the tree, on the leaf the Tab key would reach. */
  focus(): void {
    this.svg.querySelector<SVGGElement>('.leaf-node[tabindex="0"]')?.focus({ preventScroll: true });
  }

  /* The relative an arrow key leads to: Up to a child, Down to a parent, sideways along partners and siblings. */
  private neighbour(leaf: Leaf, key: string): Leaf | null {
    const n = leaf.node, showing = (candidate: Leaf | undefined): Leaf | null => (candidate?.on ? candidate : null);
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
  private placeElements(): void {
    for (const n of this.nodes) {
      const base = Math.atan2(n.dir.x, -n.dir.y);
      for (const leaf of n.leaves) {
        leaf.angle = base + leaf.offset;
        leaf.el.setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)}) rotate(${((leaf.angle * 180) / Math.PI).toFixed(1)}) scale(${leaf.scale})`);
        this.turnFace(leaf);
      }
      if (n.blossomEl) n.blossomEl.setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`);
      if (n.budEl) n.budEl.setAttribute('transform', `translate(${(n.x + n.dir.x * 86).toFixed(1)} ${(n.y + n.dir.y * 86).toFixed(1)})`);
    }
  }

  /*
   * Write each name beside its leaf, where it is in the way of the least. Leaves in a folded branch are not there to be
   * kept clear of, and get their names when the branch is opened.
   */
  private placeLabels(): void {
    this.layer.labels.replaceChildren();
    const showing = this.leaves.filter((leaf) => !this.hiddenByCollapse(leaf.node)).sort((a, b) => b.node.depth - a.node.depth);
    const seen = new Set(showing);
    for (const leaf of this.leaves) if (!seen.has(leaf)) leaf.labelEl = leaf.yearsEl = null;
    const leafage = showing.map((leaf): Leafage => {
      const face = this.faces && Boolean(leaf.face);
      return { x: leaf.node.x, y: leaf.node.y, angle: leaf.angle, scale: leaf.scale, body: face ? FACE_BODY : LEAF_BODY, face, tag: this.tagOf(leaf.person) };
    });
    const forks = [...new Set(showing.map((leaf) => leaf.node))];
    // Every node below the root has a branch, shaped by pose()
    const twigs = forks.filter((n) => n.parent).map((n): Twig => twigOf(n.bz!, n.w0 / 2));
    const knots = forks.filter((n) => n.blossomEl).map((n): Knot => ({ x: n.x, y: n.y, r: 10 }));
    placeNames(leafage, twigs, knots).forEach((box, i) => {
      const leaf = showing[i], { tag } = leafage[i];
      leaf.labelEl = leaf.yearsEl = null;
      if (!box || !tag) return;
      leaf.labelEl = el('g', { class: 'label', transform: `translate(${box.x.toFixed(1)} ${box.y.toFixed(1)})` }, this.layer.labels);
      tag.lines.forEach((line, at) => {
        el('text', { class: 'name', 'text-anchor': box.anchor, y: box.lineDy[at].toFixed(1) }, leaf.labelEl!).textContent = line;
      });
      leaf.yearsEl = el('text', { class: 'years', 'text-anchor': box.anchor, y: box.yearsDy.toFixed(1) }, leaf.labelEl);
      leaf.yearsEl.textContent = leaf.yearsNow ?? '';
      leaf.labelEl.classList.toggle('on', leaf.on);
    });
    if (this.matches) this.setMatches(this.matches);
  }

  private nameOf(person: TreePerson): string {
    if (person.masked) return this.labels.livingRelative;
    return person.given || this.labels.unknown;
  }

  private yearsOf(person: TreePerson): string {
    if (person.masked) return '';
    if (person.pending) return person.pending.status === 'draft' ? this.labels.draft : this.labels.suggested;
    if (!person.born) return '';
    return person.died && person.died <= this.year ? `${person.born}–${person.died}` : String(person.born);
  }

  private trunkWidth(s: number): number {
    const top = branchWidth(this.nodes[0]?.count ?? 1) * 0.95;
    return top + top * 1.5 * Math.pow(1 - s, 2.6);
  }

  private drawTrunk(): void {
    const bz: Bezier = [{ x: 0, y: TRUNK }, { x: 9, y: TRUNK * 0.66 }, { x: -7, y: TRUNK * 0.33 }, { x: 0, y: 0 }];
    this.trunkPath.setAttribute('d', outline(bz, (s) => this.trunkWidth(s), easeOut(this.trunk.p), this.trunk.ink, true));
  }

  private drawBranch(n: TreeNode): void {
    // Only ever asked of a node below the root, which pose() has given a curve and its ink, and rebuild() a path
    n.pathEl!.setAttribute('d', outline(n.bz!, (s) => n.w0 + (n.w1 - n.w0) * s, easeOut(n.p), n.ink!, true));
  }

  /* ---------- Roots: a small tree of their own, growing in step with the crown ---------- */

  private buildRoots(): void {
    this.roots = [];
    const add = (b: Bezier, width: number, birth: number, span: number): Root | null => {
      if (birth > 0.95) return null;
      const root: Root = {
        b, width, birth, span: Math.max(0.04, Math.min(span, 1 - birth)),
        ink: inkFor(`root${this.roots.length}`, Math.hypot(b[3].x - b[0].x, b[3].y - b[0].y) * 1.1, 0.7),
        el: el('path', { class: 'root' }, this.layer.roots),
      };
      this.roots.push(root);
      return root;
    };
    /* A root sets off along its heading (0 is straight down), wanders, and turns partway down by its tip. */
    const curve = (id: string, from: Point, heading: number, length: number, sink: number): Bezier => {
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
    const fork = (parent: Root | null, id: string, count: number, level: number): void => {
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

  private drawRoots(): void {
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

  private hiddenByCollapse(n: TreeNode): boolean {
    for (let a = n.parent; a; a = a.parent) if (this.collapsed.has(a.id)) return true;
    return false;
  }

  private nodeVisible(n: TreeNode): boolean {
    if (this.hiddenByCollapse(n)) return false;
    const born = unmasked(n.person)?.born;
    return born ? born <= this.year : !n.parent || this.nodeVisible(n.parent);
  }

  private syncLeaf(leaf: Leaf, on: boolean): void {
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

  private syncNode(n: TreeNode, arrived: boolean): void {
    const on = arrived && this.nodeVisible(n);
    this.syncLeaf(n.leaves[0], on);
    n.partners.forEach((partner, i) => {
      const since = partner.union.since ?? unmasked(partner.person)?.born;
      this.syncLeaf(n.leaves[i + 1], on && (!since || since <= this.year));
    });
    if (n.blossomEl) n.blossomEl.classList.toggle('on', n.leaves.slice(1).some((leaf) => leaf.on));
    if (n.budEl) {
      const waiting = this.collapsed.has(n.id) ? n.children.filter((c) => { const born = unmasked(c.person)?.born; return !born || born <= this.year; }).length : 0;
      n.budEl.classList.toggle('on', on && waiting > 0);
      if (n.budWaiting !== waiting) {
        n.budWaiting = waiting;
        n.budEl.querySelector('.bud-count')!.textContent = `+${waiting}`;   // the bud's own markup, written in rebuild()
      }
    }
  }

  /* ---------- The growth loop: first load, the year slider, a new person, opening a bud ---------- */

  private kick(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.frameId = requestAnimationFrame((now) => this.frame(now));
  }

  private frame(now: number): void {
    // The first frame can be stamped a moment before the loop was started. Time does not run backwards for a branch.
    const dt = Math.max(0, Math.min(50, now - this.last));
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
      } else if ((want && n.p < 1 && parentP >= 1) || (!want && n.p > 0 && n.children.every((child) => child.p <= 0))) {
        // It could move and has not yet. One that waits for its parent to grow, or for its children to go, is kept going by
        // them while they move. Where they never will, as with a child recorded as born before its parent, the loop rests.
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
    if (active || rootsMoving) this.frameId = requestAnimationFrame((time) => this.frame(time));
    else this.running = false;
  }

  /* The first and last year the slider should offer. */
  yearRange(): YearRange {
    const years = [...this.people.values()].map((p) => unmasked(p)?.born).filter((born): born is number => Boolean(born));
    return { min: years.length ? Math.min(...years) : THIS_YEAR - 100, max: THIS_YEAR };
  }

  setYear(year: number): void {
    this.year = year;
    this.kick();
  }

  /* Where the family is. The sun and the moon are drawn as they stand over that place right now. */
  setPlace(place: Place | null): void {
    this.place = place;
    this.paintSky();
  }

  /* Which pond lies beside the tree, if any. While one is shown its koi swim, and now and then one leaps. */
  setPond(choice: PondChoice): void {
    const kind = choice === 'none' ? null : PONDS[choice];
    if (kind === (this.pond?.kind ?? null)) return;
    this.pondWatch.disconnect();
    this.pond?.drawing.remove();
    this.pond = null;
    if (kind) {
      // In front of the tree, over the ground, and under the fireflies
      const drawing = el('svg', { class: 'pond', viewBox: `${kind.box.x} ${kind.box.y} ${kind.box.w} ${kind.box.h}` });
      drawing.innerHTML = kind.markup(this.still);
      this.world.querySelector('.ahead')!.prepend(drawing);
      this.pond = { kind, drawing };
      this.pondWatch.observe(drawing);
      this.leapSoon(++this.leaps, 6000 + Math.random() * 6000);
    }
    // Before the tree is first drawn there is no frame yet. That drawing makes room for the pond.
    if (!this.decorated) return;
    // A wide pond needs more room than a small tree's frame has, and gives it back when it goes
    this.measure();
    this.placePond();
    if (this.userMoved) this.paintCamera();
    else this.fit(false, true);
  }

  /* The pond's drawing lies over the ground at its spot, counted from wherever the tree's frame now begins. */
  private placePond(): void {
    if (!this.pond) return;
    const { kind: { at, box }, drawing } = this.pond, b = this.bounds;
    drawing.style.cssText = `left:${at.x + box.x - b.x0}px;top:${TRUNK + at.y + box.y - b.y0}px;width:${box.w}px;height:${box.h}px`;
  }

  /* Which moon to show after dark: tonight's, a full one, the moon of a day, or none. */
  setMoon(moon: MoonChoice): void {
    this.moon = moon;
    this.paintSky();
  }

  toggleBranch(nodeId: string): void {
    if (this.collapsed.has(nodeId)) this.collapsed.delete(nodeId);
    else this.collapsed.add(nodeId);
    // The names around a folded branch may use its room, and give it back when it opens
    if (this.shift >= 1) this.placeLabels();
    this.kick();
  }

  /*
   * How roomy the tree is: 1 as it comes, more for leaves further apart, less for closer together. Everyone moves to
   * their new place, as after a change to the family, and the names are written again once they are there.
   */
  setSpacing(spacing: number): void {
    const roomy = Math.max(SPACING.min, Math.min(SPACING.max, spacing));
    if (roomy === this.spacing) return;
    this.spacing = roomy;
    // Before the family has arrived there is nobody to move. They are placed this far apart when they do.
    if (!this.nodes.length) return;
    this.layout(false);
    for (const n of this.nodes) {
      n.fx = n.x;
      n.fy = n.y;
      n.ftheta = n.theta;
    }
    this.shift = this.still ? 1 : 0;
    this.shiftStart = performance.now();
    this.pose(this.shift);
    this.placeElements();
    for (const n of this.nodes) if (n.parent) this.drawBranch(n);
    this.layer.labels.replaceChildren();
    if (this.shift >= 1) this.placeLabels();
    this.drawHandles();
    this.measure();
    if (this.userMoved) this.paintCamera();
    else this.fit(false, true);
    this.kick();
  }

  hasBranch(personId: string): BranchState | null {
    const node = this.nodes.find((n) => n.id === personId);
    return node?.children.length ? { collapsed: this.collapsed.has(personId) } : null;
  }

  /* ---------- Selecting and editing ---------- */

  setSelected(personId: string | null): void {
    this.leafOf.get(this.selectedId)?.el.classList.remove('selected', 'kept');
    this.selectedId = personId && this.leafOf.has(personId) ? personId : null;
    this.leafOf.get(this.selectedId)?.el.classList.add('selected');
    this.setTabStop();
    this.refreshLit();
    this.drawHandles();
  }

  /* While searching, the people found keep their colour and everyone else steps back. `null` ends it. */
  setMatches(ids: ReadonlySet<string> | null): void {
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
  setRoute(fromId: string | null = null, toId: string | null = null): void {
    this.route = fromId && toId && this.leafOf.has(fromId) && this.leafOf.has(toId) ? [fromId, toId] : null;
    const along = this.paintRoute();
    if (!along) return;
    // Both ends were found among the leaves a moment ago
    for (const id of this.route ?? []) this.flash(this.leafOf.get(id)!.el, 'glint', 2800);
    // Bring the whole way between the two into view
    const xs = along.map((n) => n.tx), ys = along.map((n) => n.ty);
    this.showArea({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
  }

  private paintRoute(): TreeNode[] | null {
    for (const n of this.nodes) n.pathEl?.classList.remove('route');
    const [a, b] = (this.route ?? []).map((id) => this.leafOf.get(id)?.node);
    if (!a || !b) return null;
    const upFrom = (n: TreeNode | null): TreeNode[] => { const list: TreeNode[] = []; for (; n; n = n.parent) list.push(n); return list; };
    const up = upFrom(a), down = upFrom(b);
    // The two ways down always meet: everyone on the tree hangs from the one root
    const shared = up.find((n) => down.includes(n))!;
    const path = [...up.slice(0, up.indexOf(shared)), ...down.slice(0, down.indexOf(shared)).reverse()];
    path.forEach((n, i) => {
      // Everyone on the way, other than the one the two share, is below the root and so has a branch
      n.pathEl!.style.transitionDelay = `${i * 70}ms`;
      n.pathEl!.classList.add('route');
    });
    return [...path, shared];
  }

  /* Ring each person's leaf in the colour of the steward who looks after them. `tints` maps person id to a colour. */
  setTints(tints: ReadonlyMap<string, string> | null): void {
    this.tints = tints;
    for (const leaf of this.leaves) {
      const colour = tints?.get(leaf.person.id) ?? null;
      leaf.el.classList.toggle('tinted', Boolean(colour));
      leaf.el.style.setProperty('--tint', colour ?? 'transparent');
    }
  }

  setEditing(editing: boolean): void {
    this.editing = editing;
    this.svg.classList.toggle('editing', editing);
    this.drawHandles();
  }

  /* Light the way from the chosen leaf down to the trunk. */
  private refreshLit(): void {
    const target = this.leafOf.get(this.selectedId) ?? this.leafOf.get(this.hoverId);
    for (const n of this.nodes) {
      if (!n.pathEl) continue;
      n.pathEl.classList.remove('lit');
      n.pathEl.style.transitionDelay = '0ms';
    }
    this.trunkPath.classList.toggle('lit', Boolean(target));
    // The light climbs from the trunk, one branch after another
    const chain: TreeNode[] = [];
    for (let n: TreeNode | null | undefined = target?.node; n?.parent; n = n.parent) chain.unshift(n);
    chain.forEach((n, i) => {
      // Only nodes below the root are on the chain, and each of those has a branch
      n.pathEl!.style.transitionDelay = `${(i + 1) * 55}ms`;
      n.pathEl!.classList.add('lit');
    });
  }

  /* In edit mode the chosen leaf grows four small buds: pull one out to add a relative. */
  private drawHandles(): void {
    for (const handle of [...this.layer.handles.querySelectorAll('.handle')]) handle.remove();
    const leaf = this.editing && this.shift >= 1 ? this.leafOf.get(this.selectedId) : null;
    if (!leaf || leaf.person.masked || leaf.person.pending) return;
    const n = leaf.node;
    const dx = Math.sin(leaf.angle), dy = -Math.cos(leaf.angle), px = -dy, py = dx;
    const spots: Record<Relation, [number, number]> = {
      child: [dx * 118, dy * 118], partner: [dx * 46 + px * 74, dy * 46 + py * 74],
      sibling: [dx * 46 - px * 74, dy * 46 - py * 74], parent: [-dx * 44, -dy * 44],
    };
    for (const relation of this.addable(leaf.person.id)) {
      const [ox, oy] = spots[relation];
      const handle: HandleElement = Object.assign(el('g', {
        class: 'handle', 'data-relation': relation, tabindex: '0', role: 'button', 'aria-label': this.labels.addRelation(relation),
        transform: `translate(${(n.x + ox).toFixed(1)} ${(n.y + oy).toFixed(1)})`,
      }, this.layer.handles), { relation, origin: { x: n.x + dx * 30, y: n.y + dy * 30 } });
      handle.innerHTML = '<circle class="handle-shape" r="17"/><path class="handle-plus" d="M-7,0 H7 M0,-7 V7"/>';
      el('text', { class: 'handle-label', 'text-anchor': 'middle', y: '34' }, handle).textContent = this.labels.relations[relation];
    }
  }

  /* ---------- Camera: a transform on the world, moved by the graphics card ---------- */

  private measure(): void {
    const b: Area = { x0: -550, x1: 550, y0: -425, y1: TRUNK + 150 };
    for (const n of this.nodes) {
      // Room for the leaves at each fork and for a name written past them: a long name on the outermost ring is part of the picture too
      const beside = Math.max(150, 104 + Math.max(...n.hung.map(({ tag }) => tag?.width ?? 0)));
      const above = 125 + (n.hung.some(({ tag }) => (tag?.lines.length ?? 0) > 1) ? 24 : 0);
      b.x0 = Math.min(b.x0, n.tx - beside); b.x1 = Math.max(b.x1, n.tx + beside); b.y0 = Math.min(b.y0, n.ty - above);
    }
    // A pond that reaches further right than a small tree's frame is part of the picture too
    if (this.pond) b.x1 = Math.max(b.x1, this.pond.kind.at.x + this.pond.kind.box.x + this.pond.kind.box.w);
    const changed = (['x0', 'x1', 'y0', 'y1'] as const).some((key) => Math.abs(b[key] - this.bounds[key]) > 0.5) || !this.decorated;
    this.bounds = b;
    const width = b.x1 - b.x0, height = b.y1 - b.y0;
    this.svg.setAttribute('viewBox', `${b.x0} ${b.y0} ${width} ${height}`);
    this.svg.setAttribute('width', String(width));
    this.svg.setAttribute('height', String(height));
    this.world.style.width = `${width}px`;
    this.world.style.height = `${height}px`;
    if (changed) this.decorate();
  }

  private paintCamera(): void {
    this.cameraQueued = false;
    const { cam, bounds } = this;
    this.world.style.transform = `translate(${(cam.x + bounds.x0 * cam.k).toFixed(2)}px,${(cam.y + bounds.y0 * cam.k).toFixed(2)}px) scale(${cam.k.toFixed(4)})`;
    const near = cam.k * this.reach;
    const zoom = near < FAR_ZOOM ? 'far' : near < MID_ZOOM ? 'mid' : 'near';
    if (this.svg.getAttribute('data-zoom') !== zoom) this.svg.setAttribute('data-zoom', zoom);
    this.paintFar();
    this.on.moved?.();
  }

  /*
   * The sun, the moon and the stars are a long way off, and so they do not behave as the
   * tree does. Painted onto the tree they would grow as large as the screen
   * when someone comes close, and shrink to a dot beside it when they step
   * back. A thing far away does neither: it keeps its place in the sky and
   * very nearly its size, while the tree in front of it grows and shrinks.
   *
   * So they are kept out of the world the camera moves. Each has a place on
   * the screen, where it stands when the page opens, and a size that goes by
   * the screen and not by the tree. From there it follows only a quarter of
   * the tree's movement and a little of its zoom, which is what a far thing
   * does when the viewer moves. Come close to the tree and it also fades, so
   * that it never sits bright behind the names someone has come to read.
   *
   * Each is drawn at the size it is shown at, and slid by whole dots of the
   * screen. A picture drawn at one size and stretched to another, or set
   * down between two dots, comes out with rough edges.
   */
  private paintFar(): void {
    const home = this.far.length ? this.fitted(false) : null;
    if (!home) return;
    const { cam, stageBox: r } = this, near = cam.k / home.k, dots = devicePixelRatio;
    // The moon's disc is about a thirteenth of the screen's short side: enough to be the moon, not enough to be the subject
    const across = Math.max(44, Math.min(84, Math.min(r.width, r.height) * 0.075));
    const disc = `${(across * near ** FAR_GROWTH).toFixed(1)}px`, fade = Math.max(0.35, Math.min(1, 1 - 0.45 * Math.log2(near))).toFixed(2);
    for (const { el, x, y, sheet } of this.far) {
      const tx = home.x + home.k * x, ty = home.y + home.k * y;   // where the tree has this spot when the page opens
      // The sun and the moon stand there, but never off the screen or under the bar along its top
      const hx = sheet ? tx : Math.max(across + 16, tx), hy = sheet ? ty : Math.max(this.insets.top + across + 64, ty);
      // The stars are further off still, so they follow less
      const drift = sheet ? FAR_DRIFT / 2 : FAR_DRIFT;
      let sx = hx + drift * (cam.x + cam.k * x - tx), sy = hy + drift * (cam.y + cam.k * y - ty);
      if (sheet) {
        // Their sheet is never let shrink to less than the whole screen, nor slide so far that its edge comes into view, or the sky would have an edge
        const grown = Math.max(home.k * near ** (FAR_GROWTH / 2), (1.25 * r.width) / sheet.w, (1.25 * r.height) / sheet.h);
        const reach = { x: (sheet.w * grown) / 2, y: (sheet.h * grown) / 2 };
        sx = Math.max(r.width - reach.x + 1, Math.min(reach.x - 1, sx));
        sy = Math.max(r.height - reach.y + 1, Math.min(reach.y - 1, sy));
        el.style.setProperty('--star', grown.toFixed(4));
      } else {
        el.style.setProperty('--disc', disc);
        el.style.opacity = fade;
      }
      el.style.transform = `translate(${Math.round(sx * dots) / dots}px,${Math.round(sy * dots) / dots}px)`;
    }
  }

  /*
   * The sky. The moon is the one the family chose, tonight's unless it chose
   * another, turned the way it is seen from the family's place, and it glows
   * by how much of it is lit: a full moon far more than a half one. Low over
   * the horizon there it is a little amber, as a rising moon is. The sun is
   * the real one, warmer near sunrise and sunset.
   */
  private paintSky(): void {
    const moon = this.heavens.querySelector<HTMLElement>('.moon');
    if (!moon) return;
    const now = new Date(), shown = moonFor(this.moon, this.place, now);
    this.heavens.classList.toggle('moonless', !shown);
    const { lit, limb, sunHeight, moonHeight } = shown ?? skyOver(now, this.place);
    const part = moon.querySelector('path.lit');
    part?.setAttribute('d', litOutline(lit, MOON_RADIUS));
    part?.setAttribute('transform', `rotate(${limb.toFixed(1)})`);
    moon.style.setProperty('--glow', (0.05 + 0.95 * lit ** 1.5).toFixed(3));
    // A moon under the horizon is drawn as it stands when highest, so it has none of the horizon's colour
    moon.style.setProperty('--low', lowLight(moonHeight !== null && moonHeight > 0 ? moonHeight : null).toFixed(2));
    this.heavens.querySelector<HTMLElement>('.sun')?.style.setProperty('--warm', lowLight(sunHeight).toFixed(2));
  }

  private applyCamera(): void {
    if (this.cameraQueued) return;
    this.cameraQueued = true;
    this.cameraFrame = requestAnimationFrame(() => this.paintCamera());
  }

  private markMoving(): void {
    this.moving = true;
    clearTimeout(this.moveTimer);
    this.moveTimer = setTimeout(() => {
      this.moving = false;
      if (Math.abs(this.cam.k / this.sharpAt - 1) > 0.02) this.sharpen();
      this.keepInReach();
    }, 160);
  }

  /* Where the trunk stands on the screen. */
  get trunkX(): number {
    return this.stageBox.left + this.cam.x;
  }

  /* The width of the stage not covered by an open side panel, and where that width begins. */
  get freeWidth(): number {
    return this.stageBox.width - this.insets.right - this.freeLeft;
  }

  get freeLeft(): number {
    return this.insets.left ?? 0;
  }

  /* The tree can be pushed around freely, but never lost: if it is dragged out of sight it eases back. */
  private keepInReach(): void {
    if (this.pointers.size) return;
    const { cam, bounds: b, freeLeft: from } = this, w = this.freeWidth, h = this.stageBox.height;
    const reach = Math.min(w, h) * 0.22;
    const left = cam.x + b.x0 * cam.k, right = cam.x + b.x1 * cam.k, top = cam.y + b.y0 * cam.k, bottom = cam.y + b.y1 * cam.k;
    const dx = right < from + reach ? from + reach - right : left > from + w - reach ? from + w - reach - left : 0;
    const dy = bottom < reach ? reach - bottom : top > h - reach ? h - reach - top : 0;
    if (dx || dy) this.glideTo({ x: cam.x + dx, y: cam.y + dy, k: cam.k }, 380);
  }

  /* A side panel or a banner opened or closed. If the tree has not been moved by hand, it re-centres in the space left. */
  setInsets(insets: TreeInsets): void {
    if (insets.right === this.insets.right && insets.top === this.insets.top && (insets.left ?? 0) === this.freeLeft) return;
    this.insets = insets;
    if (!this.userMoved) this.fit(false, true);
  }

  /* Once the tree rests at a new zoom, let the browser draw it again, sharp, at that size. */
  private sharpen(): void {
    this.sharpAt = this.cam.k;
    this.world.style.willChange = 'auto';
    requestAnimationFrame(() => requestAnimationFrame(() => { this.world.style.willChange = 'transform'; }));
  }

  /* Wide screens show the whole tree. An upright phone fills the height and is panned sideways. */
  fit(whole = false, animated = false): void {
    this.stageBox = this.stage.getBoundingClientRect();
    const to = this.fitted(whole);
    if (!to) return;
    this.userMoved = whole;
    if (animated) return this.glideTo(to, 750);
    this.cameraRun++;
    this.cam = to;
    this.paintCamera();
    this.sharpen();
  }

  /* Where the camera stands to show the tree as the page opens it, or all of it. Null while the page has no room to show anything. */
  /*
   * A larger tree is looked at from further out. It keeps its names, and counts as readable, until it is that much
   * further out than a small one: up to a point, past which nothing on it could be read anyway.
   */
  private get reach(): number {
    return Math.max(1, Math.min(ZOOM_REACH, this.grown));
  }

  /* The furthest out the tree may be looked at from: 0.15 of its size, or from as far as it takes to see all of a tree too large for that. */
  private get minZoom(): number {
    return Math.min(MIN_ZOOM, this.fitted(true)?.k ?? MIN_ZOOM);
  }

  private fitted(whole: boolean): Camera | null {
    const r = this.stageBox;
    if (r.width < 40 || r.height < 40) return null;
    const pad = r.width <= 640 ? { top: 76, bottom: 92, side: 8 } : r.height <= 480 ? { top: 56, bottom: 84, side: 16 } : { top: 84, bottom: 104, side: 16 };
    const bw = this.bounds.x1 - this.bounds.x0, bh = this.bounds.y1 - this.bounds.y0;
    pad.top += this.insets.top;
    const aw = this.freeWidth - pad.side * 2, ah = r.height - pad.top - pad.bottom;
    // A stage with less room than its own margins has none to show a tree in
    if (aw <= 0 || ah <= 0) return null;
    let k = Math.min(aw / bw, ah / bh);
    // Where the whole tree would be too small to read, as on an upright phone, it fills the height and is moved sideways
    if (!whole && aw / bw < ah / bh && k * this.reach < MID_ZOOM) k = Math.min(0.66, ah / bh);
    return {
      k,
      x: this.freeLeft + (bw * k <= aw + 1 ? pad.side + (aw - bw * k) / 2 - this.bounds.x0 * k : this.freeWidth / 2),
      y: pad.top + (ah - bh * k) / 2 - this.bounds.y0 * k,
    };
  }

  private glideTo(to: Camera, ms: number): void {
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
    const step = (now: number): void => {
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
  private showArea(box: Area): void {
    const top = 84 + this.insets.top, bottom = 104, side = 24;
    const aw = this.freeWidth - side * 2, ah = this.stageBox.height - top - bottom;
    const k = Math.max(this.minZoom, Math.min(0.9, aw / (box.x1 - box.x0 + 220), ah / (box.y1 - box.y0 + 220)));
    this.userMoved = true;
    this.glideTo({ k, x: this.freeLeft + side + aw / 2 - ((box.x0 + box.x1) / 2) * k, y: top + ah / 2 - ((box.y0 + box.y1) / 2) * k }, 750);
  }

  /* Where the camera is gliding to, or where it is when it is at rest. */
  private get heading(): Camera & { until?: number } {
    return this.goal?.run === this.cameraRun ? this.goal : this.cam;
  }

  /* Shift the view. If the tree is already gliding somewhere, it ends up that much further along, in the same sweep. */
  panBy(dx: number, dy: number): void {
    const { x, y, k, until = 0 } = this.heading;
    this.userMoved = true;
    this.glideTo({ x: x + dx, y: y + dy, k }, Math.max(320, until - performance.now()));
  }

  /*
   * Where a leaf is on the screen or, while the tree is gliding somewhere, where
   * it will come to rest. For placing its card, which then does not have to follow.
   */
  leafRect(personId: string): DOMRect | null {
    const box = this.leafOf.get(personId)?.el.getBoundingClientRect();
    if (!box) return null;
    const { cam, heading: to } = this, f = to.k / cam.k, ox = this.stageBox.left, oy = this.stageBox.top;
    return new DOMRect((box.left - ox - cam.x) * f + to.x + ox, (box.top - oy - cam.y) * f + to.y + oy, box.width * f, box.height * f);
  }

  /* Bring a person to the middle of the screen, close enough to read. */
  flyTo(personId: string): void {
    const leaf = this.leafOf.get(personId);
    if (!leaf) return;
    const k = Math.max(this.cam.k, 0.7);
    this.userMoved = true;
    this.glideTo({ k, x: this.freeLeft + this.freeWidth / 2 - leaf.node.tx * k, y: this.stageBox.height / 2 - leaf.node.ty * k }, 800);
  }

  /* Nudge the tree, if needed, so a leaf the keyboard has moved to is comfortably on screen. */
  private reveal(leaf: Leaf): void {
    const box = leaf.el.getBoundingClientRect(), edge = 72;
    const left = this.stageBox.left + this.freeLeft, right = left + this.freeWidth, bottom = this.stageBox.bottom;
    const dx = box.left < left + edge ? left + edge - box.left : box.right > right - edge ? right - edge - box.right : 0;
    const dy = box.top < this.stageBox.top + edge + 20 ? this.stageBox.top + edge + 20 - box.top : box.bottom > bottom - edge - 40 ? bottom - edge - 40 - box.bottom : 0;
    if (dx || dy) this.panBy(dx, dy);
  }

  /* Glide to a zoom level, keeping the given point of the screen where it is. */
  private zoomTo(px: number, py: number, k: number, ms = 260): void {
    const target = Math.max(this.minZoom, Math.min(MAX_ZOOM, k)), f = target / this.cam.k;
    this.userMoved = true;
    this.glideTo({ k: target, x: px - (px - this.cam.x) * f, y: py - (py - this.cam.y) * f }, ms);
  }

  /* One step in or out, about the middle of the screen. For the zoom buttons and the + and - keys. */
  zoomStep(factor: number): void {
    this.zoomTo(this.freeLeft + this.freeWidth / 2, this.stageBox.height / 2, this.cam.k * factor);
  }

  private zoomAt(px: number, py: number, factor: number): void {
    this.cameraRun++;
    const k = Math.max(this.minZoom, Math.min(MAX_ZOOM, this.cam.k * factor));
    const f = k / this.cam.k;
    this.cam.x = px - (px - this.cam.x) * f;
    this.cam.y = py - (py - this.cam.y) * f;
    this.cam.k = k;
    this.userMoved = true;
    this.markMoving();
  }

  /* ---------- Input ---------- */

  /* The twig that follows the finger while a + bud is pulled out, with a leaf at its tip. `null` puts it away. */
  private showTwig(handle: HandleElement | null, to: Point | null = null): void {
    this.twigTip.classList.toggle('on', Boolean(handle));
    if (!handle || !to) return this.twig.setAttribute('d', '');
    const from = handle.origin;
    this.twig.setAttribute('d', `M${from.x.toFixed(1)},${from.y.toFixed(1)} Q${((from.x + to.x) / 2).toFixed(1)},${(from.y + (to.y - from.y) * 0.2).toFixed(1)} ${to.x.toFixed(1)},${to.y.toFixed(1)}`);
    this.twigTip.setAttribute('transform', `translate(${to.x.toFixed(1)} ${to.y.toFixed(1)})`);
    this.twigTip.lastChild!.textContent = this.labels.relations[handle.relation];   // the label the constructor put there
  }

  private listen(): void {
    const { stage } = this, { signal } = this.abort;
    const list = () => [...this.pointers.values()];
    const onTree = (target: EventTarget | null): Element | null => closest(target, '.leaf-node.on, .bud, .handle');
    // A leaf carries the id of someone in `people`. As in the demo, one that was redrawn away while a finger rested on it is not checked for
    const personAt = (leafEl: Element): TreePerson => this.people.get(leafEl.getAttribute('data-id') ?? '')!;
    let downTarget: EventTarget | null = null, dragged = false, lastMoveAt = 0, pulling: HandleElement | null = null;
    let pinch: { d: number; k: number; at: number; spread: number } | null = null;
    let holdTimer: Timer | undefined, holding = false, lastTap: { at: number; x: number; y: number } | null = null;
    let oneHand: { y: number; k: number; at: Point; slid: boolean; out: boolean } | null = null;

    const local = (e: MouseEvent): Point => ({ x: e.clientX - this.stageBox.left, y: e.clientY - this.stageBox.top });
    const worldPoint = (e: MouseEvent): Point => ({ x: (local(e).x - this.cam.x) / this.cam.k, y: (local(e).y - this.cam.y) / this.cam.k });

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
        pulling = closest<HandleElement>(e.target, '.handle');
        // A second tap on open ground soon after the first: zoom in, or keep the finger down and slide to zoom with one hand
        const again = lastTap && performance.now() - lastTap.at < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 32;
        oneHand = again && !onTree(e.target) ? { y: e.clientY, k: this.cam.k, at: local(e), slid: false, out: e.shiftKey } : null;
        // Keeping a finger on a leaf opens its menu
        const leafEl = closest(e.target, '.leaf-node.on');
        if (leafEl && !pulling) {
          const x = e.clientX, y = e.clientY;
          holdTimer = setTimeout(() => {
            // A live update may have taken this person off the tree while the finger rested on the leaf
            const person = this.people.get(leafEl.getAttribute('data-id') ?? '');
            if (!person || dragged || this.pointers.size !== 1) return;
            holding = true;
            navigator.vibrate?.(8);
            this.on.hold?.({ person, x, y });
          }, 450);
        }
      } else if (all.length === 2) {
        dragged = true;
        pulling = oneHand = null;
        this.showTwig(null);
        pinch = { d: Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y), k: this.cam.k, at: performance.now(), spread: 0 };
      }
      try { stage.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    }, { signal });

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
    }, { signal });

    const end = (e: PointerEvent): void => {
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
        // The + buds are only ever drawn around the chosen leaf, which a live update may have removed mid-pull
        const chosen = this.leafOf.get(this.selectedId);
        if (chosen) this.on.add({ person: chosen.person, relation: pulling.relation });
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
    stage.addEventListener('pointerup', end, { signal });
    stage.addEventListener('pointercancel', end, { signal });

    // The right mouse button, or a long press where the browser reports one, opens a leaf's menu
    stage.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const leafEl = closest(e.target, '.leaf-node.on');
      if (!leafEl || holding) return;
      dragged = true;                           // a Control-click is a menu, not also a tap
      this.on.hold?.({ person: personAt(leafEl), x: e.clientX, y: e.clientY });
    }, { signal });

    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016));
      const k = Math.max(this.minZoom, Math.min(MAX_ZOOM, (this.zoomGoal?.k ?? this.cam.k) * step));
      this.zoomGoal = { k, x: e.clientX - this.stageBox.left, y: e.clientY - this.stageBox.top };
      if (this.still) {
        this.zoomAt(this.zoomGoal.x, this.zoomGoal.y, k / this.cam.k);
        this.paintCamera();
        this.zoomGoal = null;
      } else if (!this.zoomRunning) {
        this.zoomRunning = true;
        let prev = performance.now();
        const ease = (now: number): void => {
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
    }, { passive: false, signal });

    // The keyboard: arrows travel along the family, Enter opens, Space folds a branch, the menu key opens the menu
    stage.addEventListener('keydown', (e) => {
      const leafEl = closest(e.target, '.leaf-node');
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
        const box = leaf.el.getBoundingClientRect();
        this.on.hold?.({ person: leaf.person, x: box.left + box.width / 2, y: box.top + box.height / 2, keyboard: true });
      }
    }, { signal });
    stage.addEventListener('focusin', (e) => {
      const id = closest(e.target, '.leaf-node')?.getAttribute('data-id');
      if (id) this.setTabStop(id);
    }, { signal });
    stage.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const id = closest(e.target, '.leaf-node.on')?.getAttribute('data-id') ?? null;
      if (id !== this.hoverId) {
        this.hoverId = id;
        this.refreshLit();
      }
    }, { signal });

    // The finger-held timer lives in here, so it is called off from here
    signal.addEventListener('abort', () => clearTimeout(holdTimer));
  }

  /* A tap or Enter on something in the tree. */
  private activate(target: EventTarget | null): void {
    const handle = closest<HandleElement>(target, '.handle');
    // The + buds are only ever drawn around the chosen leaf
    if (handle) {
      const chosen = this.leafOf.get(this.selectedId);
      if (chosen) this.on.add({ person: chosen.person, relation: handle.relation });
      return;
    }
    const bud = closest(target, '.bud');
    if (bud) return this.toggleBranch(bud.getAttribute('data-node') ?? '');
    const id = closest(target, '.leaf-node.on')?.getAttribute('data-id');
    this.on.select((id && id !== this.selectedId ? this.people.get(id) : null) ?? null);
  }

  /* Let go of a drag and the tree keeps drifting, slowing to a stop. */
  private coast(): void {
    const run = ++this.cameraRun;
    let prev = performance.now();
    const step = (now: number): void => {
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
      // Thrown hard, it stops as it leaves the screen, and keepInReach() brings it back. Left to drift on it would be gone for seconds.
      const { cam, bounds: b, stageBox: r } = this;
      const gone = cam.x + b.x1 * cam.k < 0 || cam.x + b.x0 * cam.k > r.width || cam.y + b.y1 * cam.k < 0 || cam.y + b.y0 * cam.k > r.height;
      if (!gone && Math.hypot(this.velocity.x, this.velocity.y) > 0.012) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* Which relatives can be added to this person: the same answer for the + buds and for the menu. */
  addable(personId: string): Relation[] {
    const born = this.unions.find((u) => u.children.some((c) => c.id === personId));
    return RELATIONS.filter((relation) => !(relation === 'parent' && (born?.partners.length ?? 0) >= 2) && !(relation === 'sibling' && !born));
  }

  /* Now and then a gust crosses the tree. Between gusts nothing moves, so nothing is redrawn. */
  private gustSoon(delay: number): void {
    if (this.still) return;
    this.later(() => {
      const calm = !this.growing && !this.moving && !document.hidden && !this.pointers.size;
      if (calm) {
        this.svg.classList.add('gust');
        this.later(() => this.svg.classList.remove('gust'), 4400);
      }
      this.gustSoon(calm ? 7500 + Math.random() * 4500 : 1500);
    }, delay);
  }

  /* Now and then, every twenty to forty seconds, a koi leaps. Not while someone is dragging the tree, nor on a page or in a pond out of sight. */
  private leapSoon(run: number, delay: number): void {
    if (this.still) return;
    this.later(() => {
      if (run !== this.leaps || !this.pond) return;
      if (!document.hidden && !this.pointers.size && !this.pond.drawing.classList.contains('unseen')) startLeap(this.pond.drawing, this.pond.kind.lanes);
      this.leapSoon(run, 20000 + Math.random() * 20000);
    }, delay);
  }

  /* ---------- The sky's furniture and the ground ---------- */

  private decorate(): void {
    this.decorated = true;
    const b = this.bounds, g = TRUNK;
    const shade = Math.max(260, (b.x1 - b.x0) * 0.24);
    const spot = (cx: number, cy: number, rx: number, ry: number): string => `left:${(cx - rx - b.x0).toFixed(1)}px;top:${(cy - ry - b.y0).toFixed(1)}px;width:${rx * 2}px;height:${ry * 2}px`;
    // .behind and .ahead are part of the markup the engine is given
    this.world.querySelector('.behind')!.innerHTML = `<div class="only-light canopy-wash" style="${spot(0, -330, 860, 470)}"></div>` +
      `<div class="only-light soil" style="${spot(0, g + 12, 640, 44)}"></div>` +
      // The tree's shadow on the ground. The sun and the moon stand up and to the left, so it lies to the right of the trunk.
      `<div class="shade" style="${spot(shade * 0.55, g + 13, shade, 20)}"></div>`;

    // The stars are one sheet, laid out around its own middle, which is the middle of the sky over the tree
    const sky = { w: Math.round(b.x1 - b.x0 + 720), h: Math.round(g - b.y0 + 480) };
    let stars = '', twinkles = '';
    for (let i = 0; i < 150; i++) {
      const id = `star${i}`;
      const sx = ((rnd(id, 'x') - 0.5) * sky.w).toFixed(1), sy = ((rnd(id, 'y') - 0.5) * sky.h).toFixed(1), sr = (0.6 + rnd(id, 'r') * 1.3).toFixed(2);
      if (i % 6 === 0) twinkles += `<i class="twinkle" style="--x:${sx};--y:${sy};--r:${sr};animation-delay:-${(rnd(id, 'd') * 5).toFixed(1)}s"></i>`;
      else stars += `<circle cx="${sx}" cy="${sy}" r="${sr}" opacity="${(0.2 + rnd(id, 'o') * 0.6).toFixed(2)}"/>`;
    }
    // The sun, the stars and the moon are far things. Each is given a spot on the tree to be counted from, and paintFar() places it from there.
    const spots = [
      { x: b.x0 + 250, y: b.y0 + 150, sheet: null },
      { x: (b.x0 + b.x1) / 2, y: (b.y0 - 260 + g + 220) / 2, sheet: sky },
      { x: b.x0 + 210, y: b.y0 + 80, sheet: null },
    ];
    this.heavens.innerHTML = '<div class="far"><div class="only-light sun"></div></div>' +
      `<div class="far"><div class="only-dark starfield" style="--w:${sky.w};--h:${sky.h}"><svg class="stars" viewBox="${-sky.w / 2} ${-sky.h / 2} ${sky.w} ${sky.h}">${stars}</svg>${twinkles}</div></div>` +
      `<div class="far"><div class="only-dark moon">${MOON}</div></div>`;
    this.far = spots.flatMap((place, at) => {
      const el = this.heavens.children[at];
      return el instanceof HTMLElement ? [{ el, ...place }] : [];
    });
    this.paintFar();
    this.paintSky();

    this.layer.back.replaceChildren();
    el('path', { class: 'ground', d: `M-560,${g + 4} C-300,${g - 6} -120,${g + 9} 0,${g + 3} C160,${g - 4} 380,${g + 10} 580,${g + 2}` }, this.layer.back);
    for (let i = 0; i < 46; i++) {
      const id = `grass${i}`;
      const x = -540 + rnd(id, 'x') * 1080;
      if (Math.abs(x) < 34) continue;
      const h = 9 + rnd(id, 'h') * 18, lean = (rnd(id, 'l') - 0.5) * 14;
      el('path', { class: 'grass', d: `M${x.toFixed(1)},${g + 5} q${(lean / 2).toFixed(1)},${(-h / 2).toFixed(1)} ${lean.toFixed(1)},${(-h).toFixed(1)}` }, this.layer.back);
    }

    let flies = '';
    for (let i = 0; i < 22; i++) {
      const id = `fly${i}`;
      const fx = b.x0 + rnd(id, 'x') * (b.x1 - b.x0), fy = b.y0 + 80 + rnd(id, 'y') * (g - b.y0 - 60);
      flies += `<i class="only-dark fly" style="${spot(fx, fy, 11, 11)};--t:${(7 + rnd(id, 't') * 9).toFixed(1)}s;--d:-${(rnd(id, 'd') * 9).toFixed(1)}s;--dx:${((rnd(id, 'dx') - 0.5) * 220).toFixed(0)}px;--dy:${((rnd(id, 'dy') - 0.5) * 160).toFixed(0)}px"><b></b></i>`;
    }
    // The pond, if it is shown, stays as it is, its koi swimming on, and only moves with the frame
    const ahead = this.world.querySelector('.ahead')!;
    for (const fly of ahead.querySelectorAll(':scope > .fly')) fly.remove();
    ahead.insertAdjacentHTML('beforeend', flies);
    this.placePond();
  }

  /* ---------- Letting go ---------- */

  /* Like setTimeout, for anything that happens once some time from now, kept so that destroy() can call it off. */
  private later(run: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      run();
    }, ms);
    this.timers.add(timer);
  }

  /*
   * Stop everything that would still happen later: the listeners, the growth
   * loop, a glide or a zoom under way, the gusts and every other timer. What
   * has been drawn stays where it is. The demo page never let go of its tree,
   * so it had no need of this. A component that can be unmounted does.
   */
  destroy(): void {
    this.abort.abort();
    this.resizer.disconnect();
    this.pondWatch.disconnect();
    clearInterval(this.skyClock);
    cancelAnimationFrame(this.frameId);
    cancelAnimationFrame(this.cameraFrame);
    this.running = this.cameraQueued = false;
    this.cameraRun++;                   // a glide or a coast stops at its next step
    this.zoomGoal = null;               // and so does a wheel zoom
    clearTimeout(this.moveTimer);
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
}
