/*
 * The look of the tree, set by an admin for everyone: light or dark (by the
 * sun among the choices), and the moon over it after dark.
 */

import { afterAll, beforeAll, expect, test } from 'vitest';

import { browser, startDemo } from '../src/testing';
import type { Demo } from '../src/testing';

let demo: Demo;
beforeAll(async () => { demo = await startDemo(); });
afterAll(() => demo.close());

test('an admin chooses the moon and the light, and every browser is told', async () => {
  const helen = browser(demo.app);
  await helen.signInAs('helen');
  expect((await helen.patch('/api/settings', { appearance: 'sun', moon: 'day', moonDay: '1922-04-12' })).status).toBe(200);
  const told = (await browser(demo.app).get('/api/session')).data.settings;
  expect([told.appearance, told.moon, told.moonDay]).toEqual(['sun', 'day', '1922-04-12']);
  for (const moon of ['tonight', 'full', 'none']) {
    expect((await helen.patch('/api/settings', { moon })).status, moon).toBe(200);
  }
});

test('the moon of a day needs a real day', async () => {
  const helen = browser(demo.app);
  await helen.signInAs('helen');
  await helen.patch('/api/settings', { moon: 'tonight', moonDay: '' });
  expect((await helen.patch('/api/settings', { moon: 'day' })).data.error).toBe('Choose the day whose moon the tree shows.');
  for (const moonDay of ['1922-02-30', '12/04/1922', 'yesterday']) {
    expect((await helen.patch('/api/settings', { moonDay })).data.error, moonDay).toBe('Choose a day from the calendar.');
  }
  expect((await helen.patch('/api/settings', { moon: 'eclipse' })).status).toBe(400);
  expect((await helen.patch('/api/settings', { appearance: 'twilight' })).status).toBe(400);
  // Asked in Hebrew, it is said in Hebrew
  helen.reads('he');
  expect((await helen.patch('/api/settings', { moon: 'day' })).data.error).toMatch(/[֐-׿]/);
});

test('a stranger at a private tree is not told the family’s day, nor where it is', async () => {
  const helen = browser(demo.app);
  await helen.signInAs('helen');
  await helen.patch('/api/settings', { moon: 'day', moonDay: '1922-04-12', latitude: 51, longitude: -3, visibility: 'private' });
  const stranger = (await browser(demo.app).get('/api/session')).data.settings;
  expect([stranger.moonDay, stranger.latitude, stranger.longitude]).toEqual(['', null, null]);
  expect((await helen.get('/api/session')).data.settings.moonDay, 'a relative is').toBe('1922-04-12');
  await helen.patch('/api/settings', { visibility: 'public_masked', moon: 'tonight' });
});
