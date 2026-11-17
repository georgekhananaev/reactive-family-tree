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
  /* Let through whoever sent these headers, or say why not. For a sign-in link, `address` is where the letter would go. */
  admit(knock: Knock, headers: Headers, address?: string): Promise<void>;
}

const HOUR = 3_600_000;
/* How often one sender may knock in an hour, by what it asks for. A whole family at one table shares one address on the network, so links are given more room. */
const KNOCKS_PER_HOUR: Record<Knock, number> = { link: 20, join: 5, suggest: 30 };
/*
 * How many sign-in letters go to one address. A few for each sender that asks, so that a stranger asking over and over
 * uses up only their own and never the tries of the person whose address it is. And a few more than that in all, so that
 * no mailbox is filled from many places at once and the day's mail is not used up.
 */
const LETTERS = { fromOne: { anHour: 3, aDay: 6 }, inAll: { anHour: 6, aDay: 12 } };
/* How many requests an hour are let through unchecked while Cloudflare cannot be reached. */
const UNASKED_AN_HOUR = 20;
/* Keys remembered at once in an hour's count, so that the memory of them cannot be made to grow. */
const REMEMBERED = 500;
/* No address on the network is written longer than this, and no email address longer than that, so nothing longer is kept as one. */
const SENDER_AT_MOST = 45, ADDRESS_AT_MOST = 254;
const VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_WAIT = 5000;
/* A proof from Cloudflare is one run of plain characters, never longer than this. Anything else is turned away without Cloudflare being asked. */
const PROOF = /^[\x21-\x7e]{1,2048}$/;

/*
 * Who a sender is counted as. On the newer kind of network one sender holds a whole block of addresses and can write from a
 * new one each time, so there it is the block that is counted: the first four of an address's eight groups.
 */
function counted(address: string): string {
  if (!address.includes(':')) return address;
  // An address of the older kind, written the newer way
  const older = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (older?.[1]) return older[1];
  // "::" stands for as many empty groups as it takes to make eight
  const [head = '', tail] = address.toLowerCase().split('::');
  const groups = head ? head.split(':') : [];
  if (tail !== undefined) {
    const rest = tail ? tail.split(':') : [];
    groups.push(...Array<string>(Math.max(0, 8 - groups.length - rest.length)).fill('0'), ...rest);
  }
  return `${groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/* How often each key was seen in the stretch of time now running. The count starts afresh, for everyone, when the stretch is over. */
class Tally {
  private since = Date.now();
  private readonly seen = new Map<string, number>();

  constructor(private readonly stretch: number, private readonly most: number, private readonly remembered = REMEMBERED) {}

  /* Count this key once more, and say whether it is still within the limit. */
  allow(key: string): boolean {
    if (Date.now() - this.since > this.stretch) {
      this.since = Date.now();
      this.seen.clear();
    }
    // With more keys in a stretch than can be remembered, the one remembered longest is forgotten. Nobody new is turned away for that.
    const [longest] = this.seen.keys();
    if (!this.seen.has(key) && this.seen.size >= this.remembered && longest !== undefined) this.seen.delete(longest);
    const times = (this.seen.get(key) ?? 0) + 1;
    this.seen.set(key, times);
    return times <= this.most;
  }
}

/* A count by the hour and one by the day, for the same thing. */
class Allowance {
  private readonly hour: Tally;
  private readonly day: Tally;

  constructor({ anHour, aDay }: { anHour: number; aDay: number }) {
    this.hour = new Tally(HOUR, anHour);
    // A day's count remembers a day's worth of keys. With an hour's worth, a day of asking for other things would be enough to have one forgotten.
    this.day = new Tally(24 * HOUR, aDay, 24 * REMEMBERED);
  }

  allow(key: string): boolean {
    return this.hour.allow(key) && this.day.allow(key);
  }
}

export function createDoor({ humanCheck }: Pick<AppConfig, 'humanCheck'>): Door {
  const knocks: Record<Knock, Tally> = { link: new Tally(HOUR, KNOCKS_PER_HOUR.link), join: new Tally(HOUR, KNOCKS_PER_HOUR.join), suggest: new Tally(HOUR, KNOCKS_PER_HOUR.suggest) };
  const letters = { fromOne: new Allowance(LETTERS.fromOne), inAll: new Allowance(LETTERS.inAll) };
  const unasked = new Tally(HOUR, UNASKED_AN_HOUR);

  /* Ask Cloudflare whether the proof a page sent is good. It is good once only. Null when Cloudflare could not be reached at all. */
  async function proven(secret: string, proof: string, sender: string | null): Promise<boolean | null> {
    let response: Response;
    try {
      response = await fetch(VERIFY, {
        method: 'POST',
        body: new URLSearchParams({ secret, response: proof, ...(sender && { remoteip: sender }) }),
        signal: AbortSignal.timeout(VERIFY_WAIT),
      });
    } catch (error) {
      console.error('Cloudflare could not be reached, to ask whether a person was at the door.', error);
      return null;
    }
    // An answer that is not a plain yes is a no, whatever else it is: what the sender wrote may be what brought it about
    if (!response.ok) {
      console.error(`Cloudflare answered ${response.status} when asked whether a person was at the door.`);
      return false;
    }
    const answer = await response.json().catch(() => null) as { success?: unknown } | null;
    // The answer also names the page the proof was made on and the form it was made for. Neither is held against the request:
    // Cloudflare makes proofs for this widget on the tree's own addresses only, and a stranger may ask for any of the three things.
    return answer?.success === true;
  }

  return {
    siteKey: humanCheck?.siteKey ?? null,
    async admit(knock, headers, address) {
      // Behind more than one proxy it is the nearest that is believed, whatever the sender wrote in front of it
      const sender = headers.get('x-forwarded-for')?.split(',').pop()?.trim().slice(0, SENDER_AT_MOST) || null;
      const from = sender && counted(sender);
      // Senders nothing is known about are not counted together, or one of them could use up the tries of all the rest
      if (from && !knocks[knock].allow(from)) throw tooMany('That is a lot of requests in a short time. Try again in an hour.');
      if (humanCheck) {
        const proof = headers.get(PROOF_HEADER);
        const good = proof && PROOF.test(proof) ? await proven(humanCheck.secretKey, proof, sender) : false;
        if (good === false) throw forbidden('The check that you are a person did not pass. Try again.');
        // While Cloudflare cannot be reached, a few an hour are still let through, so that a family is not kept out of its own tree
        // by trouble somewhere else. Only a few, and all of them under the limits here.
        if (good === null && !unasked.allow('everyone')) throw tooMany('The check that you are a person is not working just now. Try again in a little while.');
      }
      if (address === undefined) return;
      // Counted for any address, whether or not it has an account, so that the answer gives nothing away. What one sender is refused
      // is not counted against the address for everyone else. A sender nothing is known about has only the count for everyone.
      const to = address.trim().toLowerCase().slice(0, ADDRESS_AT_MOST);
      if ((from && !letters.fromOne.allow(`${to} ${from}`)) || !letters.inAll.allow(to)) {
        throw tooMany('Too many sign-in links were asked for this address. Try again later, or sign in with a passkey.');
      }
    },
  };
}
