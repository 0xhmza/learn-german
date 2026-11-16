// A word can carry a passage-specific Arabic gloss in braces. Common words
// can reuse the glossary. Keep punctuation and spacing in the original text.
export function readingWords(text, glossary) {
  const pieces = [];
  let offset = 0;
  for (const match of text.matchAll(/(\p{L}+(?:[-’']\p{L}+)*)(?:\{([^{}]+)\})?/gu)) {
    if (match.index > offset) pieces.push({ text: text.slice(offset, match.index) });
    const [, word, meaning] = match;
    pieces.push({ text: word, gloss: meaning ?? glossary.get(word.toLocaleLowerCase('de')) ?? '' });
    offset = match.index + match[0].length;
  }
  if (offset < text.length) pieces.push({ text: text.slice(offset) });
  return pieces;
}
