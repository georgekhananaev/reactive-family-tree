/*
 * Naming a relationship: "your great-aunt", "your first cousin once removed".
 *
 * Given the chain of steps from you to someone (each step is to a parent, a
 * child or a partner), say what they are to you in plain words. Returns null
 * when the chain is not one of the simple shapes, or runs further than the
 * language has words for, and the caller then shows the chain itself.
 *
 * Each language names relatives by its own system, so each has its own rules
 * here and none is a translation of another. English counts cousins and how
 * many generations apart they are. Russian names the generation (uncle,
 * grandmother, nephew) and says how far to the side. Hebrew names a far
 * relative through a nearer one, the way people say it: "the cousin of your
 * father". Both have a word for each of the nearest relatives by marriage.
 *
 * The words are the ones said at home: мама and папа, אמא and אבא, муж and жена.
 */

import type { Lang } from './lang';
import type { KinStep, Sex } from './types';

const bySex = <Word>(sex: Sex, female: Word, male: Word, either: Word): Word => (sex === 'female' ? female : sex === 'male' ? male : either);

/* Parents then children, nothing else: the shape of every blood relation. */
function upsAndDowns(hows: KinStep['how'][]): { ups: number; downs: number } | null {
  let ups = 0;
  while (hows[ups] === 'parent') ups++;
  const rest = hows.slice(ups);
  return rest.every((how) => how === 'child') ? { ups, downs: rest.length } : null;
}

/* ---------- English ---------- */

const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
const REMOVED = ['', ' once removed', ' twice removed'];
const greats = (count: number) => 'great-'.repeat(Math.max(0, count));

/* `ups` generations up from you to the ancestor you share, then `downs` back down to them. */
function bloodTerm(ups: number, downs: number, sex: Sex): string {
  if (ups === 0) return `${downs > 1 ? `${greats(downs - 2)}grand` : ''}${bySex(sex, 'daughter', 'son', 'child')}`;
  if (downs === 0) return `${ups > 1 ? `${greats(ups - 2)}grand` : ''}${bySex(sex, 'mother', 'father', 'parent')}`;
  if (ups === 1 && downs === 1) return bySex(sex, 'sister', 'brother', 'sibling');
  if (downs === 1) return `${greats(ups - 2)}${bySex(sex, 'aunt', 'uncle', 'aunt or uncle')}`;
  if (ups === 1) return `${greats(downs - 2)}${bySex(sex, 'niece', 'nephew', 'niece or nephew')}`;
  const degree = Math.min(ups, downs) - 1, removed = Math.abs(ups - downs);
  return `${ORDINALS[degree] ?? `${degree}th`} cousin${REMOVED[removed] ?? ` ${removed} times removed`}`;
}

/* ---------- Russian ---------- */

/*
 * A relative in Russian: as they are named, and with "your" in front, standing
 * on its own and after "of". Where the sex is not known both are said, each
 * with its own "your": "ваш брат или ваша сестра".
 */
interface RuTerm {
  is: string;
  your: string;
  ofYour: string;
}
type RuNoun = readonly [she: string, ofHer: string, he: string, ofHim: string];

const RU_CHILD: RuNoun = ['дочь', 'дочери', 'сын', 'сына'];
const RU_GRANDCHILD: RuNoun = ['внучка', 'внучки', 'внук', 'внука'];
const RU_PARENT: RuNoun = ['мама', 'мамы', 'папа', 'папы'];
const RU_GRANDPARENT: RuNoun = ['бабушка', 'бабушки', 'дедушка', 'дедушки'];
const RU_SIBLING: RuNoun = ['сестра', 'сестры', 'брат', 'брата'];
const RU_AUNT: RuNoun = ['тётя', 'тёти', 'дядя', 'дяди'];
const RU_NIECE: RuNoun = ['племянница', 'племянницы', 'племянник', 'племянника'];
const RU_PARTNER: RuNoun = ['жена', 'жены', 'муж', 'мужа'];
/* One step of a chain whose sex is not known, in one word where Russian has one. */
const RU_EITHER: Record<KinStep['how'], string> = { parent: 'родитель', child: 'ребёнок', partner: 'муж или жена' };
/* Relatives by marriage who have a name of their own: [her, him]. A husband's parents, a wife's parents, and whoever married your child, brother or sister. */
const RU_HUSBANDS_PARENT = ['свекровь', 'свёкор'] as const;
const RU_WIVES_PARENT = ['тёща', 'тесть'] as const;
const RU_MARRIED_IN = ['невестка', 'зять'] as const;
/* How far to the side: a родной relative needs no word, then двоюродный, троюродный and on. */
const RU_SIDE = ['', '', 'двоюродн', 'троюродн', 'четвероюродн', 'пятиюродн', 'шестиюродн', 'семиюродн'];

function ruTerm(noun: RuNoun, sex: Sex, { before = '', side = 0, grand = false } = {}): RuTerm | null {
  if (side >= RU_SIDE.length) return null;
  if (sex !== 'female' && sex !== 'male') {
    const him = ruTerm(noun, 'male', { before, side, grand }), her = ruTerm(noun, 'female', { before, side, grand });
    return him && her && { is: `${him.is} или ${her.is}`, your: `${him.your} или ${her.your}`, ofYour: `${him.ofYour} или ${her.ofYour}` };
  }
  const she = sex === 'female';
  // "двоюродная сестра", "двоюродного брата"
  const bent = (stem: string) => (stem ? [`${stem}${she ? 'ая' : 'ый'} `, `${stem}${she ? 'ой' : 'ого'} `] : ['', '']);
  const [sideIs = '', sideOf = ''] = bent(RU_SIDE[side] ?? ''), [grandIs = '', grandOf = ''] = bent(grand ? `${before}внучат` : '');
  const [is, of] = she ? [noun[0], noun[1]] : [noun[2], noun[3]];
  const prefix = grand ? '' : before;
  const named = `${sideIs}${grandIs}${prefix}${is}`;
  return { is: named, your: `${she ? 'ваша' : 'ваш'} ${named}`, ofYour: `${she ? 'вашей' : 'вашего'} ${sideOf}${grandOf}${prefix}${of}` };
}

function ruBlood(ups: number, downs: number, sex: Sex): RuTerm | null {
  const pra = (count: number) => 'пра'.repeat(Math.max(0, count));
  const known = sex === 'female' || sex === 'male';
  // A child whose sex is not known is "ваш ребёнок", as people say. Nobody says "ваш родитель": that is one of your parents.
  if (ups === 0 && downs === 1 && !known) return { is: RU_EITHER.child, your: 'ваш ребёнок', ofYour: 'вашего ребёнка' };
  if (ups === 1 && downs === 0 && !known) return { is: RU_EITHER.parent, your: 'один из ваших родителей', ofYour: 'одного из ваших родителей' };
  if (ups === 0) return downs === 1 ? ruTerm(RU_CHILD, sex) : ruTerm(RU_GRANDCHILD, sex, { before: pra(downs - 2) });
  if (downs === 0) return ups === 1 ? ruTerm(RU_PARENT, sex) : ruTerm(RU_GRANDPARENT, sex, { before: pra(ups - 2) });
  const older = ups - downs;
  if (older === 0) return ruTerm(RU_SIBLING, sex, { side: downs });
  if (older === 1) return ruTerm(RU_AUNT, sex, { side: downs });
  // A grandmother's sister is already a "двоюродная бабушка", so that generation counts one further to the side
  if (older > 1) return ruTerm(RU_GRANDPARENT, sex, { before: pra(older - 2), side: downs + 1 });
  if (older === -1) return ruTerm(RU_NIECE, sex, { side: ups });
  return ruTerm(RU_NIECE, sex, { before: pra(-older - 2), side: ups, grand: true });
}

function ruKinship(steps: readonly KinStep[], blood: (hows: KinStep['how'][], sex: Sex) => RuTerm | null): string | null {
  if (!steps.length) return 'вы';
  const hows = steps.map((step) => step.how);
  const them = steps[steps.length - 1];
  const partner = (sex: Sex) => ruTerm(RU_PARTNER, sex);
  if (hows.length === 1 && hows[0] === 'partner') return partner(them.sex)!.your;
  const direct = blood(hows, them.sex);
  if (direct) return direct.your;

  // The nearest relatives by marriage have names of their own, where it is known who is the husband and who the wife
  const path = hows.join(' '), named = (pair: readonly [string, string]) => (them.sex === 'female' ? `ваша ${pair[0]}` : `ваш ${pair[1]}`);
  if (path === 'partner parent' && them.sex !== 'unknown') {
    if (steps[0].sex === 'male') return named(RU_HUSBANDS_PARENT);
    if (steps[0].sex === 'female') return named(RU_WIVES_PARENT);
  }
  if (path === 'child partner' || path === 'parent child partner') {
    const through = steps[steps.length - 2].sex;
    if ((them.sex === 'female' && through === 'male') || (them.sex === 'male' && through === 'female')) return named(RU_MARRIED_IN);
  }

  if (them.how === 'partner') {
    const relative = blood(hows.slice(0, -1), steps[steps.length - 2].sex);
    if (relative) return `${partner(them.sex)!.is} ${relative.ofYour}`;
  }
  if (hows[0] === 'partner') {
    const theirs = blood(hows.slice(1), them.sex);
    if (theirs) return `${theirs.is} ${partner(steps[0].sex)!.ofYour}`;
  }
  return null;
}

/* ---------- Hebrew ---------- */

/*
 * A Hebrew word for a relative, for her and for him. A relative is always
 * someone's, "the son of yours", so most words take ה. Those said like a name
 * do not: אמא, סבא, דוד, אח ("אמא שלך", "דוד של אבא שלך"). Where the sex is
 * not known both words are said: "הבן או הבת".
 */
interface HeNoun {
  she: string;
  he: string;
  the?: boolean;
  /* What to say where the sex is not known, when it is not the two words joined by "or". */
  either?: string;
}

const HE_CHILD: HeNoun = { she: 'בת', he: 'בן', the: true };
/* A grandchild, a great-grandchild, and the one after: Hebrew has a word for each, and then no more. */
const HE_DESCENDANTS: readonly HeNoun[] = [{ she: 'נכדה', he: 'נכד', the: true }, { she: 'נינה', he: 'נין', the: true }, { she: 'חימשה', he: 'חימש', the: true }];
const HE_PARENT: HeNoun = { she: 'אמא', he: 'אבא', either: 'אחד ההורים' };
const HE_GRANDPARENT: HeNoun = { she: 'סבתא', he: 'סבא' };
const HE_SIBLING: HeNoun = { she: 'אחות', he: 'אח' };
const HE_AUNT: HeNoun = { she: 'דודה', he: 'דוד' };
const HE_NIECE: HeNoun = { she: 'אחיינית', he: 'אחיין', the: true };
const HE_COUSIN: HeNoun = { she: 'בת דודה', he: 'בן דוד' };
const HE_PARTNER: HeNoun = { she: 'בת הזוג', he: 'בן הזוג', either: 'בן או בת הזוג' };
/* Relatives by marriage who have a name of their own: a partner's parents, a brother- or sister-in-law, and whoever married your child. */
const HE_PARTNERS_PARENT: HeNoun = { she: 'חמות', he: 'חם', the: true };
const HE_IN_LAW: HeNoun = { she: 'גיסה', he: 'גיס', the: true };
const HE_CHILDS_PARTNER: HeNoun = { she: 'כלה', he: 'חתן', the: true };
/* One step of a chain in a word, with no "the": "אמא", "בן", "בת זוג". */
const HE_STEP: Record<KinStep['how'], HeNoun> = { parent: { ...HE_PARENT, either: 'הורה' }, child: { she: 'בת', he: 'בן' }, partner: { she: 'בת זוג', he: 'בן זוג', either: 'בן או בת זוג' } };
/* A second cousin is a cousin "of the second degree", and the degree is feminine whoever the cousin is. */
const HE_DEGREE = ['', '', 'שנייה', 'שלישית', 'רביעית', 'חמישית', 'שישית'];

function heWord(noun: HeNoun, sex: Sex): string {
  const the = (word: string) => (noun.the ? `ה${word}` : word);
  if (sex === 'female') return the(noun.she);
  if (sex === 'male') return the(noun.he);
  return noun.either ?? `${the(noun.he)} או ${the(noun.she)}`;
}

/* "רבתא" for her and "רבא" for him, once for each generation further back. */
function heGreat(noun: HeNoun, count: number, sex: Sex): string {
  if (count < 1) return heWord(noun, sex);
  const more = (word: string) => ' ' + Array.from({ length: count }, () => word).join(' ');
  return heWord({ she: noun.she + more('רבתא'), he: noun.he + more('רבא') }, sex);
}
const heAncestor = (ups: number, sex: Sex) => (ups === 1 ? heWord(HE_PARENT, sex) : heGreat(HE_GRANDPARENT, ups - 2, sex));
function heDescendant(downs: number, sex: Sex): string | null {
  const named = downs === 1 ? HE_CHILD : HE_DESCENDANTS[downs - 2];
  return named ? heWord(named, sex) : null;
}
function heCousin(degree: number, sex: Sex): string | null {
  const nth = HE_DEGREE[degree];
  if (nth === undefined) return null;
  return nth ? `${heWord(HE_COUSIN, sex)} מדרגה ${nth}` : heWord(HE_COUSIN, sex);
}

/*
 * A blood relative, from the chain to them. Hebrew names a far relative
 * through a nearer one, the way people say it: "the cousin of your father",
 * "the son of your cousin", "the aunt of your mother". So the people along the
 * chain are needed, and not only its shape.
 */
function heBlood(steps: readonly KinStep[]): string | null {
  const shape = upsAndDowns(steps.map((step) => step.how));
  if (!shape || !steps.length) return null;
  const { ups, downs } = shape, { sex } = steps[steps.length - 1];
  if (ups === 0) return heDescendant(downs, sex);
  if (downs === 0) return heAncestor(ups, sex);
  if (ups === 1 && downs === 1) return heWord(HE_SIBLING, sex);
  if (downs === 1) {
    // A grandparent's sister is the aunt of your parent
    return ups === 2 ? heWord(HE_AUNT, sex) : `${heWord(HE_AUNT, sex)} של ${heAncestor(ups - 2, steps[ups - 3].sex)}`;
  }
  if (ups === 1) {
    if (downs === 2) return heWord(HE_NIECE, sex);
    const theirs = heDescendant(downs - 1, sex);
    return theirs && `${theirs} של ${heWord(HE_SIBLING, steps[1].sex)}`;
  }
  const older = ups - downs;
  if (older === 0) return heCousin(ups - 1, sex);
  if (older > 0) {
    // The cousin of an ancestor: of the parent, or the grandparent, that the chain goes up through
    const cousin = heCousin(downs - 1, sex);
    return cousin && `${cousin} של ${heAncestor(older, steps[older - 1].sex)}`;
  }
  // The child, or grandchild, of a cousin of your own, who stands where the chain has come as far down as it went up
  const cousin = heCousin(ups - 1, steps[2 * ups - 1].sex), theirs = heDescendant(-older, sex);
  return cousin && theirs && `${theirs} של ${cousin}`;
}

function heKinship(steps: readonly KinStep[]): string | null {
  // Hebrew says "you" one way to a man and another to a woman, and the tree does not ask which. It speaks of their leaf.
  if (!steps.length) return 'העלה שלך';
  const hows = steps.map((step) => step.how);
  const them = steps[steps.length - 1];
  if (hows.length === 1 && hows[0] === 'partner') return `${heWord(HE_PARTNER, them.sex)} שלך`;
  const direct = heBlood(steps);
  if (direct) return `${direct} שלך`;

  // The nearest relatives by marriage have names of their own
  const path = hows.join(' ');
  if (path === 'partner parent') return `${heWord(HE_PARTNERS_PARENT, them.sex)} שלך`;
  if (path === 'partner parent child' || path === 'parent child partner') return `${heWord(HE_IN_LAW, them.sex)} שלך`;
  if (path === 'child partner') return `${heWord(HE_CHILDS_PARTNER, them.sex)} שלך`;

  if (them.how === 'partner') {
    const relative = heBlood(steps.slice(0, -1));
    if (relative) return `${heWord(HE_PARTNER, them.sex)} של ${relative} שלך`;
  }
  if (hows[0] === 'partner') {
    const theirs = heBlood(steps.slice(1));
    if (theirs) return `${theirs} של ${heWord(HE_PARTNER, steps[0].sex)} שלך`;
  }
  return null;
}

/* ---------- Any language ---------- */

/* One step of the chain in a word: "mother", "son", "partner". */
export function stepWord({ how, sex }: KinStep, lang: Lang = 'en'): string {
  if (lang === 'ru') {
    const noun = how === 'partner' ? RU_PARTNER : how === 'parent' ? RU_PARENT : RU_CHILD;
    return bySex(sex, noun[0], noun[2], RU_EITHER[how]);
  }
  if (lang === 'he') return heWord(HE_STEP[how], sex);
  if (how === 'partner') return 'partner';
  return how === 'parent' ? bySex(sex, 'mother', 'father', 'parent') : bySex(sex, 'daughter', 'son', 'child');
}

/*
 * steps: [{ how: 'parent' | 'child' | 'partner', sex }] from you to them.
 * Returns what they are to you, such as "your grandmother" or "the partner of your uncle".
 */
export function describeKinship(steps: readonly KinStep[], lang: Lang = 'en'): string | null {
  if (lang === 'ru') {
    return ruKinship(steps, (hows, sex) => {
      const shape = upsAndDowns(hows);
      return shape && ruBlood(shape.ups, shape.downs, sex);
    });
  }
  if (lang === 'he') return heKinship(steps);
  if (!steps.length) return 'you';
  const hows = steps.map((step) => step.how);
  const them = steps[steps.length - 1];
  if (hows.length === 1 && hows[0] === 'partner') return 'your partner';

  const blood = upsAndDowns(hows);
  if (blood) return `your ${bloodTerm(blood.ups, blood.downs, them.sex)}`;

  // Married in: the partner of one of your relatives
  if (them.how === 'partner') {
    const relative = upsAndDowns(hows.slice(0, -1));
    if (relative) return `the partner of your ${bloodTerm(relative.ups, relative.downs, steps[steps.length - 2].sex)}`;
  }
  // Your partner's side of the family
  if (hows[0] === 'partner') {
    const theirs = upsAndDowns(hows.slice(1));
    if (theirs) return `your partner’s ${bloodTerm(theirs.ups, theirs.downs, them.sex)}`;
  }
  return null;
}
