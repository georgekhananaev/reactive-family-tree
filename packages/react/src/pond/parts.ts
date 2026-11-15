/*
 * What the ponds beside the tree are drawn from: the outlines, the stones,
 * the flowers and the leap they have in common. Each pond puts its own
 * picture together from these, in a drawing of its own with the middle of
 * its water at 0,0.
 * Author: George Khananaev
 */

export type Point = readonly [number, number];

/* A stretch of open water where a koi may leap: where the leap may start, from and to, and how far down the drawing the water is there. */
export interface Lane {
  from: number;
  to: number;
  y: number;
}

/* What the tree's drawing code needs of a pond, to lay it on the ground and to let its koi leap. */
export interface Pond {
  /* Where the middle of its water lies: how far right of the foot of the trunk, and how far below the ground line. */
  at: { x: number; y: number };
  /* The part of its own drawing it fills. */
  box: { x: number; y: number; w: number; h: number };
  lanes: readonly Lane[];
  /* What its drawing holds. When nothing may move, everything in it rests and no koi leaps. */
  markup(still: boolean): string;
}

/* One decimal is plenty for a drawing seen at this size. */
export const n = (value: number): number => Math.round(value * 10) / 10;

/* A number between -0.5 and 0.5 drawn from a place, the same every time: it scatters small things and pulls shapes about without two looking alike. */
export const pull = (x: number, y: number, k: number): number => {
  const s = Math.sin(x * 12.9898 + y * 4.1414 + k * 78.233) * 43758.5453;
  return s - Math.floor(s) - 0.5;
};

/* How tall a reflection looks beside what it reflects: the water is seen from above, so a little shorter. */
export const MIRRORED = 0.8;

/* A smooth closed outline through the points: each curve leaves its point along the line between the points either side of it. */
export function smooth(points: readonly Point[]): string {
  const at = (i: number): Point => points[(i + points.length) % points.length];
  let d = `M${n(points[0][0])},${n(points[0][1])}`;
  for (let i = 0; i < points.length; i++) {
    const [a, b, c, e] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${n(b[0] + (c[0] - a[0]) / 6)},${n(b[1] + (c[1] - a[1]) / 6)} ${n(c[0] - (e[0] - b[0]) / 6)},${n(c[1] - (e[1] - b[1]) / 6)} ${n(c[0])},${n(c[1])}`;
  }
  return `${d}Z`;
}

/* A closed outline through the points, straight between them, each corner rounded off as a weathered stone's is. */
export function rounded(points: readonly Point[]): string {
  const at = (i: number): Point => points[(i + points.length) % points.length];
  const toward = (p: Point, q: Point): string => `${n(p[0] + (q[0] - p[0]) * 0.3)},${n(p[1] + (q[1] - p[1]) * 0.3)}`;
  return `${points.map((p, i) => `${i ? 'L' : 'M'}${toward(p, at(i - 1))}Q${n(p[0])},${n(p[1])} ${toward(p, at(i + 1))}`).join('')}Z`;
}

/* A stone, by where it stands, how wide and how tall it is, and whether moss grows on it. */
export type Stone = readonly [x: number, y: number, w: number, h: number, mossy: boolean];

/*
 * A stone's outline, a crack across its face, and the moss along its top,
 * with the corners of its top for whoever shades it further. No two are quite
 * the same: each is pulled about by numbers drawn from where it stands, some
 * round and some squarer, with a flat top or a slanting one.
 */
export function stone([x, y, w, h]: Stone): { outline: string; crack: string; moss: string; top: readonly Point[] } {
  const drawn = (k: number): number => pull(x, y, k);
  // How square it is: 2 is round, 4 all but a block
  const square = 3 + drawn(0) * 2;
  const top: Point[] = [];
  for (let k = 0; k < 6; k++) {
    const a = Math.PI * (1 + (k + 0.5 + drawn(k + 1) * 0.6) / 6), r = 0.92 + drawn(k + 7) * 0.2;
    const c = Math.cos(a), s = Math.sin(a);
    top.push([x + Math.sign(c) * Math.abs(c) ** (2 / square) * w * 0.5 * r, y - Math.min(1, Math.abs(s) ** (2 / square) * r) * h]);
  }
  const from = top[2], moss = top.slice(1, 5);
  return {
    top,
    outline: rounded([[x - w * 0.5, y], ...top, [x + w * 0.5, y], [x + w * 0.28, y + h * 0.08], [x - w * 0.28, y + h * 0.08]]),
    crack: `M${n(from[0])},${n(from[1] + h * 0.06)}q${n(w * 0.06)},${n(h * 0.24)} ${n(w * (0.12 + drawn(13) * 0.1))},${n(h * 0.42)}`,
    moss: rounded([...moss.map(([mx, my]): Point => [mx + (x - mx) * 0.06, my + h * 0.04]),
      ...moss.slice().reverse().map(([mx, my], i): Point => [mx + (x - mx) * 0.1, my + h * (0.2 + (i % 2) * 0.12 + drawn(i + 14) * 0.08)])]),
  };
}

/* Stones drawn plainly: each with its outline, a crack if it is large enough to show one, and its moss. */
export const stones = (list: readonly Stone[]): string => `<g class="stones">${list.map((s) => {
  const { outline, crack, moss } = stone(s);
  return `<path d="${outline}"/>${s[2] > 13 ? `<path class="crack" d="${crack}"/>` : ''}${s[4] ? `<path class="moss" d="${moss}"/>` : ''}`;
}).join('')}</g>`;

/* A sword-shaped leaf or a flower's stem, by its foot, its lean and its height. */
export type Blade = readonly [x: number, y: number, lean: number, h: number];
/* An iris flower: its falls hanging either side and in front, its standard up, and the yellow at its heart. */
const IRIS_FLOWER = '<ellipse cx="-2.6" cy="1.2" rx="2.9" ry="1.3" transform="rotate(-28 -2.6 1.2)"/><ellipse cx="2.6" cy="1.2" rx="2.9" ry="1.3" transform="rotate(28 2.6 1.2)"/>' +
  '<ellipse cx="0" cy="1.8" rx="1.5" ry="2"/><ellipse cx="0" cy="-1.7" rx="1.2" ry="2.4"/><ellipse class="iris-heart" cx="0" cy="0.7" rx="1" ry="0.6"/>';
/* A clump of irises: its leaves, and a flower on each stem. */
export const irises = (leaves: readonly Blade[], stems: readonly Blade[]): string =>
  leaves.map(([x, y, lean, h]) => `<path class="iris-leaf" d="M${n(x - 1.3)},${y}Q${n(x + lean * 0.35 - 0.8)},${n(y - h * 0.55)} ${x + lean},${y - h}Q${n(x + lean * 0.4 + 1)},${n(y - h * 0.5)} ${n(x + 1.3)},${y}Z"/>`).join('') +
  stems.map(([x, y, lean, h]) => `<path class="iris-stem" d="M${x},${y}Q${n(x + lean * 0.2)},${n(y - h * 0.5)} ${x + lean},${y - h}"/><g class="iris" transform="translate(${x + lean},${y - h})">${IRIS_FLOWER}</g>`).join('');

/* A lily pad, by its middle, its size and which way its notch is turned, seen as flat on the water as `pressed` says. */
export type Pad = readonly [x: number, y: number, r: number, turn: number];
export const pad = ([x, y, r, turn]: Pad, pressed: number): string =>
  `<path class="pad" d="M0,0L${n(r * 0.96)},${n(r * 0.28)}A${r},${r} 0 1 1 ${n(r * 0.96)},${n(-r * 0.28)}Z" transform="translate(${x},${y}) scale(1,${pressed}) rotate(${turn})"/>`;
const PETAL = 'M0,0C-1.5,-1.8 -1.3,-4.2 0,-5.4C1.3,-4.2 1.5,-1.8 0,0Z';
/* A water lily open on its pad. */
export const lily = (x: number, y: number): string =>
  `<g class="lily" transform="translate(${x},${y})">${[-56, -28, 0, 28, 56].map((a) => `<path d="${PETAL}" transform="rotate(${a})"/>`).join('')}<ellipse class="lily-heart" cx="0" cy="-1.5" rx="1.3" ry="0.7"/></g>`;

/* Streaks of light on the water around a spot, each by where it starts, how long it is, and how far into its shimmer it begins. */
export const streaks = (list: readonly (readonly number[])[], at: Point = [0, 0]): string =>
  list.map(([x, y, w, d]) => `<path d="M${at[0] + x},${n(at[1] + y)}h${w}" style="--d:-${d}s"/>`).join('');

/*
 * The shades every pond is painted with: its water, lighter in the middle,
 * the sky lying on the far water, a stone's light and dark, the lantern's
 * glow, the moon's light on the water, and the moss the pond is set in. They
 * are the same in every pond's drawing, so each may be found under one name.
 */
export const SHADES =
  '<radialGradient id="pondWater" cx="0.48" cy="0.6" r="0.62"><stop class="water-light" offset="0"/><stop class="water" offset="0.62"/><stop class="water-rim" offset="1"/></radialGradient>' +
  '<linearGradient id="pondSky" x1="0" y1="0" x2="0" y2="1"><stop class="water-shine" offset="0" stop-opacity="0.4"/><stop class="water-shine" offset="0.45" stop-opacity="0"/></linearGradient>' +
  '<linearGradient id="pondStone" x1="0.2" y1="0" x2="0.55" y2="1"><stop class="stone-light" offset="0.15"/><stop class="stone-dark" offset="1"/></linearGradient>' +
  '<radialGradient id="pondGlow"><stop class="lantern-glow" offset="0" stop-opacity="0.6"/><stop class="lantern-glow" offset="0.35" stop-opacity="0.22"/><stop class="lantern-glow" offset="1" stop-opacity="0"/></radialGradient>' +
  '<radialGradient id="pondGlint"><stop class="water-glint" offset="0" stop-opacity="0.6"/><stop class="water-glint" offset="1" stop-opacity="0"/></radialGradient>' +
  '<radialGradient id="pondMoss"><stop class="moss-ground" offset="0.5" stop-opacity="0.3"/><stop class="moss-ground" offset="1" stop-opacity="0"/></radialGradient>';

/*
 * The leap: how far along the koi comes down, how high it rises, how long it
 * is in the air, and when the water closes over it, in seconds.
 */
const LEAP = { reach: 56, height: 62, seconds: 1.4, back: 1.28 };
/* A ring spreading on the water, and the drops thrown up, from where the koi leaves it or goes back in, `at` seconds into the leap. */
const splash = (x: number, at: number): string =>
  `<ellipse class="ring" cx="${x}" rx="1" ry="0.3"><animate data-at="${at}" attributeName="rx" from="1" to="21" dur="1.8s" begin="indefinite" fill="freeze"/>` +
  `<animate data-at="${at}" attributeName="ry" from="0.3" to="3.6" dur="1.8s" begin="indefinite" fill="freeze"/>` +
  `<animate data-at="${at}" attributeName="opacity" values="0;0.8;0" keyTimes="0;0.1;1" dur="1.8s" begin="indefinite" fill="freeze"/></ellipse>` +
  [[-9, -13], [-3, -17], [4, -15], [10, -10]].map(([dx, dy]) =>
    `<circle class="drop" cx="${x}" r="1.2"><animateMotion data-at="${at}" path="M0,0 q${dx / 2},${dy} ${dx},${dy / 3}" dur="0.6s" begin="indefinite" fill="freeze"/>` +
    `<animate data-at="${at}" attributeName="opacity" values="0;0.9;0" keyTimes="0;0.15;1" dur="0.6s" begin="indefinite" fill="freeze"/></circle>`).join('');
/* The koi that leaps, seen from the side: its fins and tail, its body with its markings, and its eye. */
const LEAPER = '<path class="koi-fin" d="M4.4,-4.4C2,-6.8 -2.6,-6.6 -5.6,-3.2C-2.8,-4 0.8,-4.6 4.4,-4.4Z"/>' +
  '<path class="koi-fin" d="M-8.8,0C-10.6,-1.8 -12.6,-5 -15.4,-5.8C-14,-2.4 -14,2.4 -15.4,5.8C-12.6,5 -10.6,1.8 -8.8,0Z"/>' +
  '<path class="koi-red" d="M11,0C11,-2.4 7.4,-4.6 2,-4.6C-3,-4.6 -6.6,-2.2 -9.4,-1L-9.4,1C-6.6,2.4 -3,3.8 2,3.8C7.4,3.8 11,2.2 11,0Z"/>' +
  '<ellipse class="koi-white" cx="-1.6" cy="-1.8" rx="3.4" ry="1.7"/><ellipse class="koi-white" cx="6.2" cy="1.4" rx="2.2" ry="1.4"/>' +
  '<path class="koi-fin" d="M5.6,1.8C4.6,4.4 2.2,5.6 0.8,5.4C1.6,4 3.2,2.6 4.4,1.6Z"/><circle class="koi-eye" cx="8.3" cy="-0.9" r="0.55"/>';
/* The leaping koi with its two splashes, waiting out of sight until a leap is started. */
export const LEAPING = `<g class="leap"><g opacity="0">${LEAPER}` +
  `<animateMotion data-at="0" path="M0,0 C14,-${LEAP.height} ${LEAP.reach - 14},-${LEAP.height} ${LEAP.reach},0" rotate="auto" dur="${LEAP.seconds}s" begin="indefinite" fill="freeze"/>` +
  `<animate data-at="0" attributeName="opacity" values="0;1;1;0" keyTimes="0;0.06;0.9;1" dur="${LEAP.seconds}s" begin="indefinite" fill="freeze"/></g>` +
  `${splash(0, 0)}${splash(LEAP.reach, LEAP.back)}</g>`;

/* One leap in a pond's drawing, from somewhere along one of its stretches of open water, one way or the other. */
export function startLeap(drawing: SVGSVGElement, lanes: readonly Lane[]): void {
  const leap = drawing.querySelector<SVGGElement>('.leap'), lane = lanes[Math.floor(Math.random() * lanes.length)];
  if (!leap || !lane) return;
  const way = Math.random() < 0.5 ? 1 : -1, start = lane.from + Math.random() * (lane.to - lane.from);
  const from = way > 0 ? start : start + LEAP.reach, depth = lane.y + (Math.random() - 0.5) * 4;
  leap.setAttribute('transform', `translate(${n(from)},${n(depth)}) scale(${way},1)`);
  for (const part of leap.querySelectorAll<SVGAnimationElement>('[data-at]')) part.beginElementAt(Number(part.dataset.at));
}
