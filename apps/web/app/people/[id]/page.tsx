/*
 * One person as a page of their own, drawn on the server so it reads without
 * any script and search engines can follow a family from person to person.
 * It shows exactly what the reader may see. Someone a visitor may not see has
 * no page at all for them.
 */

import { familyText } from '@reactive-family-tree/server';
import type { Actor, PersonDetail, RelativeBrief } from '@reactive-family-tree/core';
import { HttpError } from '@reactive-family-tree/server';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { factPieces } from '@/components/card/InLang';
import { FACT_LABEL } from '@/components/card/labels';
import { Photo } from '@/components/Photo';
import { previewImage } from '@/lib/card/meta';
import { portraitUrl } from '@/lib/format';
import { OG_LOCALE, getT, requestLang } from '@/lib/i18n/server';
import { getApp } from '@/lib/server';

export const dynamic = 'force-dynamic';

type Say = Awaited<ReturnType<typeof getT>>['t'];

interface Loaded {
  detail: PersonDetail;
  familyName: string;
  baseUrl: string;
  /* Whether someone who is not signed in sees this person too. Only then may search engines list the page. */
  open: boolean;
  /* The number of the tree's last change. */
  seq: number;
}

const load = cache(async (id: string): Promise<Loaded | null> => {
  const app = await getApp();
  await app.store.fresh();
  const lang = await requestLang();
  const user = await app.userOf(new Request(`${app.config.baseUrl}/people/${id}`, { headers: new Headers(await headers()) }));
  // The person's words are read in the same language as the page around them
  const reader = { ...(user ? await app.members.actorFor(user) : app.members.visitor()), lang };
  const seenBy = async (actor: Actor) => {
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
  // The family's name is words like a person's: in the reader's language where the family has written it in theirs
  const { settings } = app.store;
  return { detail, familyName: familyText(settings, 'familyName', lang), baseUrl: app.config.baseUrl, open, seq: app.store.seq };
});

const years = (person: { born?: number | null; died?: number | null }, t: Say) =>
  (person.born ? ` (${person.died ? t('{born} to {died}', { born: person.born, died: person.died }) : person.born})` : '');

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const found = await load((await params).id);
  const { lang, t, list } = await getT();
  if (!found) return { title: t('Not found'), robots: { index: false } };
  const { detail: d, familyName, open, seq } = found;
  const birth = d.facts.find((fact) => fact.type === 'birth');
  const partners = d.unions.flatMap((union) => (union.partner?.id ? [union.partner] : []));
  const children = d.unions.reduce((count, union) => count + union.children.length, 0);
  const parts = [
    birth?.place && t('Born in {place}', { place: birth.place }),
    partners.length && t('partner of {names}', { names: list(partners.map((partner) => partner.name)), sex: d.sex, partner: partners.length === 1 ? partners[0]?.sex : 'unknown' }),
    children && t('{n## child|# children}', { n: children }),
  ].filter(Boolean);
  const title = `${d.name}${years(d, t)}, ${familyName}`;
  const description = parts.length ? `${parts.join(', ')}.` : t('{name} on the {family} tree.', { name: d.name, family: familyName });
  return {
    title,
    description,
    alternates: { canonical: `/people/${d.id}` },
    openGraph: {
      type: 'profile', title, description, url: `/people/${d.id}`, siteName: familyName, locale: OG_LOCALE[lang],
      // Their picture shows them only when a visitor may see them. For anyone else it is the tree's card, and says so.
      images: [previewImage(`/people/${d.id}/preview.png`, seq, open ? t('{name} on the {family} tree.', { name: d.name, family: familyName }) : t('The {family} tree.', { family: familyName }))],
    },
    robots: open ? undefined : { index: false, follow: false },
  };
}

function Relative({ person, t }: { person: RelativeBrief; t: Say }) {
  const label = `${person.name}${years(person, t)}`;
  return person.id ? <Link href={`/people/${person.id}`}>{label}</Link> : <span>{label}</span>;
}

function Relatives({ title, people, t }: { title: string; people: RelativeBrief[]; t: Say }) {
  if (!people.length) return null;
  return (
    <>
      <h2>{title}</h2>
      <ul>{people.map((person, index) => <li key={person.id ?? index}><Relative person={person} t={t} /></li>)}</ul>
    </>
  );
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const found = await load((await params).id);
  if (!found) notFound();
  const { t } = await getT();
  const { detail: d, familyName, baseUrl, open } = found;
  const birth = d.facts.find((fact) => fact.type === 'birth');
  const death = d.facts.find((fact) => fact.type === 'death');
  const others = d.facts.filter((fact) => fact !== birth && fact !== death);
  const at = (id: string | null) => (id ? `${baseUrl}/people/${id}` : undefined);
  const photo = portraitUrl(d);
  const born = birth?.dateText && (birth.place ? t('Born {date}, {place}', { date: birth.dateText, place: birth.place }) : t('Born {date}', { date: birth.dateText }));
  const bioFrom = d.words.from.bio;
  // What search engines are told about this person. Only what a visitor may see, and only links to people who have a page.
  const person = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      '@id': at(d.id),
      name: d.name,
      // Their photo is named only when a visitor may see them, as the page itself is
      image: open && photo ? `${baseUrl}${photo}` : undefined,
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
        {/* A plain image inside: it is small, already sized, and private to whoever may see this page */}
        {photo && <Photo className="person-photo" src={photo} name={d.name} />}
        <h1>{d.name}</h1>
        {d.birthName && <p className="life">{t('born {name}', { name: d.birthName })}</p>}
        <p className="life">{[born, death?.dateText && t('died {date}', { date: death.dateText })].filter(Boolean).join(', ')}</p>

        {others.length > 0 && (
          <dl>
            {others.map((fact) => (
              <div key={fact.id} style={{ display: 'contents' }}>
                <dt>{t(FACT_LABEL[fact.type])}</dt>
                <dd>{factPieces(fact)}</dd>
              </div>
            ))}
          </dl>
        )}

        {d.bio && <><h2>{t('Story')}</h2><p className="story" lang={bioFrom} dir={bioFrom && 'auto'}>{d.bio}</p></>}

        <Relatives title={t('Parents')} people={d.parents} t={t} />
        {d.unions.map((union) => (
          <div key={union.id}>
            {union.partner && <><h2>{t(union.status === 'ended' ? 'Former partner' : 'Partner', { partner: union.partner.sex })}</h2><p><Relative person={union.partner} t={t} />{union.since ? t(', since {year}', { year: union.since }) : ''}</p></>}
            <Relatives title={t('Children')} people={union.children} t={t} />
          </div>
        ))}
        <Relatives title={t('Brothers and sisters')} people={d.siblings} t={t} />

        <p className="back"><Link href={`/#person=${d.id}`}>{d.given ? t('See {name} on the tree', { name: d.given }) : t('See them on the tree')}</Link></p>
      </article>
      {open && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(person).replace(/</g, '\\u003c') }} />}
    </main>
  );
}
