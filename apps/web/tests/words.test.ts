/*
 * Nothing a person can read may be left in English by accident, in any of
 * the three languages. These tests read the phrase books and the page's own
 * code, and fail when a sentence has lost one of its gaps, counts the wrong
 * way for its language, was left untranslated, or is shown without going
 * through the translator at all.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { expect, test } from 'vitest';

import { he as rulesHe } from '../../../packages/core/src/words/he';
import { ru as rulesRu } from '../../../packages/core/src/words/ru';
import { PROMPTS } from '../../../packages/mcp/src/guide';
import { MELODIES, QUICK_TUNES } from '../../../packages/react/src/music';
import { he as serverHe } from '../../../packages/server/src/words/he';
import { ru as serverRu } from '../../../packages/server/src/words/ru';
import { he } from '../lib/i18n/he';
import { ru } from '../lib/i18n/ru';

type Book = Readonly<Record<string, string>>;
const BOOKS: readonly (readonly [name: string, lang: 'he' | 'ru', book: Book])[] = [
  ['the page, in Hebrew', 'he', he], ['the page, in Russian', 'ru', ru],
  ['the server, in Hebrew', 'he', serverHe], ['the server, in Russian', 'ru', serverRu],
  ['the rules, in Hebrew', 'he', rulesHe], ['the rules, in Russian', 'ru', rulesRu],
];
const LETTERS = { he: /[\u0590-\u05FF]/, ru: /[\u0400-\u04FF]/ } as const;
/* What the page passes to a sentence beyond what English needs, for languages that do need it. */
const EXTRA_GAPS = new Set(['sex', 'partner', 'them', 'n']);
/* Sentences that read the same in every language: an address made up as an example. */
const SAME_EVERYWHERE = new Set(['their@email.example']);

/* The gaps of a sentence: their names, and for each choice how many forms it offers. */
function gapsOf(sentence: string, found = { names: new Set<string>(), counted: [] as number[], chosen: [] as number[], broken: false }) {
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
    if (depth) { found.broken = true; break; }
    const gap = sentence.slice(open + 1, close - 1), mark = gap.search(/[#?]/);
    found.names.add(mark < 0 ? gap : gap.slice(0, mark));
    if (mark >= 0) {
      const forms: string[] = [];
      let inner = 0, from = mark + 1;
      for (let i = mark + 1; i < gap.length; i++) {
        if (gap[i] === '{') inner++;
        else if (gap[i] === '}') inner--;
        else if (gap[i] === '|' && inner === 0) { forms.push(gap.slice(from, i)); from = i + 1; }
      }
      forms.push(gap.slice(from));
      (gap[mark] === '#' ? found.counted : found.chosen).push(forms.length);
      for (const form of forms) gapsOf(form, found);
    }
    at = close;
  }
  return found;
}

test('every sentence keeps its gaps, and counts the way its language counts', () => {
  const wrong: string[] = [];
  for (const [name, lang, book] of BOOKS) {
    for (const [english, said] of Object.entries(book)) {
      const asked = gapsOf(english), given = gapsOf(said);
      const say = (what: string) => wrong.push(`${name}: ${what}: ${english}`);
      if (given.broken) say('a gap is left open');
      for (const gap of asked.names) if (!given.names.has(gap)) say(`the gap {${gap}} is gone`);
      // A translation may add a choice by the person's sex, their partner's, or how many there are, which the page passes along though English has no use for them
      for (const gap of given.names) if (!asked.names.has(gap) && !EXTRA_GAPS.has(gap)) say(`the gap {${gap}} is not in the English`);
      // One, a few and many in Russian. One, two and many in Hebrew. Two forms where the last two read the same.
      if (given.counted.some((forms) => forms < 2 || forms > 3)) say('a count has the wrong number of forms');
      if (given.chosen.some((forms) => forms < 2 || forms > 3)) say('a choice by sex has the wrong number of forms');
      // Words are written in the language's own letters. A sentence that is all gaps and marks has none to write.
      const words = said.replace(/\{[^{}#?|]*\}/g, '');
      if (/[A-Za-z]{2,}/.test(words) && !LETTERS[lang].test(words) && !SAME_EVERYWHERE.has(english)) say('left in English');
    }
  }
  expect(wrong).toEqual([]);
});

test('the melodies and the ready-made prompts are in every language', () => {
  const missing = [...MELODIES, ...QUICK_TUNES].flatMap((one) => [one.name, one.about]).filter((english) => !(english in he));
  expect(missing, 'a melody is named on the page through the book, by its English name').toEqual([]);
  for (const prompt of PROMPTS) {
    for (const lang of ['he', 'ru'] as const) {
      expect(LETTERS[lang].test(prompt.description[lang]) && LETTERS[lang].test(prompt.text[lang]), `${prompt.name} in ${lang}`).toBe(true);
    }
  }
});

/*
 * The page's own code. Text between tags, a label or a hint written straight
 * into the page, and any sentence in the code that is neither given to the
 * translator there and then nor one of the book's own sentences on its way to
 * it: each is something a reader would meet in English.
 */
const WEB = fileURLToPath(new URL('..', import.meta.url));
const SEEN = new Set(['aria-label', 'title', 'placeholder', 'alt', 'label', 'aria-description', 'aria-roledescription']);
const TRANSLATORS = new Set(['t', 'tx', 'say', 'translate']);
/* What may stand as it is: names of products, an address made up as an example, and words that are for a programmer or a machine. */
const AS_IT_IS = new Set([
  'Reactive Family Tree', 'George Khananaev', 'Claude Code', 'you@example.com', 'Person', 'Not found', 'Enter',
  'useApp() was called outside the app.', 'useT() needs a LanguageProvider around it.', 'The family tree could not start.',
]);

function sourcesOf(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (['node_modules', '.next', 'i18n', 'tests', 'data'].includes(name)) continue;
    if (statSync(path).isDirectory()) sourcesOf(path, found);
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) found.push(path);
  }
  return found;
}

test('no text on the page skips the translator', () => {
  const loose: string[] = [];
  let casts = 0;
  for (const file of ['app', 'components', 'lib'].flatMap((dir) => sourcesOf(join(WEB, dir)))) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const note = (node: ts.Node, text: string) => loose.push(`${relative(WEB, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}  ${text.replace(/\s+/g, ' ').trim().slice(0, 90)}`);
    const translated = (node: ts.Node): boolean => {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (!ts.isCallExpression(parent)) continue;
        const called = parent.expression, name = ts.isIdentifier(called) ? called.text : ts.isPropertyAccessExpression(called) ? called.name.text : '';
        if (TRANSLATORS.has(name) || /^console\./.test(called.getText())) return true;
      }
      return false;
    };
    const worded = (text: string) => /\p{L}{3,}/u.test(text.replace(/&[a-z]+;/g, ''));
    const visit = (node: ts.Node): void => {
      if (ts.isAsExpression(node) && node.type.getText() === 'WebPhrase') casts++;
      if (ts.isJsxText(node)) {
        if (worded(node.text) && !AS_IT_IS.has(node.text.trim())) note(node, node.text);
      } else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
        if (SEEN.has(node.name.getText()) && worded(node.initializer.text) && !AS_IT_IS.has(node.initializer.text)) note(node, node.initializer.text);
      } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !ts.isJsxAttribute(node.parent)) {
        const { parent } = node, { text } = node;
        // Where the code asks which key was pressed, or which of a few kinds something is, the word is not shown to anyone
        const compared = (ts.isBinaryExpression(parent) && /^[!=]==?$/.test(parent.operatorToken.getText())) || ts.isCaseClause(parent);
        const notWords = ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isLiteralTypeNode(parent) || ts.isExpressionStatement(parent)
          || (ts.isPropertyAssignment(parent) && parent.name === node) || ts.isElementAccessExpression(parent) || compared;
        // A sentence or a label: words with a space between them, or one word that starts with a capital
        const prose = /\p{L}{2,}[ ,.]+\p{L}{2,}/u.test(text) || /^[A-Z][a-z]{3,}$/.test(text);
        const code = /^[\p{Ll}\d_./:#\-[\]=,@ ()>+~*"'%!?&;|{}$\\^]+$/u.test(text) && !/[.!?]$/.test(text);
        if (!notWords && prose && !code && !translated(node) && !(text in he) && !AS_IT_IS.has(text)) note(node, text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(loose).toEqual([]);
  // The one place a sentence reaches the translator by a name the page cannot check: a melody's. The test above checks those.
  expect(casts, 'a sentence may be given to the translator only as one of the book\u2019s own').toBe(1);
});
