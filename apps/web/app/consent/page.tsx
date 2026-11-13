import type { Metadata } from 'next';

import { Consent } from './Consent';

export const metadata: Metadata = { title: 'Connect your AI', robots: { index: false } };

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
