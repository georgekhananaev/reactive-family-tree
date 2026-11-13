import type { Metadata } from 'next';
import Link from 'next/link';

import { PageNote } from '@/components/PageNote';

export const metadata: Metadata = { title: 'Not found', robots: { index: false } };

/* An address that leads nowhere on this tree. */
export default function NotFound() {
  return (
    <PageNote title="Nothing here">
      <p>This address is not part of the family tree. It may have been mistyped, or what it showed is gone.</p>
      <p className="back"><Link href="/">Back to the tree</Link></p>
    </PageNote>
  );
}
