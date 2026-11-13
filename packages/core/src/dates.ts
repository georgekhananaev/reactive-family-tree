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

import type { FuzzyDate } from './types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const GED_MONTHS = MONTHS.map((m) => m.slice(0, 3).toUpperCase());

function monthNumber(word: string): number | null {
  const key = word.slice(0, 3).toLowerCase();
  const index = MONTHS.findIndex((m) => m.slice(0, 3).toLowerCase() === key);
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

/* One point in time: "1921", "March 1921", "4 March 1921", "March 4 1921", "1921-03-04". */
function parsePoint(text: string): string | null {
  const t = text.trim().replace(/[,.]/g, ' ').replace(/\s+/g, ' ');
  let m: RegExpMatchArray | null;
  let parts: [year: number, month: number | null, day: number] | null = null;
  if ((m = t.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/))) parts = [+m[1], m[2] ? +m[2] : 0, m[3] ? +m[3] : 0];
  else if ((m = t.match(/^(\d{1,2}) ([a-z]{3,}) (\d{4})$/i))) parts = [+m[3], monthNumber(m[2]), +m[1]];
  else if ((m = t.match(/^([a-z]{3,}) (\d{1,2}) (\d{4})$/i))) parts = [+m[3], monthNumber(m[1]), +m[2]];
  else if ((m = t.match(/^([a-z]{3,}) (\d{4})$/i))) parts = [+m[2], monthNumber(m[1]), 0];
  if (!parts) return null;
  const [year, month, day] = parts;
  if (month === null || !validParts(year, month, day)) return null;
  return iso(year, month, day);
}

function formatPoint(point: string): string {
  const [y, m, d] = point.split('-').map(Number);
  if (!m) return String(y);
  return d ? `${d} ${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ${y}`;
}

const PREFIXES: [kind: 'about' | 'before' | 'after', pattern: RegExp][] = [
  ['about', /^(?:about|abt|around|circa|ca|c)\.?\s+(.+)$/i],
  ['before', /^(?:before|bef)\.?\s+(.+)$/i],
  ['after', /^(?:after|aft)\.?\s+(.+)$/i],
];

/* Turn what a person typed into a fuzzy date. Empty input is null. */
export function parseDate(input: string | null | undefined): FuzzyDate | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  for (const [kind, pattern] of PREFIXES) {
    const m = raw.match(pattern);
    const from = m && parsePoint(m[1]);
    if (from) return { kind, from };
  }
  const range = raw.match(/^(?:between\s+)?(.+?)\s+(and|or|to)\s+(.+)$/i) || raw.match(/^(.+?)\s*([–—])\s*(.+)$/);
  if (range) {
    const from = parsePoint(range[1]);
    const to = parsePoint(range[3]);
    if (from && to) return { kind: range[2].toLowerCase() === 'or' ? 'or' : 'between', from, to };
  }
  const from = parsePoint(raw);
  return from ? { kind: 'exact', from } : { kind: 'text', text: raw };
}

/* Say a fuzzy date the way a person would. */
export function formatDate(date: FuzzyDate | null | undefined): string {
  if (!date) return '';
  switch (date.kind) {
    case 'exact': return formatPoint(date.from);
    case 'about': return `about ${formatPoint(date.from)}`;
    case 'before': return `before ${formatPoint(date.from)}`;
    case 'after': return `after ${formatPoint(date.from)}`;
    case 'between': return `between ${formatPoint(date.from)} and ${formatPoint(date.to)}`;
    case 'or': return `${formatPoint(date.from)} or ${formatPoint(date.to)}`;
    default: return date.text ?? '';
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
