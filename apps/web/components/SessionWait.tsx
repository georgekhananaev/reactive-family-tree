'use client';

import { useT } from '@/lib/i18n';

/*
 * What a page shows until it knows who is looking: a moment's wait. Where the
 * server could not be asked, it says so and offers another try, or the page
 * would wait for ever.
 */
export function SessionWait({ failed, onRetry }: { failed: boolean; onRetry(): void }) {
  const { t } = useT();
  if (!failed) return <p className="lead">{t('One moment…')}</p>;
  return (
    <>
      <p className="warning" role="alert">{t('The server did not answer. It may be starting, or the connection may be down.')}</p>
      <div className="form-actions">
        <button type="button" className="primary" onClick={onRetry}>{t('Try again')}</button>
      </div>
    </>
  );
}
