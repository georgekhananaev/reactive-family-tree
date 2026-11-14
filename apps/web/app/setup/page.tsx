import type { Metadata } from 'next';

import { getT } from '@/lib/i18n/server';

import { SetupWizard } from './SetupWizard';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t('Set up your family tree'), robots: { index: false } };
}

/* First run. Only the one-time link from the server log opens it, so a stranger who finds a fresh install cannot claim it. */
export default function SetupPage() {
  return (
    <main className="page">
      <div className="sheet">
        <SetupWizard />
      </div>
    </main>
  );
}
