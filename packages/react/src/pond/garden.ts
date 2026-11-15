/*
 * The garden pond: the larger of the two ponds, a Japanese garden in small.
 *
 * It is seen from a little higher than the koi pond, so more of its water
 * shows. An island lies in it with a cloud-pruned pine leaning out over the
 * water, and a red arched bridge crosses from the island to the bank. A
 * snow-viewing lantern stands on a flat rock at the far edge, lotus and
 * irises grow at the back, azaleas flower behind the stones, and the near
 * bank runs down to the water as a beach of pebbles. At the left end a
 * bamboo spout fills from a trickle, tips, empties into the pond and swings
 * back. Six koi swim under the lily pads, each moving its tail, and now and
 * then one comes up to the surface and leaves a ring. A turtle suns itself
 * on the island's shore, a frog sits on a pad, and petals from the tree's
 * blossoms drift on the water. By day dragonflies hover over it. After dark the lantern is lit, the moon lays a path on the
 * water, and fireflies come out.
 * Author: George Khananaev
 */

import { LEAPING, MIRRORED, SHADES, irises, lily, n, pad, pull, rounded, smooth, stone, streaks } from './parts';
import type { Blade, Pad, Point, Pond, Stone } from './parts';

/* How flat a thing lying on the water looks from the bank. */
const PRESSED = 0.44;

/* The water's edge: a broad pool on the left, and on the right a rounder one about the island. Its far side is higher up than its near side. */
const WATER = smooth([
  [-180, 2], [-171, -14], [-148, -27], [-112, -35], [-72, -39], [-34, -37], [2, -33], [36, -35], [76, -38], [116, -35], [150, -27], [172, -14], [181, 1],
  [174, 16], [154, 29], [122, 37], [84, 41], [44, 42], [6, 40], [-30, 43], [-68, 45], [-104, 42], [-136, 34], [-162, 21], [-176, 11],
]);

/* ---------- Stones ---------- */

/*
 * A stone drawn with more care than the koi pond's: the shadow it stands in,
 * its side towards the light and its side away from it, a crack, lichen or
 * moss, and where it stands in water a line of light at its foot.
 */
function rock(s: Stone, stands: 'bank' | 'water' | 'far'): string {
  const [x, y, w, h, mossy] = s, { outline, crack, moss, top } = stone(s);
  const inward = ([px, py]: Point, by: number): Point => [px + (x - px) * by, py + (y - h * 0.3 - py) * by];
  const lit = rounded([inward(top[0], 0.07), inward(top[1], 0.07), inward(top[2], 0.07), inward(top[3], 0.07), inward(top[3], 0.42), inward(top[2], 0.5), inward(top[1], 0.46), inward(top[0], 0.4)]);
  const dark = rounded([inward(top[4], 0.1), inward(top[5], 0.1), [x + w * 0.42, y - h * 0.05], [x + w * 0.14, y - h * 0.02], inward(top[4], 0.58)]);
  const lichen = [0, 1].map((k) =>
    `<ellipse class="lichen" cx="${n(x + pull(x, y, 20 + k) * w * 0.5)}" cy="${n(y - h * (0.3 + (pull(x, y, 22 + k) + 0.5) * 0.3))}" rx="${n(1 + (pull(x, y, 24 + k) + 0.5) * 1.2)}" ry="0.8"/>`).join('');
  return (stands === 'bank' ? `<ellipse class="rock-shadow" cx="${n(x + w * 0.05)}" cy="${n(y + h * 0.05)}" rx="${n(w * 0.6)}" ry="${n(h * 0.12 + 1.2)}"/>` : '') +
    `<path class="rock" d="${outline}"/><path class="rock-lit" d="${lit}"/><path class="rock-dark" d="${dark}"/>` +
    (w > 11 ? `<path class="crack" d="${crack}"/>` : '') +
    (mossy ? `<path class="moss" d="${moss}"/>` : w > 15 ? lichen : '') +
    (stands === 'water' ? `<path class="wet" d="M${n(x - w * 0.5)},${n(y + h * 0.03)}q${n(w * 0.5)},${n(h * 0.14)} ${w},0"/>` : '');
}
const rocks = (list: readonly Stone[], stands: 'bank' | 'water' | 'far'): string => list.map((s) => rock(s, stands)).join('');

/* Along the far bank, in groups, their feet hidden by the water's edge. One tall stone stands among them. */
const FAR_ROCKS: readonly Stone[] = [
  [-158, -19, 20, 13, true], [-140, -27, 12, 7, false],
  [-98, -35, 17, 25, true], [-82, -36.5, 13, 8, false], [-114, -33, 11, 6, false],
  [6, -31, 20, 10, true], [24, -33, 11, 6, false],
  [56, -35.5, 14, 8, false], [100, -35, 18, 10, true], [118, -33.5, 10, 6, false],
  [148, -26, 17, 11, true], [166, -16, 13, 9, false],
];
/* The flat rock the lantern stands on, out from the far bank into the water. */
const LANTERN_ROCK: Stone = [-44, -31.5, 42, 9, true];
/* The island's shore, behind it and in front. */
const ISLE_BACK: readonly Stone[] = [[44, -9, 14, 8, false], [72, -12.5, 16, 8, true], [94, -9, 13, 7, false]];
const ISLE_FRONT: readonly Stone[] = [[99, 3, 13, 8, false], [36, 3.5, 16, 10, true], [80, 8.5, 15, 9, true], [57, 9, 22, 10, false]];
/* Where the bridge comes down on the right bank, and the bank's own stones. */
const LANDING: readonly Stone[] = [[190, -3, 24, 7, false]];
const NEAR_ROCKS: readonly Stone[] = [
  [200, 9, 22, 17, true], [178, 22, 16, 9, false],
  [-170, 22, 14, 9, false], [-150, 33, 26, 15, true], [-128, 41, 15, 9, false],
  [-84, 50, 34, 12, true], [-58, 49, 13, 7, false],
  [64, 47, 18, 10, false], [120, 42, 12, 7, false], [96, 46, 28, 13, true], [150, 35, 20, 12, true],
];

/* ---------- The beach of pebbles on the near bank, and the few that lie under the water before it ---------- */

/* How far down the drawing the near edge of the water is, along the beach. */
const beachEdge = (x: number): number => 41.6 + Math.cos((x - 6) / 22) * -1.4;
const pebble = (i: number, sunk: boolean): string => {
  const x = -38 + (i * 79) / 46 + pull(i, 1, 2) * 6, deep = (pull(i, 3, 4) + 0.5) ** 1.4;
  const y = beachEdge(x) + (sunk ? -2 - deep * 6 : 0.6 + deep * 11), rx = 1.1 + (pull(i, 5, 6) + 0.5) * 2.1;
  return `<ellipse class="${sunk ? 'sunk' : `pebble-${i % 3}`}" cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(rx * 0.56)}"/>`;
};
const BEACH = `<g class="pebbles">${Array.from({ length: 47 }, (_, i) => pebble(i, false)).join('')}</g>`;
const SUNK = Array.from({ length: 16 }, (_, i) => pebble(i * 3 + 1, true)).join('');

/* ---------- Plants ---------- */

/* An azalea clipped into a mound, by its foot, how wide and how tall it is, and how many flowers show. */
type Mound = readonly [x: number, y: number, rx: number, ry: number, flowers: number];
const AZALEAS: readonly Mound[] = [[-128, -31, 22, 13, 9], [128, -32, 20, 11, 8]];
function azalea([x, y, rx, ry, flowers]: Mound): string {
  const rim: Point[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (1 + i / 8), r = 1 + (i % 2 ? 0.07 : -0.03) + pull(x, y, i) * 0.06;
    rim.push([x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r]);
  }
  const blooms = Array.from({ length: flowers }, (_, i) => {
    const a = Math.PI * (1.12 + ((i + 0.5 + pull(x, y, 30 + i) * 0.7) / flowers) * 0.76), r = 0.35 + (pull(x, y, 40 + i) + 0.5) * 0.5;
    return `<circle class="azalea" cx="${n(x + Math.cos(a) * rx * r)}" cy="${n(y + Math.sin(a) * ry * r)}" r="1.1"/>`;
  }).join('');
  return `<path class="shrub" d="${smooth([...rim, [x + rx * 0.5, y + 1.2], [x - rx * 0.5, y + 1.2]])}"/>${blooms}`;
}

/* Irises at the far left, behind the stones and the spout there. */
const IRIS_LEAVES: readonly Blade[] = [[-194, -7, -9, 17], [-190, -9, -6, 24], [-186, -11, -3, 32], [-182, -12, 1, 37], [-177, -13, 5, 30], [-172, -15, -2, 26], [-168, -17, 6, 21], [-164, -19, 9, 16]];
const IRIS_STEMS: readonly Blade[] = [[-190, -9, -8, 29], [-184, -11, -4, 40], [-176, -13, 3, 35], [-169, -16, 3, 27]];

/* Cattails behind the stones of the right bank: long leaves, and stems with their brown heads. */
const CATTAIL_LEAVES: readonly Blade[] = [[154, -24, -7, 22], [160, -22, 5, 25], [170, -17, 9, 18]];
const CATTAILS: readonly Blade[] = [[158, -23, -2, 30], [163, -21, 2, 37], [168, -18, 4, 26]];
const cattails = CATTAIL_LEAVES.map(([x, y, lean, h]) => `<path class="reed" d="M${x},${y}q${n(lean * 0.3)},${n(-h * 0.6)} ${lean},${-h}"/>`).join('') +
  CATTAILS.map(([x, y, lean, h]) => `<path class="reed" d="M${x},${y}q${n(lean * 0.2)},${n(-h * 0.5)} ${lean},${-h}"/>` +
    `<ellipse class="cattail" cx="${x + lean}" cy="${y - h + 5.4}" rx="1.25" ry="3.6" transform="rotate(${lean * 2.5} ${x + lean} ${y - h + 5.4})"/>`).join('');

/* Ferns on the near bank, each a fan of fronds from one foot. */
const FERNS: readonly Point[] = [[-207, 25], [42, 55], [166, 33], [211, 20]];
const fern = ([x, y]: Point): string => [-3, -2, -1, 0, 1, 2, 3].map((k) =>
  `<path class="fern" d="M${x},${y}q${n(k * 1.2)},-7.6 ${n(k * 3.4)},${n(-7.4 + Math.abs(k) * 1.7)}"/>`).join('');
/* Blades of grass among the stones of the near bank. */
const TUFTS: readonly Blade[] = [[-112, 53, -3, 11], [-108, 54, 2, 14], [-104, 53, 5, 9], [24, 57, -2, 10], [28, 57, 3, 13], [134, 47, -3, 12], [138, 47, 2, 9], [-186, 31, -4, 10], [-182, 32, 2, 12]];
const tufts = TUFTS.map(([x, y, lean, h]) => `<path class="grass" d="M${x},${y}q${n(lean / 2)},${n(-h / 2)} ${lean},${-h}"/>`).join('');

/*
 * Lotus at the back of the left pool: round leaves held just above the water,
 * each by its middle and its size, and on taller stems a flower open, a bud,
 * and a seed head.
 */
const LOTUS_LEAVES: readonly (readonly [x: number, y: number, r: number])[] = [[-108, -27, 9.5], [-74, -28, 8], [-128, -21, 12], [-90, -19, 10.5]];
function lotusLeaf([x, y, r]: readonly [number, number, number]): string {
  const flat = r * 0.42, rim: Point[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12, wave = 1 + Math.sin(i * 2.1 + x) * 0.05;
    rim.push([x + Math.cos(a) * r * wave, y + Math.sin(a) * flat * wave]);
  }
  const veins = [0.4, 1.3, 2.3, 3.4, 4.4, 5.5].map((a) => `M${x},${y}L${n(x + Math.cos(a) * r * 0.82)},${n(y + Math.sin(a) * flat * 0.82)}`).join('');
  return `<path class="reed" d="M${x},${n(y + flat * 0.6)}v${n(flat * 0.4 + 2.2)}"/><path class="lotus-leaf" d="${smooth(rim)}"/>` +
    `<path class="lotus-lip" d="M${n(x - r * 0.94)},${n(y + flat * 0.3)}Q${x},${n(y + flat * 1.5)} ${n(x + r * 0.94)},${n(y + flat * 0.3)}Q${x},${n(y + flat * 1.04)} ${n(x - r * 0.94)},${n(y + flat * 0.3)}Z"/>` +
    `<path class="lotus-vein" d="${veins}"/><ellipse class="lotus-lip" cx="${x}" cy="${n(y + flat * 0.08)}" rx="${n(r * 0.16)}" ry="${n(flat * 0.18)}"/>`;
}
const LOTUS_PETAL = 'M0,0C-2.4,-2.8 -2.1,-6.8 0,-8.8C2.1,-6.8 2.4,-2.8 0,0Z';
const LOTUS = LOTUS_LEAVES.map(lotusLeaf).join('') +
  // The flower, open
  `<path class="reed" d="M-114,-24q-1,-9 -2,-17"/><g class="lotus" transform="translate(-116,-41)">${[-64, 64, -40, 40, -18, 18, 0].map((a) => `<path d="${LOTUS_PETAL}" transform="rotate(${a})"/>`).join('')}<ellipse class="lily-heart" cx="0" cy="-2.2" rx="1.9" ry="1"/></g>` +
  // A bud not yet open
  '<path class="reed" d="M-98,-22q0.6,-9 1,-16"/><g class="lotus"><path d="M-97,-37C-99.4,-39.4 -98.8,-43.4 -97,-45.6C-95.2,-43.4 -94.6,-39.4 -97,-37Z"/></g>' +
  // And a seed head, where a flower has been
  '<path class="reed" d="M-81,-26q-0.4,-6 -1,-11"/><path class="pod" d="M-85,-40.6L-79,-40.6Q-79.6,-36.4 -82,-35.6Q-84.4,-36.4 -85,-40.6Z"/><ellipse class="pod-top" cx="-82" cy="-40.6" rx="3" ry="1"/>';

/* Lily pads on the water. Two hold a flower open, and a frog sits on a third. */
const PADS: readonly Pad[] = [
  [-134, 14, 6, 130], [-118, 22, 9, 40], [-84, 24, 6.5, 300], [-100, 30, 7, 200],
  [4, -2, 5.5, 220], [16, 6, 7.5, 70],
  [140, 16, 5.5, 20], [124, 24, 8, 250], [108, 30, 6, 160],
];
const FROG = '<g class="frog" transform="translate(-100,29.2)"><ellipse cx="0" cy="0" rx="2.5" ry="1.5"/><circle cx="-1.1" cy="-1.3" r="0.8"/><circle cx="1.1" cy="-1.3" r="0.8"/>' +
  '<circle class="eye" cx="-1.1" cy="-1.45" r="0.32"/><circle class="eye" cx="1.1" cy="-1.45" r="0.32"/></g>';
const LILIES = PADS.map((one) => pad(one, PRESSED)).join('') + lily(-118, 21.2) + lily(124, 23.2) + FROG;

/* ---------- The lantern ---------- */

/*
 * A snow-viewing lantern, its feet at 0,0: three legs, a stepped shelf, the
 * six-sided firebox with a round window in front and a slit at the side, the
 * broad roof with its tips turned up, and on top a jewel in a cup of petals.
 * First come the parts as its outline is made of, then the lines drawn on it.
 */
const LANTERN_AT: Point = [-44, -37.5];
const LANTERN_WINDOW: Point = [0, -24.8];
const LANTERN = [
  'M-8.2,-14C-10.4,-9 -13.6,-4.6 -18,-0.4L-14.2,0.4C-11.2,-3.8 -8.4,-8.4 -4.8,-14Z',
  'M8.2,-14C10.4,-9 13.6,-4.6 18,-0.4L14.2,0.4C11.2,-3.8 8.4,-8.4 4.8,-14Z',
  'M-1.7,-14L-2.1,0.8L2.1,0.8L1.7,-14Z',
  'M-12.6,-14L12.6,-14L11.4,-17.2L-11.4,-17.2Z',
  'M-9.6,-17.2L9.6,-17.2L8.6,-19.4L-8.6,-19.4Z',
  'M-7.6,-19.4L7.6,-19.4L7.6,-30.4L-7.6,-30.4Z',
  'M-24.6,-32.6Q-16,-31.4 -10,-35.6Q-3.4,-40.6 0,-40.8Q3.4,-40.6 10,-35.6Q16,-31.4 24.6,-32.6Q25.4,-30.6 22,-29.8L-22,-29.8Q-25.4,-30.6 -24.6,-32.6Z',
  'M-2.6,-40.6L2.6,-40.6L2.2,-42.6L-2.2,-42.6Z',
  'M-3.6,-42.6Q0,-41.4 3.6,-42.6Q3,-44.4 0,-44.6Q-3,-44.4 -3.6,-42.6Z',
  'M0,-51C1.5,-48.8 3.2,-47.6 3.2,-46C3.2,-44.8 1.8,-44.2 0,-44.2C-1.8,-44.2 -3.2,-44.8 -3.2,-46C-3.2,-47.6 -1.5,-48.8 0,-51Z',
].map((d) => `<path d="${d}"/>`).join('');
const LANTERN_LINES = '<path class="face-dark" d="M-7.6,-19.4L-4.4,-19.4L-4.4,-30.4L-7.6,-30.4Z"/><path class="face-lit" d="M4.4,-19.4L7.6,-19.4L7.6,-30.4L4.4,-30.4Z"/>' +
  '<path class="line" d="M-23.6,-31.4Q-15.6,-30.2 -9.6,-34.2Q-3.2,-39 0,-39.2Q3.2,-39 9.6,-34.2Q15.6,-30.2 23.6,-31.4M0,-39.2Q-0.5,-34.6 -0.8,-30M-24.6,-32.6q-1.5,-0.7 -1.2,-2.5M24.6,-32.6q1.5,-0.7 1.2,-2.5"/>' +
  '<path class="moss" d="M-15,-33Q-9,-37.6 -2.4,-40Q-6,-36 -9.4,-33.2Z"/>' +
  `<circle class="window" cx="${LANTERN_WINDOW[0]}" cy="${LANTERN_WINDOW[1]}" r="3"/><path class="window" d="M5.3,-27.6h1.4v5.6h-1.4Z"/>`;
/* Where its window is in the pond's drawing, and where its light lies on the water: halfway from the foot of its rock to the window's own reflection. */
const LIT: Point = [LANTERN_AT[0] + LANTERN_WINDOW[0], LANTERN_AT[1] + LANTERN_WINDOW[1]];
const LIT_BELOW: Point = [LIT[0], n(LANTERN_ROCK[1] + ((LANTERN_ROCK[1] - LIT[1]) * MIRRORED) / 2)];

/* ---------- The island and its pine ---------- */

/* A limb that tapers along the points it passes through, from one width to another. */
function limb(points: readonly Point[], from: number, to: number): string {
  const one: Point[] = [], other: Point[] = [], last = points.length - 1;
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(last, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1, half = (from + (to - from) * (i / last)) / 2;
    one.push([p[0] - (dy / length) * half, p[1] + (dx / length) * half]);
    other.unshift([p[0] + (dy / length) * half, p[1] - (dx / length) * half]);
  });
  return smooth([...one, ...other]);
}
/* A pad of needles on a cloud-pruned pine, by its middle and its size: flat underneath, in soft lobes on top, darker below, with a few needles standing out of it. */
type Cloud = readonly [x: number, y: number, rx: number, ry: number];
function pinePad([x, y, rx, ry]: Cloud): string {
  const rim: Point[] = [];
  let needles = '';
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (1 + i / 8), r = 1 + (i % 2 ? 0.1 : -0.04) + pull(x, y, i) * 0.1;
    rim.push([x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r]);
    if (i % 2 && i < 8) needles += `M${n(x + Math.cos(a) * rx * r * 0.82)},${n(y + Math.sin(a) * ry * r * 0.7)}l${n(Math.cos(a) * 2.2)},${n(Math.sin(a) * 2.4 - 0.6)}`;
  }
  return `<path class="pine-pad" d="${smooth([...rim, [x + rx * 0.55, y + ry * 0.32], [x, y + ry * 0.16], [x - rx * 0.55, y + ry * 0.32]])}"/>` +
    `<path class="pine-under" d="M${n(x - rx * 0.9)},${n(y + ry * 0.06)}Q${x},${n(y + ry * 0.62)} ${n(x + rx * 0.9)},${n(y + ry * 0.06)}Q${x},${n(y + ry * 0.2)} ${n(x - rx * 0.9)},${n(y + ry * 0.06)}Z"/>` +
    `<path class="pine-needles" d="${needles}"/>`;
}
const PINE_TRUNK: readonly Point[] = [[58, 1], [56, -8], [52, -20], [41, -34], [44, -52], [55, -63], [51, -80], [48, -92]];
/* Each branch, from the trunk out to the pad it carries. */
const PINE_BRANCHES: readonly (readonly Point[])[] = [
  [[46, -28], [32, -33], [20, -36]], [[45, -50], [62, -50], [78, -49]], [[47, -57], [36, -62], [28, -64]], [[53, -72], [62, -76], [70, -77]],
];
const PINE_PADS: readonly Cloud[] = [[20, -38, 23, 7.5], [80, -51, 18, 6.5], [28, -66, 16, 6], [71, -79, 13, 5], [47, -95, 15, 6.5]];
const PINE = PINE_BRANCHES.map((points) => `<path class="pine-wood" d="${limb(points, 2.4, 1)}"/>`).join('') +
  `<path class="pine-wood" d="${limb(PINE_TRUNK, 5.8, 1.5)}"/><path class="pine-bark" d="M54.6,-12l-1.4,-4.6M47.6,-28.6l-2.6,-3.4M43.4,-45l0.6,-4.6M50.6,-58.6l2.6,-2.8M52,-73l-0.8,-4.4"/>` +
  PINE_PADS.map(pinePad).join('');

/* The island itself: a low mound of moss. */
const ISLE = 'M30,0C38,-10 52,-13.5 66,-13.5C82,-13.5 96,-9 102,0C96,8.5 82,11 66,11C50,11 36,8 30,0Z';
/* The turtle on the island's shore: its legs and tail, its shell with the plates marked on it, and its head held up. */
const TURTLE = '<g class="turtle" transform="translate(35,-6.8)"><path d="M-3.6,-0.2l-1.4,1.2M3,-0.2l1.2,1.2M-4.4,-1l-1.8,0.4"/><path class="shell" d="M-4.4,0Q-3.8,-4.2 0,-4.4Q3.8,-4.2 4.4,0Z"/>' +
  '<path class="plates" d="M-2.6,-0.2q0.4,-2.4 2.6,-2.6q2.2,0.2 2.6,2.6M0,-4.2v1.4"/><ellipse class="shell" cx="5.4" cy="-1.8" rx="1.5" ry="1.05"/><circle class="eye" cx="5.9" cy="-2.1" r="0.3"/></g>';

/* ---------- The bridge ---------- */

/* The arched bridge from the island to the right bank: where it starts, the point its arch is pulled up towards, and where it comes down. */
const BRIDGE = { from: [100, -4], pull: [143, -50], to: [186, -6] } as const satisfies Record<string, Point>;
const DECK = 3.4;
/* A point along its arch, from one end at 0 to the other at 1, lifted by `up`. */
const arch = (t: number, up = 0): Point => [
  n((1 - t) ** 2 * BRIDGE.from[0] + 2 * t * (1 - t) * BRIDGE.pull[0] + t ** 2 * BRIDGE.to[0]),
  n((1 - t) ** 2 * BRIDGE.from[1] + 2 * t * (1 - t) * BRIDGE.pull[1] + t ** 2 * BRIDGE.to[1] - up),
];
/* The whole arch as a line, lifted by `up`: the deck, or a rail above it. */
const span = (up: number): string => `M${BRIDGE.from[0]},${n(BRIDGE.from[1] - up)}Q${BRIDGE.pull[0]},${n(BRIDGE.pull[1] - up)} ${BRIDGE.to[0]},${n(BRIDGE.to[1] - up)}`;
/* The part of the arch between two lifts: the side of the deck, or the planks on top of it. */
const band = (from: number, to: number): string =>
  `${span(from)}L${BRIDGE.to[0]},${n(BRIDGE.to[1] - to)}Q${BRIDGE.pull[0]},${n(BRIDGE.pull[1] - to)} ${BRIDGE.from[0]},${n(BRIDGE.from[1] - to)}Z`;
/* How far up the drawing the far side of the deck is from the near side: the bridge is seen a little from above. */
const ACROSS = 3.8;
/* A post with an onion-shaped cap, as stands at each end of a rail. */
const newel = ([x, y]: Point): string => `<path class="bridge-post" d="M${x},${n(y)}v-11.6"/><path class="bridge-wood" d="M${x},${n(y - 15.6)}q1.9,2.2 1.6,3.4q-0.4,0.9 -1.6,0.9q-1.2,0 -1.6,-0.9q-0.3,-1.2 1.6,-3.4Z"/>`;
/* One side's rail, standing on the deck at `lift`: its posts, its two rails, and the capped post at each end. */
const railing = (lift: number): string =>
  [0.07, 0.21, 0.36, 0.5, 0.64, 0.79, 0.93].map((t) => `<path class="bridge-post thin" d="M${arch(t, lift).join(',')}v-9.4"/>`).join('') +
  `<path class="bridge-rail thin" d="${span(lift + 4.8)}"/><path class="bridge-rail" d="${span(lift + 9.2)}"/>` +
  newel([BRIDGE.from[0], BRIDGE.from[1] - lift]) + newel([BRIDGE.to[0], BRIDGE.to[1] - lift]);
/* Where it stands in the water: the level of the water there, and the legs under it. */
const WATERLINE = (BRIDGE.from[1] + BRIDGE.to[1]) / 2 + 2;
const LEGS = [0.26, 0.74].map((t) => arch(t, -DECK));
const BRIDGE_DRAWN = LEGS.map(([x, y]) => `<path class="bridge-leg" d="M${x},${y}V${WATERLINE}"/>`).join('') +
  // The far rail first, then the planks, the side of the deck, and the near rail over them all
  `<g class="bridge-far">${railing(ACROSS)}</g><path class="bridge-top" d="${band(0, ACROSS)}"/>` +
  `<path class="bridge-wood" d="${band(0, -DECK)}"/>` +
  `<path class="bridge-planks" d="${Array.from({ length: 13 }, (_, i) => `M${arch(0.05 + i * 0.075, ACROSS).join(',')}v${ACROSS + DECK}`).join('')}"/>` +
  `<path class="bridge-shade" d="${span(-DECK)}"/><path class="bridge-light" d="${span(0)}"/>${railing(0)}`;
/* The arch and its rail upside down in the water before it, and the rings about its legs. */
const mirrored = (lift: number): string =>
  `M${BRIDGE.from[0]},${WATERLINE}Q${BRIDGE.pull[0]},${n(WATERLINE + (WATERLINE - BRIDGE.pull[1] + lift) * MIRRORED)} ${BRIDGE.to[0]},${WATERLINE}`;
const BRIDGE_MIRRORED = `<path class="bridge-mirrored" d="${mirrored(0)}"/><path class="bridge-mirrored thin" d="${mirrored(9.2)}"/>`;
const BRIDGE_RINGS = LEGS.map(([x]) => `<ellipse class="ripple" cx="${x}" cy="${WATERLINE}" rx="4.4" ry="1.5"/>`).join('');

/* ---------- The bamboo spout ---------- */

/*
 * The spout at the pond's left end, its foot at 0,0. Water runs from a thin
 * bamboo pipe into the open end of a thicker one that rocks on a pin. As it
 * fills, its open end sinks, it empties into the pond, and it swings back,
 * its closed end knocking on the stone under it. `TIPS` is one round of that,
 * in seconds, and the turns the rocker goes through in it.
 */
const SPOUT_AT: Point = [-192, 6];
const TIPS = { seconds: 10, turns: '-26;-26;17;17;-26;-22;-26;-26', when: '0;0.74;0.79;0.85;0.89;0.9;0.915;1' };
const round = (what: string, values: string, when: string): string =>
  `<animate attributeName="${what}" values="${values}" keyTimes="${when}" dur="${TIPS.seconds}s" repeatCount="indefinite"/>`;
/* The water it empties into the pond, and the ring where that lands. */
const POURING = `<path class="pour" d="M16.6,-4.6Q20,-2.4 21,2" opacity="0">${round('opacity', '0;0;0.9;0.9;0;0', '0;0.78;0.8;0.85;0.88;1')}</path>` +
  `<ellipse class="ring" cx="21.5" cy="2.6" rx="0.5" ry="0.2">${round('rx', '0.5;0.5;9;9', '0;0.8;0.97;1')}${round('ry', '0.2;0.2;3.4;3.4', '0;0.8;0.97;1')}${round('opacity', '0;0;0.8;0;0', '0;0.8;0.83;0.97;1')}</ellipse>`;
const spout = (still: boolean): string => `<g transform="translate(${SPOUT_AT[0]},${SPOUT_AT[1]})">` +
  rocks([[-11, 4, 15, 8, false], [7, 5.5, 13, 6, true]], 'bank') +
  // The post, and the pipe the water comes along
  '<path class="bamboo" d="M-18.6,3L-18.6,-30.6L-15.4,-31.4L-15.4,3Z"/><path class="bamboo-joint" d="M-18.6,-9h3.2M-18.6,-20h3.2"/>' +
  '<path class="bamboo" d="M-17,-27.6L13.4,-25.4L13.6,-23.6L-17,-25.4Z"/>' +
  `<path class="trickle" d="M13.5,-24.2Q15.2,-22.4 15.4,-17.6"/>` +
  // The pin's far post, the rocker, and the near post over it
  '<path class="bamboo" d="M-1.3,3L-1.3,-12.4L1.3,-12.4L1.3,3Z"/>' +
  `<g transform="translate(0,-10)"><g transform="rotate(-26)">${still ? '' : `<animateTransform attributeName="transform" type="rotate" values="${TIPS.turns}" keyTimes="${TIPS.when}" dur="${TIPS.seconds}s" repeatCount="indefinite"/>`}` +
  '<path class="bamboo" d="M-11,-1.9L15.4,-1.9L18,1.9L-11,1.9Z"/><path class="bamboo-joint" d="M-11,-1.9v3.8M-3.6,-1.9v3.8M6.4,-1.9v3.8"/><path class="bamboo-mouth" d="M15.4,-1.9L18,1.9"/></g></g>' +
  `<circle class="bamboo-pin" cx="0" cy="-10" r="1"/>${still ? '' : POURING}</g>`;

/* ---------- Koi ---------- */

/*
 * A koi seen from above with its head forward: its fins, its tail, which it
 * moves from side to side as it swims, its body, its markings, and its eyes.
 */
const KOI_FINS = 'M5.4,-3C5,-6.2 2.2,-7.4 0.4,-6.8C1.6,-5.4 3,-4.2 3.8,-3.3ZM5.4,3C5,6.2 2.2,7.4 0.4,6.8C1.6,5.4 3,4.2 3.8,3.3Z' +
  'M-1.6,-3.2C-2.2,-4.8 -3.6,-5.2 -4.4,-4.8C-3.6,-4 -2.8,-3.4 -2.4,-3.1ZM-1.6,3.2C-2.2,4.8 -3.6,5.2 -4.4,4.8C-3.6,4 -2.8,3.4 -2.4,3.1Z';
const KOI_TAIL = 'M-8,0C-10.4,-1.2 -12.6,-4.6 -15.8,-5.4C-14.4,-2.8 -14.2,-1 -13.2,0C-14.2,1 -14.4,2.8 -15.8,5.4C-12.6,4.6 -10.4,1.2 -8,0Z';
const KOI_BODY = 'M10,0C10,-2.3 7.2,-3.6 3.4,-3.6C-1.2,-3.6 -5.2,-2.2 -8.6,-0.8L-8.6,0.8C-5.2,2.2 -1.2,3.6 3.4,3.6C7.2,3.6 10,2.3 10,0Z';
/* A marking on a koi: where it is along and across the body, how large, and its colour. */
type Mark = readonly [x: number, y: number, rx: number, ry: number, colour: string];
/* One that swims: its colour and markings, how large it is, the way it goes round as seen on the water, and how long that takes. */
interface Swimmer {
  colour: string;
  marks: readonly Mark[];
  size: number;
  way: readonly Point[];
  seconds: number;
}
const SWIMMERS: readonly Swimmer[] = [
  // Red and white, the largest, round the left pool
  { colour: 'koi-white', size: 1.15, seconds: 36, marks: [[6, -0.3, 2.9, 2, 'koi-red'], [-0.6, 0.6, 3, 2.2, 'koi-red'], [-5.6, -0.2, 1.7, 1.1, 'koi-red']],
    way: [[-150, 4], [-120, -18], [-70, -24], [-20, -16], [4, 4], [-20, 26], [-70, 34], [-124, 26]] },
  // White with red and a little black, round the island
  { colour: 'koi-white', size: 1, seconds: 30, marks: [[5.4, 0.4, 2.4, 1.8, 'koi-red'], [-2, -0.4, 2.8, 2, 'koi-red'], [1.6, 1.6, 1, 0.8, 'koi-black'], [-4.6, 1, 0.9, 0.7, 'koi-black'], [7.4, -1.2, 0.7, 0.6, 'koi-black']],
    way: [[20, -2], [34, 16], [66, 24], [104, 18], [128, 2], [112, -18], [66, -26], [30, -18]] },
  // Gold, through both pools and back
  { colour: 'koi-gold', size: 0.95, seconds: 52, marks: [],
    way: [[-140, 10], [-96, 30], [-40, 22], [2, 4], [40, -22], [90, -30], [146, -14], [150, 12], [110, 30], [50, 30], [4, 12], [-36, -20], [-90, -28], [-136, -12]] },
  // Black with red and white, in the middle of the left pool
  { colour: 'koi-black', size: 1.05, seconds: 24, marks: [[5.6, -0.2, 2.6, 1.9, 'koi-red'], [-1.4, 0.8, 2.4, 1.6, 'koi-white'], [-5, -0.4, 1.8, 1.2, 'koi-red'], [1.8, -1.6, 1, 0.7, 'koi-white']],
    way: [[-110, 2], [-90, 16], [-56, 18], [-34, 4], [-50, -10], [-86, -12]] },
  // A small orange one, before the island
  { colour: 'koi-red', size: 0.72, seconds: 18, marks: [[2.4, 0.6, 1.8, 1.3, 'koi-white']],
    way: [[96, 26], [120, 32], [146, 22], [150, 6], [128, 8], [106, 16]] },
  // Grey-blue, slowly along the near shore and back
  { colour: 'koi-blue', size: 0.9, seconds: 58, marks: [[6.6, 0, 2, 1.6, 'koi-white'], [-2, 0, 4.4, 0.9, 'koi-white']],
    way: [[-146, 20], [-104, 37], [-50, 39], [10, 34], [70, 35], [126, 30], [134, 20], [90, 24], [40, 22], [-10, 20], [-60, 24], [-110, 22]] },
];
function koi(still: boolean): string {
  return `<g class="koi" transform="scale(1,${PRESSED})">${SWIMMERS.map(({ colour, marks, size, way, seconds }, at) => {
    // The way as it lies in this flattened drawing, where the koi keeps its own shape as it turns
    const flat = way.map(([x, y]): Point => [x, y / PRESSED]);
    // Each is somewhere else along its way, so they are spread about the pond: where it rests, or how far round it has come as the page opens
    const from = flat[(at * 3) % flat.length], next = flat[(at * 3 + 1) % flat.length];
    const rest = `translate(${n(from[0])},${n(from[1])}) rotate(${n((Math.atan2(next[1] - from[1], next[0] - from[0]) * 180) / Math.PI)})`;
    const swims = `<animateMotion path="${smooth(flat)}" dur="${seconds}s" begin="-${n(seconds * ((at * 0.37) % 1))}s" repeatCount="indefinite" rotate="auto"/>`;
    return `<g${still ? ` transform="${rest}"` : ''}>${still ? '' : swims}` +
      `<g transform="scale(${size})"><path class="koi-fin" d="${KOI_FINS}"/>` +
      `<path class="koi-fin" d="${KOI_TAIL}">${still ? '' : `<animateTransform attributeName="transform" type="rotate" values="-13 -8.4 0;13 -8.4 0;-13 -8.4 0" dur="${n(1.1 + at * 0.13)}s" repeatCount="indefinite"/>`}</path>` +
      `<path class="${colour}" d="${KOI_BODY}"/>${marks.map(([x, y, rx, ry, mark]) => `<ellipse class="${mark}" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`).join('')}` +
      '<path class="koi-back" d="M5,0H-6.4"/><circle class="koi-eye" cx="7.9" cy="-1.7" r="0.45"/><circle class="koi-eye" cx="7.9" cy="1.7" r="0.45"/></g></g>';
  }).join('')}</g>`;
}

/* ---------- Small life on and over the water ---------- */

/* Where a koi comes up to the surface now and then and leaves a ring, and how many seconds pass between one ring and the next. */
const KISSES: readonly (readonly [x: number, y: number, seconds: number])[] = [[-58, 8, 11], [118, -8, 17], [-126, 16, 23]];
const kisses = (still: boolean): string => (still ? '' : KISSES.map(([x, y, seconds]) => {
  // The ring takes the last two and a half seconds or so of the wait
  const start = Number((1 - 2.6 / seconds).toFixed(3)), grow = (what: string, to: number): string => `<animate attributeName="${what}" values="0.4;0.4;${to}" keyTimes="0;${start};1" dur="${seconds}s" repeatCount="indefinite"/>`;
  return `<ellipse class="ring" cx="${x}" cy="${y}" rx="0.4" ry="0.2">${grow('rx', 10)}${grow('ry', n(10 * PRESSED))}` +
    `<animate attributeName="opacity" values="0;0;0.7;0" keyTimes="0;${start};${(start + 0.03).toFixed(3)};1" dur="${seconds}s" repeatCount="indefinite"/></ellipse>`;
}).join(''));

/* A red dragonfly: its wings, which blur as they beat, its body and its head. */
const dragonfly = (still: boolean): string => `<g transform="scale(0.85)"><g class="wings">${still ? '' : '<animate attributeName="opacity" values="0.8;0.35;0.8" dur="0.16s" repeatCount="indefinite"/>'}` +
  '<ellipse cx="1.3" cy="-2.7" rx="0.95" ry="3.1" transform="rotate(16 1.3 0)"/><ellipse cx="1.3" cy="2.7" rx="0.95" ry="3.1" transform="rotate(-16 1.3 0)"/>' +
  '<ellipse cx="-0.5" cy="-2.4" rx="0.85" ry="2.7" transform="rotate(-14 -0.5 0)"/><ellipse cx="-0.5" cy="2.4" rx="0.85" ry="2.7" transform="rotate(14 -0.5 0)"/></g>' +
  '<path d="M-4.6,0H3.2"/><circle cx="3.9" cy="0" r="0.95"/></g>';
/* The two that are about by day: the points each hovers at in turn, darting from one to the next, and how long a round takes. */
const DRAGONFLIES: readonly (readonly [way: string, seconds: number])[] = [['M-150,-50L-124,-46L-136,-62L-104,-52Z', 11], ['M140,10L112,20L150,24L128,4Z', 14]];
const dragonflies = (still: boolean): string => `<g class="only-light">${DRAGONFLIES.map(([way, seconds]) =>
  `<g class="dragonfly"${still ? ` transform="translate(${way.slice(1, way.indexOf('L'))})"` : ''}>` +
  (still ? '' : `<animateMotion path="${way}" keyPoints="0;0;0.25;0.25;0.5;0.5;0.78;0.78;1" keyTimes="0;0.2;0.24;0.45;0.49;0.7;0.75;0.95;1" calcMode="linear" dur="${seconds}s" repeatCount="indefinite"/>`) +
  `${dragonfly(still)}</g>`).join('')}</g>`;

/* The fireflies that come out over the pond after dark: where each drifts about, how far, and how long a round takes. */
const FIREFLIES: readonly (readonly [x: number, y: number, reach: number, seconds: number])[] = [[-170, -42, 14, 9], [-30, -74, 10, 12], [62, -28, 12, 8], [150, -40, 16, 11], [-100, 6, 12, 13]];
const fireflies = (still: boolean): string => `<g class="only-dark">${FIREFLIES.map(([x, y, reach, seconds], i) =>
  `<g transform="translate(${x},${y})"><g>` +
  (still ? '' : `<animateMotion path="M0,0q${reach},${n(-reach * 0.7)} ${n(reach * 1.6)},${n(reach * 0.2)}t${n(-reach * 1.2)},${n(reach * 0.5)}T0,0" dur="${seconds}s" repeatCount="indefinite"/>` +
    `<animate attributeName="opacity" values="0.15;1;0.15" dur="3.4s" begin="${n(-i * 0.7)}s" repeatCount="indefinite"/>`) +
  '<circle r="4" fill="url(#gardenFly)"/><circle class="firefly-heart" r="0.9"/></g></g>').join('')}</g>`;

/* Petals fallen from the tree's blossoms, afloat on the pool nearest the tree: where each lies, how it is turned, and how far into its drifting it begins. */
const PETALS: readonly (readonly [x: number, y: number, turn: number, d: number])[] = [[-140, -3, 20, 0], [-96, 13, -35, 9], [-64, 27, 60, 4], [-46, -5, -10, 15], [-18, 15, 40, 21], [-2, 30, -50, 12]];
const PETALS_AFLOAT = `<g class="afloat">${PETALS.map(([x, y, turn, d]) =>
  `<ellipse cx="${x}" cy="${y}" rx="1.7" ry="0.85" transform="rotate(${turn} ${x} ${y})" style="--d:-${d}s"/>`).join('')}</g>`;

/* ---------- Light on the water ---------- */

const SHINE = [[-150, -8, 16, 0], [-112, 4, 26, 1.6], [-64, -14, 15, 3], [-128, 30, 20, 2.2], [-40, 12, 24, 0.8], [-76, 38, 18, 3.6], [30, -22, 16, 2.6], [8, 24, 20, 1.2], [70, 30, 22, 2.9], [120, -22, 16, 0.4], [146, 4, 14, 3.3], [100, 22, 12, 1.9]];
/* The moon's path on the left pool after dark, broken by the ripples, and the lantern's light trembling before its rock. */
const MOON_PATH = [[-98, -22, 24, 0], [-94, -15, 18, 1.3], [-101, -8, 30, 2.4], [-92, 0, 16, 0.6], [-99, 8, 26, 3.1], [-90, 16, 14, 1.8], [-96, 24, 20, 2.7]];
const GLEAM = [[-5, -4, 10, 0], [-3, 0.5, 6, 1.2], [-6, 5, 12, 2.1], [-2, 9.5, 5, 0.5]];

/* ---------- Put together ---------- */

const DEFS = `<defs>${SHADES}` +
  '<linearGradient id="gardenDeep" x1="0" y1="0" x2="0" y2="1"><stop class="water-rim" offset="0.3" stop-opacity="0"/><stop class="water-rim" offset="1" stop-opacity="0.42"/></linearGradient>' +
  '<linearGradient id="gardenMound" x1="0" y1="0" x2="0" y2="1"><stop class="moss-light" offset="0"/><stop class="moss-ground" offset="1"/></linearGradient>' +
  '<linearGradient id="gardenPine" x1="0" y1="0" x2="0" y2="1"><stop class="pine-light" offset="0"/><stop class="pine-dark" offset="0.85"/></linearGradient>' +
  '<radialGradient id="gardenFly"><stop class="firefly-glow" offset="0" stop-opacity="0.7"/><stop class="firefly-glow" offset="0.4" stop-opacity="0.2"/><stop class="firefly-glow" offset="1" stop-opacity="0"/></radialGradient>' +
  `<clipPath id="gardenClip"><path d="${WATER}"/></clipPath></defs>`;

/* What stands on the far bank, and its outline upside down in the water. */
const FAR_BANK = '<ellipse cx="0" cy="10" rx="214" ry="62" fill="url(#pondMoss)"/>' +
  // The ground goes on to the right where the tree's own ground line stops
  '<path class="ground" d="M102,-44C128,-45 156,-43.6 182,-40.4"/>' +
  AZALEAS.map(azalea).join('') + irises(IRIS_LEAVES, IRIS_STEMS) + cattails + rocks(FAR_ROCKS, 'far');
const lantern = (parts: string): string => `<g transform="translate(${LANTERN_AT[0]},${LANTERN_AT[1]})">${parts}</g>`;
const MIRROR = '<g class="mirror">' +
  FAR_ROCKS.map((s) => `<path d="${stone(s).outline}" transform="matrix(1 0 0 -${MIRRORED} 0 ${n((1 + MIRRORED) * s[1])})"/>`).join('') +
  `<g transform="translate(0,${n((1 + MIRRORED) * LANTERN_ROCK[1])}) scale(1,-${MIRRORED})"><path d="${stone(LANTERN_ROCK).outline}"/>${lantern(LANTERN)}</g>` +
  // The island and its pine lie dark on the water before them
  '<ellipse cx="66" cy="15" rx="40" ry="7.5"/><path d="M24,16Q20,30 30,44L96,44Q104,28 98,16Z" opacity="0.45"/></g>';

/* Everything under the koi: the far bank, the water with its depth and the pebbles under it, and what is mirrored in it. */
const UNDER = DEFS + FAR_BANK +
  `<path class="bank" d="${WATER}"/><path class="pond-water" d="${WATER}" fill="url(#pondWater)"/>` +
  `<g clip-path="url(#gardenClip)"><path d="${WATER}" fill="url(#gardenDeep)"/>${SUNK}${MIRROR}${BRIDGE_MIRRORED}`;
/* Everything on the water over the koi: the shade of its banks, the sky, the light of the moon and the lantern, the streaks of light, and the lilies. */
const surface = (still: boolean): string => `<path class="rim" d="${WATER}"/><path d="${WATER}" fill="url(#pondSky)"/>` +
  '<g class="only-light sky-light"><ellipse cx="-58" cy="-10" rx="48" ry="9" fill="url(#pondGlint)"/><ellipse cx="112" cy="-21" rx="36" ry="7" fill="url(#pondGlint)"/></g>' +
  `<g class="only-dark"><ellipse class="moon-glow" cx="-94" cy="2" rx="30" ry="15" fill="url(#pondGlint)"/><g class="shine moon-path">${streaks(MOON_PATH)}</g>` +
  `<ellipse class="flame" cx="${LIT_BELOW[0]}" cy="${LIT_BELOW[1]}" rx="7" ry="10" fill="url(#pondGlow)"/><g class="shine gleam">${streaks(GLEAM, LIT_BELOW)}</g></g>` +
  `<g class="shine">${streaks(SHINE)}</g>${BRIDGE_RINGS}${kisses(still)}${PETALS_AFLOAT}${LILIES}</g>`;
/* What stands in the water: the lantern on its rock, the lotus, the island with its pine rising from behind the stones of its near shore, and the bridge. */
const STANDING = rock(LANTERN_ROCK, 'water') +
  `<g class="lantern">${lantern(LANTERN + LANTERN_LINES)}</g><g class="only-dark"><circle class="flame" cx="${LIT[0]}" cy="${LIT[1]}" r="20" fill="url(#pondGlow)"/></g>` +
  LOTUS + rocks(ISLE_BACK, 'water') + `<path class="isle" d="${ISLE}"/>` + PINE + rocks(ISLE_FRONT, 'water') + rocks(LANDING, 'water') + TURTLE + BRIDGE_DRAWN;
const nearBank = (still: boolean): string => BEACH + rocks(NEAR_ROCKS, 'bank') + FERNS.map(fern).join('') + tufts + spout(still);

export const GARDEN_POND: Pond = {
  // Its left end just past the reach of the roots. It is wider than a small tree's frame, which makes room for it.
  at: { x: 480, y: 44 },
  // From the spout at the left end to the stones of the right bank, and from the top of the pine down to the near bank
  box: { x: -218, y: -112, w: 434, h: 186 },
  // Along the middle of the left pool, clear of the lilies, the lotus and the island
  lanes: [{ from: -152, to: -78, y: 6 }],
  markup: (still) => UNDER + koi(still) + surface(still) + STANDING + (still ? '' : LEAPING) + nearBank(still) + dragonflies(still) + fireflies(still),
};
