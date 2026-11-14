/*
 * Fuzzy dates. Family history is full of "about 1890", so a date is stored as
 * what is actually known:
 *
 *   { kind: 'exact' | 'about' | 'before' | 'after', from: 'YYYY[-MM[-DD]]' }
 *   { kind: 'between' | 'or', from, to }
 *   { kind: 'text', text }            anything we could not understand, kept as typed
 *
 * Pure functions, shared by the server and the browser.
 */

import type { Lang } from './lang';
import type { FuzzyDate } from './types';

const MONTHS: Record<Lang, readonly string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  he: ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'],
  ru: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
};
/* Russian bends a month to what stands before it: "4 марта", "до марта", but "между мартом и маем". */
const RU_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const RU_WITH = ['январём', 'февралём', 'мартом', 'апрелем', 'маем', 'июнем', 'июлем', 'августом', 'сентябрём', 'октябрём', 'ноябрём', 'декабрём'];
const GED_MONTHS = MONTHS.en.map((m) => m.slice(0, 3).toUpperCase());

/* How each month's name starts in every language the tree reads, in whatever shape the word is bent to. Enough letters to tell the months apart. */
const MONTH_STARTS: readonly (readonly string[])[] = [
  ['jan', 'янв', 'ינו'], ['feb', 'фев', 'פבר'], ['mar', 'мар', 'מרץ', 'מרס', 'מארס'], ['apr', 'апр', 'אפר'],
  ['may', 'май', 'мая', 'мае', 'מאי'], ['jun', 'июн', 'יונ'], ['jul', 'июл', 'יול'], ['aug', 'авг', 'אוג'],
  ['sep', 'сен', 'ספט'], ['oct', 'окт', 'אוק'], ['nov', 'ноя', 'נוב'], ['dec', 'дек', 'דצמ'],
];

function monthNumber(word: string): number | null {
  const typed = word.toLowerCase();
  // Hebrew writes "in" and "to" onto the month: "4 במרץ", "למאי"
  const keys = /^[בל]/.test(typed) ? [typed, typed.slice(1)] : [typed];
  const index = MONTH_STARTS.findIndex((starts) => starts.some((start) => keys.some((key) => key.startsWith(start))));
  return index < 0 ? null : index + 1;
}

function iso(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, '0');
  if (!month) return y;
  const m = String(month).padStart(2, '0');
  return day ? `${y}-${m}-${String(day).padStart(2, '0')}` : `${y}-${m}`;
}

function validParts(year: number, month: number, day: number): boolean {
  if (year < 1 || year > 9999) return false;
  if (month && (month < 1 || month > 12)) return false;
  if (day && (day < 1 || day > 31)) return false;
  return true;
}

/*
 * One point in time, in any of the tree's languages: "1921", "March 1921",
 * "4 March 1921", "March 4 1921", "1921-03-04", "4.3.1921", "4 марта 1921 г.",
 * "4 במרץ 1921".
 */
function parsePoint(text: string): string | null {
  const t = text.replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim()
    // "в 1921 году", "1921 г", "בשנת 1921": the word for "year" says nothing more
    .replace(/^(?:в|во|ב?שנת) /iu, '').replace(/ (?:г|год|года|году)$/iu, '');
  let m: RegExpMatchArray | null;
  let parts: [year: number, month: number | null, day: number] | null = null;
  if ((m = t.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/))) parts = [+m[1], m[2] ? +m[2] : 0, m[3] ? +m[3] : 0];
  // Written with dots, the day comes first wherever dots are used
  else if ((m = t.match(/^(\d{1,2}) (\d{1,2}) (\d{4})$/))) parts = [+m[3], +m[2], +m[1]];
  else if ((m = t.match(/^(\d{1,2}) (\d{4})$/))) parts = [+m[2], +m[1], 0];
  else if ((m = t.match(/^(\d{1,2}) (\p{L}{3,}) (\d{4})$/u))) parts = [+m[3], monthNumber(m[2]), +m[1]];
  else if ((m = t.match(/^(\p{L}{3,}) (\d{1,2}) (\d{4})$/u))) parts = [+m[3], monthNumber(m[1]), +m[2]];
  else if ((m = t.match(/^(\p{L}{3,}) (\d{4})$/u))) parts = [+m[2], monthNumber(m[1]), 0];
  if (!parts) return null;
  const [year, month, day] = parts;
  if (month === null || !validParts(year, month, day)) return null;
  return iso(year, month, day);
}

/* `after` is what stands before the date in Russian: nothing, a word that takes "of" (около, до, после), or "между". */
function formatPoint(point: string, lang: Lang, after: 'nothing' | 'of' | 'between' = 'nothing'): string {
  const [y, m, d] = point.split('-').map(Number);
  if (!m) return String(y);
  if (lang === 'he') return d ? `${d} ב${MONTHS.he[m - 1]} ${y}` : `${MONTHS.he[m - 1]} ${y}`;
  if (lang === 'ru') return d ? `${d} ${RU_OF[m - 1]} ${y}` : `${(after === 'of' ? RU_OF : after === 'between' ? RU_WITH : MONTHS.ru)[m - 1]} ${y}`;
  return d ? `${d} ${MONTHS.en[m - 1]} ${y}` : `${MONTHS.en[m - 1]} ${y}`;
}

/* The words that make a date less than exact, in every language the tree reads. */
const PREFIXES: [kind: 'about' | 'before' | 'after', pattern: RegExp][] = [
  ['about', /^(?:about|abt|around|circa|ca|c|около|примерно|приблизительно|ок|בערך|סביב|בסביבות)\.?\s+(.+)$/iu],
  // Hebrew also writes "about" as one letter joined to the year: "כ-1890"
  ['about', /^כ[-־]?\s*(\d.*)$/u],
  ['before', /^(?:before|bef|до|раньше|ранее|לפני)\.?\s+(.+)$/iu],
  ['after', /^(?:after|aft|после|позже|позднее|אחרי|לאחר)\.?\s+(.+)$/iu],
];
/* Two dates. A span typed as one ("from 1939 to 1945", "с 1939 по 1945", "מ-1939 עד 1945", "1939-1945") is kept as a time between the two. */
const RANGES: [kind: 'between' | 'or', pattern: RegExp][] = [
  ['or', /^(?:between\s+)?(.+?)\s+(?:or|или|או)\s+(.+)$/iu],
  ['between', /^(?:between\s+|from\s+|между\s+)?(.+?)\s+(?:and|to|и)\s+(.+)$/iu],
  ['between', /^с\s+(.+?)\s+(?:по|до)\s+(.+)$/iu],
  ['between', /^בין\s+(.+?)\s+(?:לבין\s+|ל[-־]?\s*|ו[-־]?\s*)(.+)$/u],
  ['between', /^מ[-־]?\s*(.+?)\s+עד\s+(.+)$/u],
  ['between', /^(.+?)\s*[–—]\s*(.+)$/],
  // A plain hyphen only between two years, so that a date written with hyphens is not split
  ['between', /^(\d{3,4})\s*-\s*(\d{3,4})$/],
];

/* Turn what a person typed into a fuzzy date, whichever of the tree's languages they typed it in. Empty input is null. */
export function parseDate(input: string | null | undefined): FuzzyDate | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  for (const [kind, pattern] of PREFIXES) {
    const m = raw.match(pattern);
    const from = m && parsePoint(m[1]);
    if (from) return { kind, from };
  }
  for (const [kind, pattern] of RANGES) {
    const m = raw.match(pattern);
    const from = m && parsePoint(m[1]), to = m && parsePoint(m[2]);
    if (from && to) return { kind, from, to };
  }
  const from = parsePoint(raw);
  return from ? { kind: 'exact', from } : { kind: 'text', text: raw };
}

/* Say a fuzzy date the way a person would, in their language. */
export function formatDate(date: FuzzyDate | null | undefined, lang: Lang = 'en'): string {
  if (!date) return '';
  if (date.kind === 'text') return date.text ?? '';
  const from = (after: 'nothing' | 'of' | 'between' = 'nothing') => formatPoint(date.from, lang, after);
  const to = (after: 'nothing' | 'of' | 'between' = 'nothing') => ('to' in date ? formatPoint(date.to, lang, after) : '');
  if (lang === 'he') {
    switch (date.kind) {
      // "בערך במרץ 1921", the way it is said: in March. A year or a day needs no ב.
      case 'about': return `בערך ${/^\d/.test(from()) ? '' : 'ב'}${from()}`;
      case 'before': return `לפני ${from()}`;
      case 'after': return `אחרי ${from()}`;
      // "בין 1921 ל-1922", "בין מרץ 1921 למאי 1922": ל is written onto a word, and takes a hyphen before a number
      case 'between': return `בין ${from()} ${/^\d/.test(to()) ? 'ל-' : 'ל'}${to()}`;
      case 'or': return `${from()} או ${to()}`;
      default: return from();
    }
  }
  if (lang === 'ru') {
    switch (date.kind) {
      case 'about': return `около ${from('of')}`;
      case 'before': return `до ${from('of')}`;
      case 'after': return `после ${from('of')}`;
      case 'between': return `между ${from('between')} и ${to('between')}`;
      case 'or': return `${from()} или ${to()}`;
      default: return from();
    }
  }
  switch (date.kind) {
    case 'about': return `about ${from()}`;
    case 'before': return `before ${from()}`;
    case 'after': return `after ${from()}`;
    case 'between': return `between ${from()} and ${to()}`;
    case 'or': return `${from()} or ${to()}`;
    default: return from();
  }
}

export function yearOf(date: FuzzyDate | null | undefined): number | null {
  return date && 'from' in date && date.from ? Number(date.from.slice(0, 4)) : null;
}

/* An integer that sorts dates: the earliest day the date could mean. */
export function sortKey(date: FuzzyDate | null | undefined): number | null {
  if (!date || !('from' in date) || !date.from) return null;
  const [y, m = 1, d = 1] = date.from.split('-').map(Number);
  return y * 10000 + m * 100 + d;
}

/* The date may have come from anywhere, so nothing about its shape is taken for granted. */
export function isValidDate(date: unknown): boolean {
  if (date === null) return true;
  if (typeof date !== 'object') return false;
  const { kind, from, to, text }: { kind?: unknown; from?: unknown; to?: unknown; text?: unknown } = date;
  if (kind === 'text') return typeof text === 'string' && text.length > 0;
  const pointOk = (p: unknown) => typeof p === 'string' && parsePoint(p) === p;
  if (kind === 'exact' || kind === 'about' || kind === 'before' || kind === 'after') return pointOk(from);
  if (kind === 'between' || kind === 'or') return pointOk(from) && pointOk(to);
  return false;
}

/* ---------- GEDCOM date phrases ---------- */

function gedPoint(point: string): string {
  const [y, m, d] = point.split('-').map(Number);
  if (!m) return String(y);
  return d ? `${d} ${GED_MONTHS[m - 1]} ${y}` : `${GED_MONTHS[m - 1]} ${y}`;
}

export function toGedcom(date: FuzzyDate | null | undefined): string {
  if (!date) return '';
  switch (date.kind) {
    case 'exact': return gedPoint(date.from);
    case 'about': return `ABT ${gedPoint(date.from)}`;
    case 'before': return `BEF ${gedPoint(date.from)}`;
    case 'after': return `AFT ${gedPoint(date.from)}`;
    case 'between':
    case 'or': return `BET ${gedPoint(date.from)} AND ${gedPoint(date.to)}`;
    default: return `(${date.text})`;
  }
}

export function fromGedcom(text: string | null | undefined): FuzzyDate | null {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const phrase = raw.match(/^\((.*)\)$/);
  if (phrase) return { kind: 'text', text: phrase[1] };
  const words = raw
    .replace(/^(ABT|CAL|EST)\b/i, 'about')
    .replace(/^BEF\b/i, 'before')
    .replace(/^AFT\b/i, 'after')
    .replace(/^BET\b/i, 'between')
    .replace(/\bAND\b/i, 'and');
  return parseDate(words);
}
