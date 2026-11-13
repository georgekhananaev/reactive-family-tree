/*
 * One person as a page of their own, drawn on the server so it reads without
 * any script and search engines can follow a family from person to person.
 * It shows exactly what the reader may see. Someone a visitor may not see has
 * no page at all for them.
 */

import type { PersonDetail, RelativeBrief } from '@reactive-family-tree/core';
import { HttpError } from '@reactive-family-tree/server';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { getApp } from '@/lib/server';

export const dynamic = 'force-dynamic';

interface Loaded {
  detail: PersonDetail;
  familyName: string;
  baseUrl: string;
  /* Whether someone who is not signed in sees this person too. Only then may search engines list the page. */
  open: boolean;
}

const load = cache(async (id: string): Promise<Loaded | null> => {
  const app = await getApp();
  await app.store.fresh();
  const user = await app.userOf(new Request(`${app.config.baseUrl}/people/${id}`, { headers: new Headers(await headers()) }));
  const reader = user ? await app.members.actorFor(user) : app.members.visitor();
  const seenBy = async (actor: typeof reader) => {
    try {
      return await app.views.person(actor, id);
    } catch (error) {
      if (error instanceof HttpError) return null;
      throw error;
    }
  };
  const detail = await seenBy(reader);
  if (!detail) return null;
  const open = reader.visitor || Boolean(await seenBy(app.members.visitor()));
  return { detail, familyName: app.store.settings.familyName, baseUrl: app.config.baseUrl, open };
});

const years = (person: { born?: number | null; died?: number | null }) =>
  (person.born ? ` (${person.born}${person.died ? ` to ${person.died}` : ''})` : '');

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const found = await load((await params).id);
  if (!found) return { title: 'Not found', robots: { index: false } };
  const { detail: d, familyName, baseUrl, open } = found;
  const birth = d.facts.find((fact) => fact.type === 'birth');
  const partners = d.unions.flatMap((union) => (union.partner?.id ? [union.partner.name] : []));
  const children = d.unions.reduce((count, union) => count + union.children.length, 0);
  const parts = [
    birth?.place && `Born in ${birth.place}`,
    partners.length && `partner of ${partners.join(' and ')}`,
    children && `${children} ${children === 1 ? 'child' : 'children'}`,
  ].filter(Boolean);
  const title = `${d.name}${years(d)}, ${familyName}`;
  const description = parts.length ? `${parts.join(', ')}.` : `${d.name} on the ${familyName} tree.`;
  return {
    // The address this install is reached at is only known while it runs, so links are made whole here
    metadataBase: new URL(baseUrl),
    title,
    description,
    alternates: { canonical: `/people/${d.id}` },
    openGraph: { type: 'profile', title, description, url: `/people/${d.id}`, siteName: familyName },
    robots: open ? undefined : { index: false, follow: false },
  };
}

function Relative({ person }: { person: RelativeBrief }) {
  const label = `${person.name}${years(person)}`;
  return person.id ? <Link href={`/people/${person.id}`}>{label}</Link> : <span>{label}</span>;
}

function Relatives({ title, people }: { title: string; people: RelativeBrief[] }) {
  if (!people.length) return null;
  return (
    <>
      <h2>{title}</h2>
      <ul>{people.map((person, index) => <li key={person.id ?? index}><Relative person={person} /></li>)}</ul>
    </>
  );
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const found = await load((await params).id);
  if (!found) notFound();
  const { detail: d, familyName, baseUrl, open } = found;
  const birth = d.facts.find((fact) => fact.type === 'birth');
  const death = d.facts.find((fact) => fact.type === 'death');
  const others = d.facts.filter((fact) => fact !== birth && fact !== death);
  const at = (id: string | null) => (id ? `${baseUrl}/people/${id}` : undefined);
  // What search engines are told about this person. Only what a visitor may see, and only links to people who have a page.
  const person = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      '@id': at(d.id),
      name: d.name,
      givenName: d.given || undefined,
      familyName: d.family || undefined,
      alternateName: d.birthName ? `${d.given} ${d.birthName}` : undefined,
      birthDate: birth?.date && 'from' in birth.date ? birth.date.from : undefined,
      birthPlace: birth?.place || undefined,
      deathDate: death?.date && 'from' in death.date ? death.date.from : undefined,
      parent: d.parents.filter((parent) => parent.id).map((parent) => ({ '@type': 'Person', '@id': at(parent.id), name: parent.name })),
      spouse: d.unions.flatMap((union) => (union.partner?.id ? [{ '@type': 'Person', '@id': at(union.partner.id), name: union.partner.name }] : [])),
      children: d.unions.flatMap((union) => union.children.filter((child) => child.id).map((child) => ({ '@type': 'Person', '@id': at(child.id), name: child.name }))),
    },
  };

  return (
    <main className="page">
      <article className="sheet wide person-page">
        <p className="lead"><Link href="/">{familyName}</Link></p>
        <h1>{d.name}</h1>
        {d.birthName && <p className="life">born {d.birthName}</p>}
        <p className="life">{[birth?.dateText && `Born ${birth.dateText}${birth.place ? `, ${birth.place}` : ''}`, death?.dateText && `died ${death.dateText}`].filter(Boolean).join(', ')}</p>

        {others.length > 0 && (
          <dl>
            {others.map((fact) => (
              <div key={fact.id} style={{ display: 'contents' }}>
                <dt>{fact.type}</dt>
                <dd>{[fact.value, fact.dateText, fact.place].filter(Boolean).join(', ')}</dd>
              </div>
            ))}
          </dl>
        )}

        {d.bio && <><h2>Story</h2><p className="story">{d.bio}</p></>}

        <Relatives title="Parents" people={d.parents} />
        {d.unions.map((union) => (
          <div key={union.id}>
            {union.partner && <><h2>{union.status === 'ended' ? 'Former partner' : 'Partner'}</h2><p><Relative person={union.partner} />{union.since ? `, since ${union.since}` : ''}</p></>}
            <Relatives title="Children" people={union.children} />
          </div>
        ))}
        <Relatives title="Brothers and sisters" people={d.siblings} />

        <p className="back"><Link href={`/#person=${d.id}`}>See {d.given || 'them'} on the tree</Link></p>
      </article>
      {open && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(person).replace(/</g, '\\u003c') }} />}
    </main>
  );
}
