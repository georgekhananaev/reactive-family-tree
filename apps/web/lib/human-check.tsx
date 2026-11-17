'use client';

/*
 * Cloudflare's check that a person is asking, before one of the three things
 * a stranger may ask of a tree: a sign-in link, to join, or a correction.
 * Only an install that has set the check up uses it.
 *
 * The check is Cloudflare's own script, so it is fetched only when a form
 * that needs it is on the page, never on a plain visit. It is drawn and run
 * when the form is sent, and shows nothing unless Cloudflare is unsure: then
 * a box to tick appears where the form put it.
 */

import Script from 'next/script';
import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import { useT } from './i18n';

/* The part of Cloudflare's script this page uses. */
interface Turnstile {
  render(holder: HTMLElement, options: Record<string, unknown>): string;
  execute(holder: HTMLElement): void;
  reset(widget: string): void;
  remove(widget: string): void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/* How long the check may take, script and all, before the form gives up on it: long enough to tick a box. */
const PATIENCE = 90_000;

export interface HumanCheck {
  /* Where the check shows itself when Cloudflare wants a box ticked. It belongs in the form. Nothing where there is no check. */
  box: ReactNode;
  /* Run the check and give its proof, to send along with what the form asks. Null where there is no check. */
  prove(): Promise<string | null>;
}

/* `siteKey` is the key the install shows the check with, as the session tells it. With none there is no check, and nothing is fetched. */
export function useHumanCheck(siteKey: string | null): HumanCheck {
  const { lang, t } = useT();
  const holder = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  /* Cloudflare's script could not be fetched: something on the device blocks it. */
  const blocked = useRef(false);
  /* Whoever is waiting for the proof of the check now running. */
  const waiting = useRef<{ proven(proof: string): void; failed(): void } | null>(null);

  /* Draw the check in its place, if its script is here and it is not drawn yet. It stays out of sight, and runs only when told to. */
  const draw = useCallback(() => {
    if (!siteKey || !holder.current || !window.turnstile || widget.current) return;
    widget.current = window.turnstile.render(holder.current, {
      sitekey: siteKey,
      execution: 'execute',
      appearance: 'interaction-only',
      'response-field': false,
      language: lang,
      theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
      callback: (proof: string) => waiting.current?.proven(proof),
      // Room around the box for as long as Cloudflare shows one
      'before-interactive-callback': () => holder.current?.classList.add('asking'),
      'after-interactive-callback': () => holder.current?.classList.remove('asking'),
      // True tells the script that the failure has been seen to
      'error-callback': () => { waiting.current?.failed(); return true; },
    });
  }, [siteKey, lang]);

  // The check goes when its form does
  useEffect(() => () => {
    if (widget.current) window.turnstile?.remove(widget.current);
    widget.current = null;
  }, []);

  const prove = useCallback((): Promise<string | null> => {
    if (!siteKey) return Promise.resolve(null);
    const refused = new Error(t('The check that you are a person could not run. If something on this page blocks it, turn that off and try again.'));
    if (blocked.current) return Promise.reject(refused);
    return new Promise((resolve, reject) => {
      const finish = (answer: () => void) => {
        clearTimeout(patience);
        clearInterval(looking);
        // Only its own place: a later check may be waiting there by now
        if (waiting.current === mine) waiting.current = null;
        answer();
      };
      const patience = setTimeout(() => finish(() => reject(refused)), PATIENCE);
      const mine = { proven: (proof: string) => finish(() => resolve(proof)), failed: () => finish(() => reject(refused)) };
      waiting.current = mine;
      // A proof is good once only, so the check is run afresh each time
      const run = (): boolean => {
        draw();
        if (!widget.current || !holder.current || !window.turnstile) return false;
        window.turnstile.reset(widget.current);
        window.turnstile.execute(holder.current);
        return true;
      };
      // The script may still be on its way when the form is sent
      const looking = run() ? undefined : setInterval(() => { if (run()) clearInterval(looking); }, 150);
    });
  }, [siteKey, t, draw]);

  return {
    box: siteKey ? (
      <>
        <Script src={SCRIPT} onError={() => { blocked.current = true; waiting.current?.failed(); }} />
        <div ref={holder} className="human-check" />
      </>
    ) : null,
    prove,
  };
}
