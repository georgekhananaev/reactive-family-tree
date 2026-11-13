'use client';

import { PageNote } from '@/components/PageNote';

/* Shown when a page breaks while it is being drawn, where there would be an empty screen. */
export default function PageError({ retry }: { retry(): void }) {
  return (
    <PageNote title="Something went wrong">
      <p>This page could not be shown. Nothing on the tree was changed.</p>
      <div className="form-actions">
        <button type="button" className="primary" onClick={() => retry()}>Try again</button>
      </div>
    </PageNote>
  );
}
