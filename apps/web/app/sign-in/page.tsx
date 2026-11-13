import type { Metadata } from 'next';

import { SignInForClient } from './SignInForClient';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

/* Where an AI client sends a relative to sign in, before it may act for them. */
export default function SignInPage() {
  return (
    <main className="page">
      <div className="sheet">
        <SignInForClient />
      </div>
    </main>
  );
}
