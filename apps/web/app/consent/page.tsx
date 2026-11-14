import type { Metadata } from 'next';

import { getT } from '@/lib/i18n/server';

import { Consent } from './Consent';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t('Connect your AI'), robots: { index: false } };
}

/* The question an AI client's sign-in ends with: may it act for you? */
export default function ConsentPage() {
  return (
    <main className="page">
      <div className="sheet">
        <Consent />
      </div>
    </main>
  );
}
