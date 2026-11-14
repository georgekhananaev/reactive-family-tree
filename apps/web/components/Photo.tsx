'use client';

import { useRef } from 'react';

import { useT } from '@/lib/i18n';

/*
 * Someone's photo, small. Pressing it opens it large over the page, and a
 * press anywhere, or Escape, puts it away again.
 */
export function Photo({ src, name, className }: { src: string; name: string; className?: string }) {
  const { t } = useT();
  const large = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={className ? `photo ${className}` : 'photo'} aria-label={t('See the photo of {name} larger', { name })} onClick={() => large.current?.showModal()}>
        <img src={src} alt="" />
      </button>
      {/* A press on the photo or beside it lands here, so either closes it */}
      <dialog ref={large} className="photo-large" aria-label={t('Photo of {name}', { name })} onClick={() => large.current?.close()}>
        <button type="button" aria-label={t('Close the photo')}><img src={src} alt="" /></button>
      </dialog>
    </>
  );
}
