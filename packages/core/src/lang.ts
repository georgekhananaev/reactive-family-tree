/*
 * The languages the tree speaks, and the one small engine every sentence goes
 * through.
 *
 * A sentence is written in English where it is used. The other languages keep
 * a book of the same sentences, looked up by the English one, so a missing
 * translation falls back to English and never to nothing.
 *
 * A sentence may have gaps and choices:
 *
 *   {name}                    a value put in as it is
 *   {n#one thing|# things}    a choice by number. # is the number itself, and
 *                             the forms are listed the way the language counts:
 *                             English one|other, Russian one|few|many,
 *                             Hebrew one|two|other
 *   {sex?she|he|they}         a choice by sex: female, male, anything else
 */

export const LANGS = ['en', 'he', 'ru'] as const;
export type Lang = (typeof LANGS)[number];

export const isLang = (value: unknown): value is Lang => (LANGS as readonly unknown[]).includes(value);

/* Each language under its own name, the way a list of languages shows them. */
export const LANG_NAMES: Record<Lang, string> = { en: 'English', he: 'עברית', ru: 'Русский' };

export const directionOf = (lang: Lang): 'ltr' | 'rtl' => (lang === 'he' ? 'rtl' : 'ltr');

/*
 * The first of someone's languages that the tree speaks. Takes what a browser
 * says about itself: a list such as ["ru-RU", "en"], or the Accept-Language
 * header, where each language may carry a weight ("he;q=0.9").
 */
export function pickLang(wanted: string | readonly string[] | null | undefined): Lang | null {
  const asked = typeof wanted === 'string'
    ? wanted.split(',').map((part) => {
      const [tag = '', ...rest] = part.trim().split(';');
      const weight = rest.map((one) => one.trim().match(/^q=([\d.]+)$/)?.[1]).find(Boolean);
      return { tag, weight: weight === undefined ? 1 : Number(weight) };
    }).sort((a, b) => b.weight - a.weight).map((one) => one.tag)
    : [...(wanted ?? [])];
  for (const tag of asked) {
    const code = tag.trim().toLowerCase().split('-')[0];
    // Hebrew was "iw" once, and some devices still say so
    const lang = code === 'iw' ? 'he' : code;
    if (isLang(lang)) return lang;
  }
  return null;
}

/*
 * Which language to speak to someone, from what is known about them, first
 * to last: what the page asks for, the choice their browser remembers, the
 * one their account remembers, what their device speaks. With none of those,
 * the family's own.
 */
export function chooseLang(known: { asked?: unknown; remembered?: unknown; account?: unknown; device?: string | null }, family: Lang): Lang {
  for (const one of [known.asked, known.remembered, known.account]) if (isLang(one)) return one;
  return pickLang(known.device) ?? family;
}

/* The cookie that remembers the language a browser chose. */
export const LANG_COOKIE = 'rft-language';

/* One cookie's value out of a Cookie header. */
export function cookieOf(header: string | null | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

export type Values = Record<string, string | number | null | undefined>;
/* The same sentences in another language, by the English one. */
export type Book = Readonly<Record<string, string>>;

/* How each language sorts numbers into its forms, in the order the forms are written. */
const FORMS: Record<Lang, readonly Intl.LDMLPluralRule[]> = { en: ['one', 'other'], ru: ['one', 'few', 'many'], he: ['one', 'two', 'other'] };
const counters = new Map<Lang, Intl.PluralRules>();

function formFor(lang: Lang, count: number, forms: readonly string[]): string {
  let counter = counters.get(lang);
  if (!counter) counters.set(lang, counter = new Intl.PluralRules(lang));
  const at = FORMS[lang].indexOf(counter.select(count));
  // A kind of number the list does not name (a fraction, in Russian) takes the last form, as does a short list
  return forms[at < 0 || at >= forms.length ? forms.length - 1 : at] ?? '';
}

/* Split on the bars that are not inside a gap of their own. */
function formsOf(text: string): string[] {
  const forms: string[] = [];
  let depth = 0, from = 0;
  for (let at = 0; at < text.length; at++) {
    if (text[at] === '{') depth++;
    else if (text[at] === '}') depth--;
    else if (text[at] === '|' && depth === 0) {
      forms.push(text.slice(from, at));
      from = at + 1;
    }
  }
  return [...forms, text.slice(from)];
}

/* Fill a sentence's gaps and make its choices. `put` says what a value becomes, so a page can put a piece of itself in a gap. */
export function fill<Piece>(lang: Lang, sentence: string, values: Record<string, unknown>, put: (value: unknown) => Piece, words: (text: string) => Piece): Piece[] {
  const pieces: Piece[] = [];
  let at = 0;
  while (at < sentence.length) {
    const open = sentence.indexOf('{', at);
    if (open < 0) break;
    let depth = 1, close = open + 1;
    while (close < sentence.length && depth) {
      if (sentence[close] === '{') depth++;
      else if (sentence[close] === '}') depth--;
      close++;
    }
    if (depth) break;
    if (open > at) pieces.push(words(sentence.slice(at, open)));
    const gap = sentence.slice(open + 1, close - 1);
    const mark = gap.search(/[#?]/);
    const name = mark < 0 ? gap : gap.slice(0, mark), value = values[name];
    if (mark < 0) pieces.push(put(value));
    else {
      const forms = formsOf(gap.slice(mark + 1));
      const chosen = gap[mark] === '#'
        ? formFor(lang, Number(value), forms).replaceAll('#', String(value))
        : forms[value === 'female' ? 0 : value === 'male' ? 1 : 2] ?? forms[forms.length - 1] ?? '';
      pieces.push(...fill(lang, chosen, values, put, words));
    }
    at = close;
  }
  if (at < sentence.length) pieces.push(words(sentence.slice(at)));
  return pieces;
}

/* A sentence in someone's language, from that language's book. */
export function sayFrom(book: Book | null, lang: Lang, english: string, values: Values = {}): string {
  const sentence = book?.[english] ?? english;
  // With no gaps there is nothing to fill
  if (!sentence.includes('{')) return sentence;
  return fill(lang, sentence, values, (value) => String(value ?? ''), (text) => text).join('');
}

/* A list read out: "A", "A and B", "A, B and C". */
export function listed(lang: Lang, items: readonly string[]): string {
  if (items.length < 2) return items[0] ?? '';
  const last = items[items.length - 1] ?? '', before = items.slice(0, -1).join(', ');
  if (lang === 'ru') return `${before} и ${last}`;
  // Hebrew writes its "and" onto the next word. Before a word in other letters it takes a hyphen.
  if (lang === 'he') return `${before} ו${/^[֐-׿]/.test(last) ? '' : '-'}${last}`;
  return `${before} and ${last}`;
}
