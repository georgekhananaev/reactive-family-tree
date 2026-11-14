/*
 * The moon and the sun on the tree are meant to be the real ones, as they
 * stand right now over the family's place. That can be checked against days
 * and nights that are on record, and against what anyone who has looked up
 * from each half of the world knows.
 */

import { expect, test } from 'vitest';

import { eveningOf, litOutline, moonFor, skyOver } from '../src/sky';
import type { Place } from '../src/sky';

const at = (moment: string): Date => new Date(moment);
const hours = (moment: string, by: number): Date => new Date(at(moment).getTime() + by * 3_600_000);
const RAD = Math.PI / 180;

const GREENWICH: Place = { latitude: 51.48, longitude: 0 };
const LONDON: Place = { latitude: 51.5, longitude: -0.13 };
const SYDNEY: Place = { latitude: -33.87, longitude: 151.21 };
const QUITO: Place = { latitude: -0.18, longitude: -78.47 };
const TROMSO: Place = { latitude: 69.65, longitude: 18.96 };

test('it finds new moons and full moons that are on record, to the hour', () => {
  const newMoons = ['2000-01-06T18:14Z', '2017-08-21T18:30Z', '2025-01-29T12:36Z'];
  const fullMoons = ['2000-01-21T04:40Z', '2019-07-16T21:38Z', '2024-10-17T11:26Z'];
  for (const night of newMoons) {
    const { lit } = skyOver(at(night));
    expect(lit, `new moon of ${night}`).toBeLessThan(0.005);
    // Darkest then, and not three hours to either side
    expect([skyOver(hours(night, -3)).lit > lit, skyOver(hours(night, 3)).lit > lit], night).toEqual([true, true]);
  }
  for (const night of fullMoons) {
    const { lit } = skyOver(at(night));
    expect(lit, `full moon of ${night}`).toBeGreaterThan(0.995);
    expect([skyOver(hours(night, -3)).lit < lit, skyOver(hours(night, 3)).lit < lit], night).toEqual([true, true]);
  }
});

test('half moons are half lit, growing before the full moon and shrinking after it', () => {
  const growing = skyOver(at('2025-02-05T08:02Z')), shrinking = skyOver(at('2025-01-21T20:31Z'));
  expect(growing.lit).toBeCloseTo(0.5, 1);
  expect(shrinking.lit).toBeCloseTo(0.5, 1);
  expect([growing.waxing, shrinking.waxing]).toEqual([true, false]);
  // Through one month the light only grows, then only shrinks
  const month = Array.from({ length: 30 }, (_, day) => skyOver(hours('2025-01-29T12:36Z', day * 24)));
  expect(month.slice(1, 14).every((night, day) => night.waxing && night.lit > (month[day]?.lit ?? 1))).toBe(true);
  expect(month.slice(17, 29).every((night, day) => !night.waxing && night.lit < (month[day + 16]?.lit ?? 0))).toBe(true);
});

test('at an eclipse the moon is right in front of the sun, or right opposite it', () => {
  // The sun went dark over North America, and the moon went red over it eleven months later
  expect(skyOver(at('2024-04-08T18:17Z')).lit).toBeLessThan(0.0001);
  expect(skyOver(at('2025-03-14T06:59Z')).lit).toBeGreaterThan(0.9999);
});

test('the sun rises, stands highest and sets when it does', () => {
  // At Greenwich on the day in March when day and night are equal. A rising or setting sun is counted from when its top edge shows, a little under the horizon.
  const sunrise = skyOver(at('2024-03-20T06:02Z'), GREENWICH), sunset = skyOver(at('2024-03-20T18:14Z'), GREENWICH);
  expect(Math.abs((sunrise.sunHeight ?? 99) + 0.83)).toBeLessThan(0.5);
  expect(Math.abs((sunset.sunHeight ?? 99) + 0.83)).toBeLessThan(0.5);
  // Midsummer noon there: a right angle, less how far north Greenwich is, plus how far the earth leans
  expect(skyOver(at('2024-06-20T12:00Z'), GREENWICH).sunHeight).toBeCloseTo(90 - 51.48 + 23.44, 0);
  expect(skyOver(at('2024-03-20T00:00Z'), GREENWICH).sunHeight, 'and at midnight it is well under').toBeLessThan(-30);
  // North of the arctic circle the midsummer sun does not set
  const midnightSun = skyOver(at('2024-06-21T23:00Z'), TROMSO).sunHeight ?? -99;
  expect([midnightSun > 2, midnightSun < 5]).toEqual([true, true]);
  expect(skyOver(at('2024-06-20T12:00Z')).sunHeight, 'with no place there is nothing to say').toBeNull();
});

test('a young moon in the evening is lit from the side the sun went down on', () => {
  // Three days after a new moon. Which way the lit edge points on the page: across is to the right, down is down.
  const pointing = (moment: string, place: Place) => {
    const { limb, lit, waxing, moonHeight } = skyOver(at(moment), place);
    expect([lit > 0.05 && lit < 0.2, waxing, (moonHeight ?? -1) > 0], `a thin growing moon, up over ${place.latitude}`).toEqual([true, true, true]);
    return { across: Math.cos(limb * RAD), down: Math.sin(limb * RAD) };
  };
  // From the north it is lit on the lower right
  const north = pointing('2024-04-11T20:00Z', LONDON);
  expect([north.across > 0.3, north.down > 0.3]).toEqual([true, true]);
  // From the south, on the lower left
  const south = pointing('2024-04-11T08:00Z', SYDNEY);
  expect([south.across < -0.3, south.down > 0.3]).toEqual([true, true]);
  // And on the equator it lies on its back, lit from below. Not quite flat: in April the sun's path leans some thirty degrees there.
  expect(pointing('2024-04-12T00:00Z', QUITO).down).toBeGreaterThan(0.8);
});

test('a moon nobody can see is drawn as it stands when highest', () => {
  // Four in the morning in London, three days after a new moon: the moon set hours ago. So it has as far south of the equator, on the same line.
  const under = '2024-04-12T04:00Z', mirrored: Place = { latitude: -LONDON.latitude, longitude: LONDON.longitude };
  expect(skyOver(at(under), LONDON).moonHeight).toBeLessThan(0);
  expect(skyOver(at(under), LONDON).face, 'upright from the north').toBe(0);
  expect(skyOver(at(under), mirrored).moonHeight).toBeLessThan(0);
  expect(skyOver(at(under), mirrored).face, 'and the other way up from the south').toBe(180);
  // With no place it is the northern moon: growing, so lit on the right
  const { face, limb } = skyOver(at(under));
  expect([face, Math.cos(limb * RAD) > 0.8]).toEqual([0, true]);
});

test('the lit part is drawn as a crescent, a half, and a full disc', () => {
  // The last arc is the line between light and dark: as wide as the disc at the new moon, a straight line at the half, the far edge when full
  expect(litOutline(0, 59)).toBe('M0 -59A59 59 0 0 1 0 59A59.00 59 0 0 0 0 -59Z');
  expect(litOutline(0.5, 59)).toBe('M0 -59A59 59 0 0 1 0 59A0.00 59 0 0 0 0 -59Z');
  expect(litOutline(1, 59)).toBe('M0 -59A59 59 0 0 1 0 59A59.00 59 0 0 1 0 -59Z');
  // A quarter lit is a crescent: the line bows toward the lit edge. Three quarters lit, it bows away from it.
  expect([litOutline(0.25, 59), litOutline(0.75, 59)]).toEqual(['M0 -59A59 59 0 0 1 0 59A29.50 59 0 0 0 0 -59Z', 'M0 -59A59 59 0 0 1 0 59A29.50 59 0 0 1 0 -59Z']);
});

test('the moon the family chose: tonight’s, always full, none, or the moon of a night that is on record', () => {
  const now = new Date(Date.UTC(2026, 10, 15, 21)), jerusalem = { latitude: 32, longitude: 35 };
  expect(moonFor('tonight', jerusalem, now)).toEqual(skyOver(now, jerusalem));
  expect(moonFor('full', jerusalem, now)?.lit).toBe(1);
  expect(moonFor('none', jerusalem, now)).toBeNull();
  // The full moon of 23 April 2024, and the new moon of the eclipse on 8 April 2024
  expect(moonFor({ day: '2024-04-23' }, jerusalem, now)?.lit).toBeGreaterThan(0.97);
  expect(moonFor({ day: '2024-04-08' }, jerusalem, now)?.lit).toBeLessThan(0.03);
  // Whatever the night, the sun is the one in the sky now
  expect(moonFor({ day: '2024-04-23' }, jerusalem, now)?.sunHeight).toBe(skyOver(now, jerusalem).sunHeight);
  expect(moonFor({ day: 'not a day' }, jerusalem, now), 'what is not a day shows tonight’s moon').toEqual(skyOver(now, jerusalem));
});

test('a night’s moon is the one at ten in the evening by the sun where the family is', () => {
  // Ten by the sun at 35 degrees east is 7:40 in the evening in Greenwich
  expect(eveningOf('2024-04-23', { latitude: 32, longitude: 35 })?.toISOString()).toBe('2024-04-23T19:40:00.000Z');
  expect(eveningOf('2024-04-23')?.toISOString()).toBe('2024-04-23T22:00:00.000Z');
  expect(eveningOf('0045-03-01')?.getUTCFullYear(), 'a year before 100 is that year').toBe(45);
  expect([eveningOf('2024-02-30'), eveningOf('1922')]).toEqual([null, null]);
});
