'use client';

/* The ways into an account: a link by email, a passkey, Google, and on a demo install the ready-made relatives. */

import type { SessionInfo } from '@reactive-family-tree/core';
import { useState } from 'react';

import { api } from '@/lib/api';
import { family, sendLink, signInWithGoogle, signInWithPasskey } from '@/lib/auth-client';

import { Field } from './ui';

export function SignInWays({ session, backTo = '/', onSignedIn, onFail }: {
  session: SessionInfo;
  /* Where an emailed link lands after signing the person in. */
  backTo?: string;
  onSignedIn(): unknown;
  onFail(error: unknown): void;
}) {
  const { demoAccounts, signIn, demo } = session;
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ link: string | null } | null>(null);

  const enter = (way: () => Promise<unknown>) => async () => {
    try {
      await way();
      await onSignedIn();
    } catch (error) {
      onFail(error);
    }
  };
  const askForLink = async () => {
    try {
      await sendLink(email, backTo);
      // A demo install has no mailbox to send to, so it hands the link to the page that asked
      setSent(demo ? await api.get<{ link: string | null }>(`/api/demo/link?email=${encodeURIComponent(email)}`) : { link: null });
    } catch (error) {
      onFail(error);
    }
  };

  return (
    <>
      {demoAccounts.length > 0 && (
        <>
          <h3>Try it as someone</h3>
          <p className="hint-line">This demo comes with a relative for every role. Open a second browser window as someone else to see changes arrive live.</p>
          {demoAccounts.map((account) => (
            <button key={account.email} type="button" className="account" onClick={enter(() => family.demoSignIn(account.email))}>
              <strong>{account.name}</strong>
              <small>{account.blurb}</small>
            </button>
          ))}
        </>
      )}

      <h3>Sign in with a link</h3>
      <Field label="Your email">
        <input type="email" name="email" autoComplete="email webauthn" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void askForLink(); }} />
      </Field>
      <div className="form-actions">
        <button type="button" className="primary" onClick={() => void askForLink()}>Send me a link</button>
        {signIn.passkeys && <button type="button" onClick={enter(signInWithPasskey)}>Use a passkey</button>}
        {signIn.google && <button type="button" onClick={() => void signInWithGoogle().catch(onFail)}>Continue with Google</button>}
      </div>
      {sent && (
        <div>
          <p className="hint-line">If that address belongs to a relative, a sign-in link is on its way. It works once, for 15 minutes.</p>
          {sent.link && <p className="pencil">In the real app this arrives by email. In this demo, here it is: <a href={sent.link}>Sign in</a></p>}
          {!demo && !signIn.emailWorks && <p className="pencil">Email is not set up on this install yet, so the link was written to the server log.</p>}
        </div>
      )}
    </>
  );
}
