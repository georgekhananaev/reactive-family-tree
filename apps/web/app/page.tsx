import type { Metadata } from 'next';

import { Explorer } from '@/components/Explorer';
import { buildInfo } from '@/lib/build';
import { getApp } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { store, config } = await getApp();
  await store.fresh();
  const { familyName, description, visibility } = store.settings;
  const about = description || `The ${familyName} tree.`;
  return {
    // The address this install is reached at is only known while it runs, so links are made whole here
    metadataBase: new URL(config.baseUrl),
    title: familyName,
    description: about,
    alternates: { canonical: '/' },
    openGraph: { type: 'website', title: familyName, description: about, url: '/', siteName: familyName },
    // A private tree asks search engines to leave it alone
    robots: visibility === 'private' ? { index: false, follow: false } : undefined,
  };
}

export default function Home() {
  return <Explorer build={buildInfo()} />;
}
