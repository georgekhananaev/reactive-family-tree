import type { Metadata } from 'next';
import Link from 'next/link';

import { PageNote } from '@/components/PageNote';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t('This page does not exist'), robots: { index: false } };
}

/* An address that leads nowhere on this tree. */
export default async function NotFound() {
  const { t } = await getT();
  return (
    <PageNote title={t('This page does not exist')}>
      <p>{t('The link may be old, or mistyped.')}</p>
      <p className="back"><Link href="/">{t('Go to the tree')}</Link></p>
    </PageNote>
  );
}
