/*
 * The koi pond: the smaller of the two ponds, a quiet Japanese garden pool.
 *
 * The pool is gourd-shaped, as old garden ponds often are, and weathered
 * stones stand around it, some with moss on them. A snow-viewing lantern
 * stands on the far bank and irises flower at the other end. Lily pads float
 * on the water, one with a flower open, and three koi swim slowly under it.
 * After dark the moon's light lies on the water and the lantern is lit, its
 * light trembling in the water below it.
 * Author: George Khananaev
 */

import { LEAPING, MIRRORED, SHADES, irises, lily, n, pad, smooth, stone, stones, streaks } from './parts';
import type { Blade, Pad, Point, Pond, Stone } from './parts';

/* The water's edge: a larger round pool on the left and a smaller one on the right, narrowing between them, its far side higher up than its near side. */
const WATER = smooth([
  [-118, 1], [-108, -10], [-84, -17], [-52, -19.5], [-22, -16.5], [-3, -11], [12, -10], [30, -15], [58, -17.5], [86, -15.5], [104, -9], [113, -1],
  [109, 8], [90, 14], [62, 16], [34, 13], [16, 9], [1, 11], [-20, 18], [-52, 21.5], [-86, 19.5], [-108, 12],
]);

/*
 * The stones are set as a garden's stones are, in small groups of unequal
 * stones with the bank showing between the groups. On the far bank the
 * water's edge hides their feet, and one tall stone stands among them. On the
 * near bank they stand in front of the water, and the largest two close it at
 * either end.
 */
const FAR_STONES: readonly Stone[] = [
  [-102, -9, 19, 11, true], [-88, -13, 10, 6, false],
  [-62, -16, 16, 21, true], [-48, -17, 12, 7, false], [-37, -16.5, 8, 5, false],
  [2, -8.5, 15, 8, true],
  [56, -15, 17, 10, false], [69, -15.5, 8, 5, false], [96, -11.5, 15, 9, true],
];
const NEAR_STONES: readonly Stone[] = [
  [-104, 20, 22, 12, false], [-86, 24, 12, 7, true], [-124, 10, 30, 22, true],
  [-52, 27.5, 32, 10, true], [-32, 24, 10, 6, false],
  [12, 14.5, 18, 11, true], [26, 16, 9, 6, false],
  [72, 21.5, 22, 12, true], [90, 18, 13, 8, false], [118, 9, 26, 19, true],
];

/*
 * The snow-viewing lantern on the far bank, its feet at 0,0: two legs spread
 * wide and one between them, the shelf they hold up, the firebox, the broad
 * roof with its tips turned up, and the jewel on top. Its window is round.
 */
const LANTERN_AT: Point = [80, -17.5];
const LANTERN_WINDOW: Point = [0, -23.8];
const LANTERN = [
  'M-7.6,-15C-9.6,-9.5 -12.6,-4.6 -16.6,0L-13,0C-10.4,-4.4 -7.8,-9.4 -4.4,-15Z',
  'M7.6,-15C9.6,-9.5 12.6,-4.6 16.6,0L13,0C10.4,-4.4 7.8,-9.4 4.4,-15Z',
  'M-1.6,-15L-1.9,0.6L1.9,0.6L1.6,-15Z',
  'M-11.5,-14.6L11.5,-14.6L10.4,-18.6L-10.4,-18.6Z',
  'M-6.6,-18.6L6.6,-18.6L6.6,-29L-6.6,-29Z',
  'M-22.2,-31.6Q-14,-30 -9,-34Q-3,-38.6 0,-38.7Q3,-38.6 9,-34Q14,-30 22.2,-31.6Q22.4,-29.2 19.6,-28.6L-19.6,-28.6Q-22.4,-29.2 -22.2,-31.6Z',
  'M-2.4,-38.4L2.4,-38.4L2,-40.2L-2,-40.2Z',
  'M0,-46.6C1.4,-44.6 3,-43.4 3,-41.9C3,-40.6 1.7,-40 0,-40C-1.7,-40 -3,-40.6 -3,-41.9C-3,-43.4 -1.4,-44.6 0,-46.6Z',
].map((d) => `<path d="${d}"/>`).join('');
/* Where the lantern's window is in the pond's drawing, and where the window's reflection lies in the water. */
const LIT: Point = [LANTERN_AT[0] + LANTERN_WINDOW[0], LANTERN_AT[1] + LANTERN_WINDOW[1]];
const LIT_BELOW: Point = [LIT[0], n(LANTERN_AT[1] - LANTERN_WINDOW[1] * MIRRORED)];

/* Irises at the far left, behind the stones there: sword-shaped leaves, and three flowers on stems. */
const IRIS_LEAVES: readonly Blade[] = [[-112, -6, -6, 22], [-108, -8, -3, 30], [-104, -9, 1, 34], [-99, -10, 5, 27], [-94, -11, -2, 24], [-90, -12, 6, 19]];
const IRIS_STEMS: readonly Blade[] = [[-106, -8, -4, 36], [-97, -10, 3, 31], [-89, -12, 2, 24]];

/* Lily pads on the water. One holds a flower open and another a bud. */
const PRESSED_PADS = 0.36;
const PADS: readonly Pad[] = [[-74, 9, 8.5, 30], [-60, 14.5, 6.5, 200], [-89, 4, 5.5, 120], [46, 7, 7.5, 250], [59, 2, 5, 80]];
const LILIES = PADS.map((one) => pad(one, PRESSED_PADS)).join('') + lily(-74, 8.4) +
  '<g class="lily"><path d="M46,6.2C44.6,4.8 45,2.4 46,1C47,2.4 47.4,4.8 46,6.2Z"/></g>';

/* Streaks of light on the water, and the lantern's light trembling in the water below it. */
const SHINE = [[-92, -3, 15, 0], [-56, 5, 24, 1.6], [-24, -6, 13, 3], [-70, 14, 18, 2.2], [24, 1, 12, 0.8], [52, -7, 16, 3.6], [80, 11, 12, 2.6]];
const GLEAM = [[-4, -3, 8, 0], [-2, 1, 5, 1.2], [-5, 4.5, 9, 2.1]];

/*
 * A koi seen from above with its head forward: the fins under it, then its
 * tail and its body, and its markings over that. They swim in a drawing
 * pressed flat from front to back, as the water is seen from the bank, so a
 * koi turning towards the bank looks shorter.
 */
const KOI_FINS = 'M4.2,-2.6C3.4,-4.8 1.6,-5.4 0.6,-5C1.4,-4 2.4,-3.2 3,-2.7ZM4.2,2.6C3.4,4.8 1.6,5.4 0.6,5C1.4,4 2.4,3.2 3,2.7Z';
const KOI_TAIL = 'M-6.6,0C-8.4,-0.8 -10.2,-3.4 -12.4,-3.9C-11.4,-1.8 -11.4,1.8 -12.4,3.9C-10.2,3.4 -8.4,0.8 -6.6,0Z';
const KOI_BODY = 'M8.5,0C8.5,-2.1 6,-3.1 2.5,-3.1C-1.5,-3.1 -4.5,-1.7 -7,-0.7L-7,0.7C-4.5,1.7 -1.5,3.1 2.5,3.1C6,3.1 8.5,2.1 8.5,0Z';
const PRESSED = 0.4;
/* The three that swim: the colour of each and of its markings, the way it goes round, how long that takes, and where it rests when nothing may move. */
interface Swimmer {
  colour: string;
  marks: string;
  marked: readonly (readonly [x: number, y: number, rx: number, ry: number])[];
  way: string;
  seconds: number;
  rest: string;
}
const SWIMMERS: readonly Swimmer[] = [
  { colour: 'koi-white', marks: 'koi-red', marked: [[5.2, -0.3, 2.5, 1.7], [-1, 0.5, 2.6, 1.9], [-4.8, -0.2, 1.4, 0.9]], way: 'M-95,2.5A40,27 0 1 1 -15,2.5A40,27 0 1 1 -95,2.5Z', seconds: 28, rest: 'translate(-62,-20) rotate(8)' },
  { colour: 'koi-gold', marks: '', marked: [], way: 'M92,-1.5A30,22 0 1 0 32,-1.5A30,22 0 1 0 92,-1.5Z', seconds: 22, rest: 'translate(58,14) rotate(172)' },
  {
    colour: 'koi-red', marks: 'koi-white', marked: [[3.4, 0.7, 1.7, 1.2], [-3.2, -0.5, 1.9, 1]], seconds: 38, rest: 'translate(-28,26) rotate(-14)',
    // Round both pools, crossing between them
    way: smooth([[-82, 14], [-50, 34], [-14, 18], [6, 2], [28, -16], [66, -22], [92, -4], [74, 16], [40, 14], [8, -2], [-16, -22], [-56, -30], [-84, -12]]),
  },
];
const koi = (still: boolean): string => `<g class="koi" transform="scale(1,${PRESSED})">${SWIMMERS.map((s) =>
  `<g${still ? ` transform="${s.rest}"` : ''}>${still ? '' : `<animateMotion path="${s.way}" dur="${s.seconds}s" repeatCount="indefinite" rotate="auto"/>`}` +
  `<path class="koi-fin" d="${KOI_FINS}"/><path class="koi-fin" d="${KOI_TAIL}"/><path class="${s.colour}" d="${KOI_BODY}"/>` +
  s.marked.map(([x, y, rx, ry]) => `<ellipse class="${s.marks}" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`).join('') + '</g>').join('')}</g>`;

const DEFS = `<defs>${SHADES}<clipPath id="pondClip"><path d="${WATER}"/></clipPath></defs>`;

/* Everything behind the koi: the moss the pond is set in, the irises, the lantern and the far stones, then the water, and in it the reflections of what stands on the far bank. */
const BEHIND = DEFS + '<ellipse cx="0" cy="6" rx="140" ry="30" fill="url(#pondMoss)"/>' + irises(IRIS_LEAVES, IRIS_STEMS) +
  `<g class="lantern" transform="translate(${LANTERN_AT[0]},${LANTERN_AT[1]})">${LANTERN}<circle cx="${LANTERN_WINDOW[0]}" cy="${LANTERN_WINDOW[1]}" r="3.2"/></g>` +
  `<g class="only-dark"><circle class="flame" cx="${LIT[0]}" cy="${LIT[1]}" r="16" fill="url(#pondGlow)"/></g>` +
  stones(FAR_STONES) +
  `<path class="pond-water" d="${WATER}" fill="url(#pondWater)"/>` +
  '<g clip-path="url(#pondClip)"><g class="mirror">' +
  FAR_STONES.map((s) => `<path d="${stone(s).outline}" transform="matrix(1 0 0 -${MIRRORED} 0 ${n((1 + MIRRORED) * s[1])})"/>`).join('') +
  `<g transform="translate(${LANTERN_AT[0]},${LANTERN_AT[1]}) scale(1,-${MIRRORED})">${LANTERN}</g></g>`;
/* Everything over the koi: the sky in the water, the moon's light and the lantern's after dark, the streaks of light and the lilies. The leap and the stones in front come after. */
const OVER = `<path d="${WATER}" fill="url(#pondSky)"/>` +
  '<ellipse class="only-dark" cx="-46" cy="3" rx="36" ry="5.5" fill="url(#pondGlint)"/>' +
  `<g class="shine">${streaks(SHINE)}</g>` +
  `<g class="only-dark"><ellipse class="flame" cx="${LIT_BELOW[0]}" cy="${LIT_BELOW[1]}" rx="5.5" ry="9" fill="url(#pondGlow)"/><g class="shine gleam">${streaks(GLEAM, LIT_BELOW)}</g></g>` +
  `${LILIES}</g>`;

export const KOI_POND: Pond = {
  // Past the reach of the roots, and inside the tree's frame however small the tree
  at: { x: 412, y: 22 },
  // From the stone at one end to the stone at the other, which is where a small tree's frame ends, and from the top of the lantern down to the stones in front
  box: { x: -142, y: -72, w: 280, h: 110 },
  // Along the middle of the water, far enough from both ends that the rings a leap makes stay on it
  lanes: [{ from: -96, to: 36, y: 2 }],
  markup: (still) => BEHIND + koi(still) + OVER + (still ? '' : LEAPING) + stones(NEAR_STONES),
};
