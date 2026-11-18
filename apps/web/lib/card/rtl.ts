/*
 * Hebrew on a shared-link picture. The library that draws the picture lays
 * every line out left to right, so a Hebrew name would come out backwards.
 * Here a right-to-left text is cut into its words, each already turned the
 * way the eye meets it. The picture then sets the words from the right.
 */

const RTL_LETTER = /[\p{Script=Hebrew}\p{Script=Arabic}]/u;
// A number or a word in Latin or Cyrillic letters keeps its own order inside a Hebrew line, joined pieces and all ("1898–1971")
const LTR_RUN = /([\p{N}\p{Script=Latin}\p{Script=Cyrillic}]+(?:[.,:/'’–-][\p{N}\p{Script=Latin}\p{Script=Cyrillic}]+)*)/u;
const LTR_LETTER = /[\p{Script=Latin}\p{Script=Cyrillic}]/u;
const MIRRORED: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«' };

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/* Whether a text reads right to left: its first letter is Hebrew or Arabic. */
export const readsRtl = (text: string): boolean => RTL_LETTER.test(/\p{L}/u.exec(text)?.[0] ?? '');

/* One Hebrew word as it is seen: its letters from right to left, a number or Latin word inside it left as it is. */
function turned(word: string): string {
  return word
    .split(LTR_RUN)
    .reverse()
    .map((piece, at, pieces) => (LTR_RUN.test(piece) && pieces.length > 1 ? piece : [...graphemes.segment(piece)].map(({ segment }) => MIRRORED[segment] ?? segment).reverse().join('')))
    .join('');
}

/*
 * The words of a right-to-left text in reading order, each drawn as it is seen. Words in Latin or Cyrillic letters
 * that follow one another stay together as one piece ("New York"), so they are not swapped.
 */
export function rtlWords(text: string): string[] {
  const words: string[] = [];
  let run: string[] = [];
  const close = () => {
    // Anything after the run's last Latin word (a dash, a number) is read in the Hebrew order again
    const last = run.findLastIndex((word) => LTR_LETTER.test(word));
    if (last >= 0) words.push(run.slice(0, last + 1).join(' '));
    words.push(...run.slice(last + 1).map(turned));
    run = [];
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (RTL_LETTER.test(word)) {
      close();
      words.push(turned(word));
    } else if (run.length || LTR_LETTER.test(word)) {
      run.push(word);
    } else {
      words.push(turned(word));
    }
  }
  close();
  return words;
}
