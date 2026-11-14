/*
 * The sky at a moment: how much of the moon is lit, which way it is turned,
 * and how high the sun and the moon stand over a place. Plain arithmetic,
 * with nothing of the page in it, so that it can be checked against days and
 * nights that are on record.
 *
 * The sums are the short ones from the Astronomical Almanac. They put the sun
 * within a hundredth of a degree and the moon within a third of one, which is
 * far closer than a drawing can show.
 * Author: George Khananaev
 */

const RAD = Math.PI / 180;
/* Noon on 1 January 2000, Greenwich time. The sums count their days from it. */
const START = Date.UTC(2000, 0, 1, 12);

/* Everything here is in degrees */
const sin = (degrees: number): number => Math.sin(degrees * RAD);
const cos = (degrees: number): number => Math.cos(degrees * RAD);
const angle = (y: number, x: number): number => Math.atan2(y, x) / RAD;
const rise = (ratio: number): number => Math.asin(Math.max(-1, Math.min(1, ratio))) / RAD;
const round = (degrees: number): number => ((degrees % 360) + 360) % 360;

/* A place on the earth, in degrees. North and east are the positive ways. */
export interface Place {
  latitude: number;
  longitude: number;
}

export interface Sky {
  /* How much of the moon's face is lit, from 0 at the new moon to 1 when it is full. */
  lit: number;
  /* Whether the lit part is growing. */
  waxing: boolean;
  /* How far the moon's face is turned from upright, in degrees clockwise. */
  face: number;
  /* Which way the lit edge points, in degrees clockwise from the right. */
  limb: number;
  /* How high the sun and the moon stand over the place, in degrees above the horizon. Under it they are below 0. Without a place there is nothing to say. */
  sunHeight: number | null;
  moonHeight: number | null;
}

/* Where something is among the stars: how far round the sky's equator, and how far up from it. */
interface Among {
  round: number;
  up: number;
}

/* From where it is along the sun's yearly path and how far to the side of it, given how far the earth leans. */
function among(along: number, aside: number, lean: number): Among {
  return {
    round: angle(sin(along) * cos(lean) - Math.tan(aside * RAD) * sin(lean), cos(along)),
    up: rise(sin(aside) * cos(lean) + cos(aside) * sin(lean) * sin(along)),
  };
}

/*
 * The sky at a moment. The moon's phase is the same for everyone on earth.
 * Which way the moon is turned is not: seen from the north its lit edge leans
 * one way, from the south the other, and near the equator it lies on its
 * back. So with a place the moon is turned as it is seen from there, and
 * without one as it is seen from the north when it stands highest.
 */
export function skyOver(when: Date, place: Place | null = null): Sky {
  const days = (when.getTime() - START) / 86_400_000, ages = days / 36_525;
  const lean = 23.439 - 0.0000004 * days;
  // The sun, along its path
  const drift = 357.528 + 0.9856003 * days;
  const sunAlong = 280.46 + 0.9856474 * days + 1.915 * sin(drift) + 0.02 * sin(2 * drift);
  // The moon, along the same path and a little to one side of it
  const moonAlong = 218.32 + 481267.881 * ages
    + 6.29 * sin(135.0 + 477198.87 * ages) - 1.27 * sin(259.3 - 413335.36 * ages)
    + 0.66 * sin(235.7 + 890534.22 * ages) + 0.21 * sin(269.9 + 954397.74 * ages)
    - 0.19 * sin(357.5 + 35999.05 * ages) - 0.11 * sin(186.5 + 966404.03 * ages);
  const moonAside = 5.13 * sin(93.3 + 483202.02 * ages) + 0.28 * sin(228.2 + 960400.89 * ages)
    - 0.28 * sin(318.3 + 6003.15 * ages) - 0.17 * sin(217.6 - 407332.21 * ages);
  const ahead = moonAlong - sunAlong;   // how far the moon has run ahead of the sun: nothing at the new moon, half a turn when it is full

  const sun = among(sunAlong, 0, lean), moon = among(moonAlong, moonAside, lean);
  // The lit edge faces the sun. Counted from the moon's north, round through its east.
  const toSun = angle(cos(sun.up) * sin(sun.round - moon.round), sin(sun.up) * cos(moon.up) - cos(sun.up) * sin(moon.up) * cos(sun.round - moon.round));

  let face = 0, sunHeight: number | null = null, moonHeight: number | null = null;
  if (place) {
    const { latitude } = place;
    const turned = 280.46061837 + 360.98564736629 * days + place.longitude;   // how far the earth has turned under the stars, at this place
    const height = (body: Among): number => rise(sin(latitude) * sin(body.up) + cos(latitude) * cos(body.up) * cos(turned - body.round));
    sunHeight = height(sun);
    moonHeight = height(moon);
    // In the sky, the moon's north leans away from straight up as it crosses from east to west. Under the horizon nobody sees it, so it is
    // drawn as it stands when highest: upright where it passes to the south of overhead, upside down where it passes to the north.
    const past = turned - moon.round;
    face = moonHeight > 0 ? angle(sin(past) * cos(latitude), sin(latitude) * cos(moon.up) - cos(latitude) * sin(moon.up) * cos(past)) : moon.up < latitude ? 0 : 180;
  }
  return { lit: (1 - cos(moonAside) * cos(ahead)) / 2, waxing: sin(ahead) > 0, face: round(face), limb: round(face - toSun - 90), sunHeight, moonHeight };
}

/* Which moon the tree shows after dark: tonight's real one, always a full one, none, or the moon of a day, written as 1922-04-12. */
export type MoonChoice = 'tonight' | 'full' | 'none' | { day: string };

/* Ten in the evening of a day, by the sun where the family is: the hour "that night's moon" is the moon of. Null for what is not a day. */
export function eveningOf(day: string, place: Place | null = null): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!parts) return null;
  const [year, month, date] = parts.slice(1).map(Number) as [number, number, number];
  const at = new Date(Date.UTC(2000, month - 1, date, 22));
  // Set apart, so that a year before 100 is not taken for one in the 1900s
  at.setUTCFullYear(year);
  if (at.getUTCMonth() !== month - 1 || at.getUTCDate() !== date) return null;
  // Ten o'clock by the sun is earlier in Greenwich time the further east the place is
  return new Date(at.getTime() - ((place?.longitude ?? 0) / 15) * 3_600_000);
}

/*
 * The moon a tree shows for a choice, with the sun as it stands now. A day's
 * moon is the one of that night, in its phase and turned the way it was seen
 * from the family's place. Null where there is no moon to show. A day that is
 * not one shows tonight's moon.
 */
export function moonFor(choice: MoonChoice, place: Place | null, now: Date = new Date()): Sky | null {
  if (choice === 'none') return null;
  const tonight = skyOver(now, place);
  if (choice === 'full') return { ...tonight, lit: 1 };
  const evening = typeof choice === 'object' ? eveningOf(choice.day, place) : null;
  return evening ? { ...skyOver(evening, place), sunHeight: tonight.sunHeight } : tonight;
}

/*
 * The outline of the moon's lit part, on a disc about 0,0, with the light on
 * the right. Down the lit edge, which is half a circle, and back up the line
 * between light and dark, which is half an oval seen from the earth: it
 * starts as the lit edge itself, flattens to a straight line at the half
 * moon, and swells out to the far edge when the moon is full.
 */
export function litOutline(lit: number, radius: number): string {
  const oval = (radius * Math.abs(1 - 2 * lit)).toFixed(2);
  return `M0 ${-radius}A${radius} ${radius} 0 0 1 0 ${radius}A${oval} ${radius} 0 0 ${lit > 0.5 ? 1 : 0} 0 ${-radius}Z`;
}
