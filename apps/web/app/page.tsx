import { familyText } from '@reactive-family-tree/server';
import type { Metadata } from 'next';

import { Explorer } from '@/components/Explorer';
import { buildInfo } from '@/lib/build';
import { previewImage } from '@/lib/card/meta';
import { OG_LOCALE, getT } from '@/lib/i18n/server';
import { getApp } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { store } = await getApp();
  await store.fresh();
  const { lang, t } = await getT();
  // The family's name and line as this reader reads them
  const familyName = familyText(store.settings, 'familyName', lang), description = familyText(store.settings, 'description', lang);
  const { visibility } = store.settings;
  const about = description || t('The {family} tree.', { family: familyName });
  return {
    title: familyName,
    description: about,
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website', title: familyName, description: about, url: '/', siteName: familyName, locale: OG_LOCALE[lang],
      images: [previewImage('/preview.png', store.seq, t('The {family} tree.', { family: familyName }))],
    },
    // A private tree asks search engines to leave it alone
    robots: visibility === 'private' ? { index: false, follow: false } : undefined,
  };
}

export default function Home() {
  return <Explorer build={buildInfo()} />;
}
