// Answer checking, unchanged from the original B1.1 course.

export function normalize(value) {
  return String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('de').replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
}

export function isCorrect(q, input) {
  if (q.type === 'mcq') return input === q.answer;
  if (q.type === 'cloze') return q.blanks.every((variants, i) => variants.some(answer => normalize(answer) === normalize(input?.[i])));
  if (q.type === 'order') return input?.length === q.items.length && input.every((piece, i) => piece === i);
  return false;
}

export function blankCorrect(q, input, i) {
  return q.blanks[i].some(answer => normalize(answer) === normalize(input?.[i]));
}

export function answered(q, input) {
  if (q.type === 'mcq') return Number.isInteger(input);
  if (q.type === 'order') return input?.length === q.items.length;
  if (q.type === 'cloze') return q.blanks.every((_, i) => String(input?.[i] || '').trim());
  return !!String(input || '').trim();
}

// The model solution shown after an answer; expects a localized question.
export function model(q) {
  if (q.type === 'mcq') return q.options[q.answer];
  if (q.type === 'cloze') return q.text.replace(/\{\{(\d+)\}\}/g, (_, i) => q.blanks[Number(i) - 1][0]);
  if (q.type === 'order') return q.items.join(' ');
  return q.answer;
}
