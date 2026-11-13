import type { ReactNode } from 'react';

/* A page that has only something to say: an address that leads nowhere, a tree that could not be fetched, a page that broke. */
export function PageNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="page">
      <div className="sheet">
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}
