/*
 * The picture shown for a shared link to one person: their photo, name and
 * years. It is drawn from what a visitor may see, whoever shares the link, as
 * a chat app fetches it without anyone signed in. Someone a visitor may not
 * see gets the tree's own card instead, which tells nothing about them.
 */

import { HttpError, familyText } from '@reactive-family-tree/server';

import { Card, LEAF, Line, MUTED, Title, cardImage, treeMark } from '@/lib/card/card';
import { familyCard } from '@/lib/card/family';
import { getT } from '@/lib/i18n/server';
import { getApp } from '@/lib/server';

export const dynamic = 'force-dynamic';

/* The person as a visitor sees them, with their photo, or nothing when a visitor may not see them. */
async function seen(id: string) {
  const app = await getApp();
  await app.store.fresh();
  const { lang } = await getT();
  const visitor = { ...app.members.visitor(), lang };
  try {
    const person = await app.views.person(visitor, id);
    const photo = app.views.portraitOf(visitor, id);
    const bytes = photo ? await app.media.read(photo) : null;
    return { person, photo: bytes && `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`, familyName: familyText(app.store.settings, 'familyName', lang), baseUrl: app.config.baseUrl };
  } catch (error) {
    // Not on the tree, or not for a visitor. The app outlives a reload while developing, so the error may be another copy of the class.
    if (error instanceof HttpError || (error instanceof Error && typeof (error as Partial<HttpError>).status === 'number')) return null;
    throw error;
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const found = await seen((await params).id);
  if (!found) return cardImage(await familyCard());
  const { person: p, photo, familyName, baseUrl } = found;
  const [{ dir, t }, mark] = await Promise.all([getT(), treeMark()]);
  const rtl = dir === 'rtl';
  const place = p.facts.find((fact) => fact.type === 'birth')?.place;
  const years = p.born ? (p.died ? t('{born} to {died}', { born: p.born, died: p.died }) : String(p.born)) : '';
  const art = photo
    ? <img src={photo} width={400} height={400} alt="" style={{ borderRadius: 200, borderWidth: 10, borderStyle: 'solid', borderColor: '#FFFFFF', boxShadow: `0 0 0 6px ${LEAF}, 0 24px 60px rgba(20, 38, 31, 0.25)`, objectFit: 'cover' }} />
    : <img src={mark} width={430} height={430} alt="" />;
  return cardImage(
    <Card rtl={rtl} baseUrl={baseUrl} art={art}>
      <div style={{ display: 'flex', flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 14 }}>
        {photo && <img src={mark} width={44} height={44} alt="" />}
        <Line text={familyName} rtl={rtl} style={{ fontSize: 30, fontWeight: 600, color: LEAF }} />
      </div>
      <Title text={p.name} rtl={rtl} />
      {years && <Line text={years} rtl={rtl} style={{ fontFamily: 'display', fontSize: 44, fontWeight: 600, color: MUTED }} />}
      {place && <Line text={t('Born in {place}', { place })} rtl={rtl} style={{ fontSize: 32, color: MUTED, maxHeight: 32 * 2.6, overflow: 'hidden' }} />}
    </Card>,
  );
}
