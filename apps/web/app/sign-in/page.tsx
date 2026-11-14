import type { Metadata } from 'next';

import { getT } from '@/lib/i18n/server';

import { SignInForClient } from './SignInForClient';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t('Sign in'), robots: { index: false } };
}

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
