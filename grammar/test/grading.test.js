import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, isCorrect, answered, model, blankCorrect } from '../src/js/engine/grading.js';

test('normalize ignores case, extra spaces and final punctuation', () => {
  assert.equal(normalize('  Das   Fenster IST repariert worden. '), 'das fenster ist repariert worden');
  assert.equal(normalize('Wer?!'), 'wer');
  assert.equal(normalize('STRASSE'), 'strasse');
  assert.equal(normalize('Größe'), 'größe');
  assert.equal(normalize('Größe'), 'größe');
  assert.equal(normalize(undefined), '');
});

test('cloze accepts every listed variant per blank', () => {
  const q = { type: 'cloze', text: 'A {{1}} B {{2}}', blanks: [['dem', 'dem einen'], ['ist']] };
  assert.equal(isCorrect(q, ['Dem', 'ist']), true);
  assert.equal(isCorrect(q, ['dem einen', 'ist.']), true);
  assert.equal(isCorrect(q, ['den', 'ist']), false);
  assert.equal(blankCorrect(q, ['den', 'ist'], 1), true);
  assert.equal(answered(q, ['dem', '']), false);
  assert.equal(answered(q, ['dem', 'ist']), true);
  assert.equal(model(q), 'A dem B ist');
});

test('order needs the original sequence, mcq the answer index', () => {
  const order = { type: 'order', items: ['weil', 'er', 'kommt'] };
  assert.equal(isCorrect(order, [0, 1, 2]), true);
  assert.equal(isCorrect(order, [1, 0, 2]), false);
  assert.equal(answered(order, [0, 1]), false);
  const mcq = { type: 'mcq', options: ['a', 'b', 'c'], answer: 2 };
  assert.equal(isCorrect(mcq, 2), true);
  assert.equal(isCorrect(mcq, 0), false);
  assert.equal(answered(mcq, undefined), false);
  assert.equal(answered(mcq, 0), true);
  assert.equal(model(mcq), 'c');
});

test('written answers are never auto-graded', () => {
  const q = { type: 'text', answer: 'Das stimmt.' };
  assert.equal(isCorrect(q, 'Das stimmt.'), false);
  assert.equal(answered(q, '  '), false);
  assert.equal(answered(q, 'x'), true);
  assert.equal(model(q), 'Das stimmt.');
});
