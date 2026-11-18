/*
 * The tree's own card: the family's name and line, the tree, and for a tree
 * open to visitors how many people it holds, over how many generations, since
 * when. A private tree tells its name and line only, as its page title does.
 */

import type { ReactElement } from 'react';

import { getT } from '@/lib/i18n/server';
import { getApp } from '@/lib/server';

import { Card, LEAF, Line, MUTED, Title, treeMark } from './card';
import { treeFacts } from './facts';

/* The tree as a visitor sees it, in the language this link is read in. */
async function visitorTree() {
  const app = await getApp();
  await app.store.fresh();
  const { lang } = await getT();
  return app.views.tree({ ...app.members.visitor(), lang });
}

export async function familyCard(): Promise<ReactElement> {
  const [tree, { dir, t }, { config }, mark] = await Promise.all([visitorTree(), getT(), getApp(), treeMark()]);
  const rtl = dir === 'rtl';
  const { name, description } = tree.family;
  const facts = tree.closed ? null : treeFacts(tree);
  const counted = facts?.people
    ? [
        t('{n## person|# people}', { n: facts.people }),
        facts.generations > 1 && t('{n## generation|# generations}', { n: facts.generations }),
        facts.since && t('since {year}', { year: facts.since }),
      ].filter((part): part is string => Boolean(part))
    : [];
  return (
    <Card rtl={rtl} baseUrl={config.baseUrl} art={<img src={mark} width={430} height={430} alt="" />}>
      <Line text={t('Family tree')} rtl={rtl} style={{ fontSize: 28, fontWeight: 600, color: LEAF }} />
      <Title text={name} rtl={rtl} />
      {description && <Line text={description} rtl={rtl} style={{ fontSize: 34, lineHeight: 1.3, color: MUTED, maxHeight: 34 * 2.6, overflow: 'hidden' }} />}
      {counted.length > 0 && <Line text={counted.join(' · ')} rtl={rtl} style={{ fontSize: 30, fontWeight: 600, color: LEAF, marginTop: 8 }} />}
    </Card>
  );
}
