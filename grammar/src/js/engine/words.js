// The learner's own word list: German words picked anywhere on the
// platform, saved as the exact string with the day they were added.
export const MAX_WORDS = 3000;
export const MAX_WORD_LENGTH = 60;
const WORD = /^\p{L}[\p{L}\p{M}\p{N}'’-]*$/u;

// Trims punctuation around a picked string. Returns null unless it is one
// German word (letters, with hyphens or apostrophes inside).
export function cleanWord(text) {
  const word = String(text ?? '').normalize('NFC').trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (!word || word.length > MAX_WORD_LENGTH || !WORD.test(word) || /\p{Script=Arabic}/u.test(word)) return null;
  return word;
}

// Adds a word once. Returns the saved form, or null when it is not a word.
export function addWord(state, text, day) {
  const word = cleanWord(text);
  if (!word) return null;
  if (!state.words[word]) {
    state.words[word] = day;
    const keys = Object.keys(state.words);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_WORDS))) delete state.words[old];
  }
  return word;
}

export function removeWord(state, word) {
  delete state.words[word];
}

// Newest first; words of the same day in the order they were added, newest first.
export function wordList(state) {
  return Object.entries(state.words).reverse().sort((a, b) => b[1].localeCompare(a[1]));
}

export function normalizeWords(raw, isDay) {
  const words = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return words;
  for (const [key, day] of Object.entries(raw).slice(-MAX_WORDS)) {
    const word = cleanWord(key);
    if (word === key && isDay(day)) words[word] = day;
  }
  return words;
}
