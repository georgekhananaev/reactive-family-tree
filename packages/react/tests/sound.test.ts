/*
 * The page's sound on an iPhone: woken inside the visitor's own tap, kept for
 * the page's life, played through the silent switch only when they asked for
 * music, and let go of once it has stopped.
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { PageSound } from '../src/sound';

/* A context that only remembers what it was asked to do. */
function fakeContext() {
  const asked: string[] = [];
  const ctx = {
    state: 'suspended' as AudioContextState,
    resume: vi.fn(async () => { asked.push('resume'); ctx.state = 'running'; }),
    suspend: vi.fn(async () => { asked.push('suspend'); ctx.state = 'suspended'; }),
    close: vi.fn(async () => { asked.push('close'); ctx.state = 'closed'; }),
  };
  return { ctx, asked };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('the sound is asked to start inside the very call made from the tap, and the same one is kept', () => {
  const { ctx } = fakeContext();
  const made = vi.fn(() => ctx);
  const sound = new PageSound(made, undefined);
  expect(sound.context, 'nothing before a visitor’s tap').toBeNull();
  sound.wake(true);
  // Not later, when a promise settles or the page has drawn itself again: during the call
  expect(ctx.resume).toHaveBeenCalledTimes(1);
  sound.wake(true);
  sound.wake(false);
  expect(made, 'a context made later would stay silent on an iPhone').toHaveBeenCalledTimes(1);
  expect(sound.context).toBe(ctx);
});

test('music the visitor asked for plays through the silent switch, and gives it back once it has stopped', async () => {
  const { ctx, asked } = fakeContext();
  const session = { type: 'auto' };
  const sound = new PageSound(() => ctx, session);
  sound.wake(false);
  expect(session.type, 'music that starts by itself is not allowed past the switch').toBe('auto');
  sound.wake(true);
  expect(session.type).toBe('playback');

  sound.rest();
  await vi.advanceTimersByTimeAsync(1000);
  expect(asked, 'still fading').not.toContain('suspend');
  await vi.advanceTimersByTimeAsync(1000);
  expect(asked).toContain('suspend');
  expect(session.type, 'the phone’s own music may play again').toBe('auto');
});

test('music that starts again before it has been let go of keeps playing', async () => {
  const { ctx, asked } = fakeContext();
  const sound = new PageSound(() => ctx, undefined);
  sound.wake(true);
  sound.rest();
  await vi.advanceTimersByTimeAsync(500);
  sound.hold();
  await vi.advanceTimersByTimeAsync(5000);
  expect(asked).not.toContain('suspend');
});

test('a sound put to rest is woken again by the next tap, and closed when the page goes', async () => {
  const { ctx, asked } = fakeContext();
  const session = { type: 'auto' };
  const sound = new PageSound(() => ctx, session);
  sound.wake(true);
  sound.rest();
  await vi.advanceTimersByTimeAsync(2000);
  sound.wake(true);
  expect(asked.filter((one) => one === 'resume')).toHaveLength(2);
  sound.close();
  expect([asked.at(-1), sound.context, session.type]).toEqual(['close', null, 'auto']);
});

test('without the iPhone’s audio session, as in every other browser, it still wakes', () => {
  const { ctx } = fakeContext();
  const sound = new PageSound(() => ctx);
  expect(() => sound.wake(true)).not.toThrow();
  expect(ctx.resume).toHaveBeenCalled();
});
