'use client';

import { PageNote } from '@/components/PageNote';
import { useT } from '@/lib/i18n';

/* Shown when a page breaks while it is being drawn, where there would be an empty screen. */
export default function PageError({ retry }: { retry(): void }) {
  const { t } = useT();
  return (
    <PageNote title={t('Something went wrong')}>
      <p>{t('The page could not be shown. Try again, or go back to the tree.')}</p>
      <div className="form-actions">
        <button type="button" className="primary" onClick={() => retry()}>{t('Try again')}</button>
      </div>
    </PageNote>
  );
}
