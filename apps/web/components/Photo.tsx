'use client';

import { useRef } from 'react';

/*
 * Someone's photo, small. Pressing it opens it large over the page, and a
 * press anywhere, or Escape, puts it away again.
 */
export function Photo({ src, name, className }: { src: string; name: string; className?: string }) {
  const large = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={className ? `photo ${className}` : 'photo'} aria-label={`See the photo of ${name} larger`} onClick={() => large.current?.showModal()}>
        <img src={src} alt="" />
      </button>
      {/* A press on the photo or beside it lands here, so either closes it */}
      <dialog ref={large} className="photo-large" aria-label={`Photo of ${name}`} onClick={() => large.current?.close()}>
        <button type="button" aria-label="Close the photo"><img src={src} alt="" /></button>
      </dialog>
    </>
  );
}
