/*
 * The door: what stands between a stranger and the three things anyone on the
 * internet may ask of a family tree without an account. Asking for a sign-in
 * link sends a letter. Asking to join and suggesting a correction both land in
 * the admins' inbox. Left open, each could be used to pester a family or to
 * use up the mail it may send in a day.
 *
 * Two things guard them. Limits, kept in memory, on how often one sender may
 * knock and on how many sign-in letters one address is sent. And, where the
 * family has set it up, Cloudflare's Turnstile: the page proves to Cloudflare
 * that a person is using it, and sends that proof along with what it asks.
 */

import { PROOF_HEADER } from '@reactive-family-tree/core';

import type { AppConfig } from './config';
import { forbidden, tooMany } from './errors';

/* What a stranger can ask for: a sign-in link, to join the family, or a correction. */
export type Knock = 'link' | 'join' | 'suggest';

export interface Door {
  /* The key a page shows Cloudflare's check with, or null where this install has no check. It is not a secret. */
  readonly siteKey: string | null;
  /* Let through whoever sent these headers, or say why not. */
  admit(knock: Knock, headers: Headers): Promise<void>;
  /* Whether one more sign-in letter may go to this address now. Asking counts as one. */
  mayWrite(address: string): boolean;
}

const HOUR = 3_600_000;
/* How often one sender may knock in an hour, by what it asks for. A whole family at one table shares one address on the network, so links are given more room. */
const KNOCKS_PER_HOUR: Record<Knock, number> = { link: 20, join: 5, suggest: 30 };
/* How many sign-in letters one address is sent, so that nobody's mailbox is filled for them and the day's mail is not used up. */
const LETTERS = { perHour: 3, perDay: 8 };
/* Keys remembered at once in each count, so that the memory of them cannot be made to grow. */
const REMEMBERED = 500;
const VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_WAIT = 5000;

/* How often each key was seen in the stretch of time now running. The count starts afresh, for everyone, when the stretch is over. */
class Tally {
  private since = Date.now();
  private readonly seen = new Map<string, number>();

  constructor(private readonly stretch: number, private readonly most: number) {}

  /* Count this key once more, and say whether it is still within the limit. */
  allow(key: string): boolean {
    if (Date.now() - this.since > this.stretch) {
      this.since = Date.now();
      this.seen.clear();
    }
    // With more keys in a stretch than can be remembered, the one remembered longest is forgotten. Nobody new is turned away for that.
    const [longest] = this.seen.keys();
    if (!this.seen.has(key) && this.seen.size >= REMEMBERED && longest !== undefined) this.seen.delete(longest);
    const times = (this.seen.get(key) ?? 0) + 1;
    this.seen.set(key, times);
    return times <= this.most;
  }
}

export function createDoor({ humanCheck }: Pick<AppConfig, 'humanCheck'>): Door {
  const knocks: Record<Knock, Tally> = { link: new Tally(HOUR, KNOCKS_PER_HOUR.link), join: new Tally(HOUR, KNOCKS_PER_HOUR.join), suggest: new Tally(HOUR, KNOCKS_PER_HOUR.suggest) };
  const letters = [new Tally(HOUR, LETTERS.perHour), new Tally(24 * HOUR, LETTERS.perDay)];

  /* Ask Cloudflare whether the proof a page sent is good. It is good once only. */
  async function proven(proof: string, sender: string | null): Promise<boolean> {
    if (!humanCheck) return true;
    try {
      const response = await fetch(VERIFY, {
        method: 'POST',
        body: new URLSearchParams({ secret: humanCheck.secretKey, response: proof, ...(sender && { remoteip: sender }) }),
        signal: AbortSignal.timeout(VERIFY_WAIT),
      });
      if (!response.ok) throw new Error(`Cloudflare answered ${response.status}`);
      return (await response.json() as { success?: boolean }).success === true;
    } catch (error) {
      // When Cloudflare cannot be asked, the request is let through: the limits still hold, and a family is not kept out of its own tree by trouble somewhere else
      console.error('Cloudflare could not be asked whether a person was at the door. The request was let through.', error);
      return true;
    }
  }

  return {
    siteKey: humanCheck?.siteKey ?? null,
    async admit(knock, headers) {
      // Behind more than one proxy it is the nearest that is believed, whatever the sender wrote in front of it
      const sender = headers.get('x-forwarded-for')?.split(',').pop()?.trim() || null;
      // Senders nothing is known about are not counted together, or one of them could use up the tries of all the rest
      if (sender && !knocks[knock].allow(sender)) throw tooMany('That is a lot of requests in a short time. Try again in an hour.');
      if (!humanCheck) return;
      const proof = headers.get(PROOF_HEADER);
      if (!proof || !(await proven(proof, sender))) throw forbidden('The check that you are a person did not pass. Try again.');
    },
    // Both counts are kept for every letter asked for, so the hour's and the day's each see all of them
    mayWrite: (address) => letters.map((tally) => tally.allow(address)).every(Boolean),
  };
}
