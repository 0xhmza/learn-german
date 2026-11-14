import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContent } from '../scripts/validate-content.js';
import { raw, context } from './support/context.js';
import ar from '../src/js/i18n/ar.js';
import de from '../src/js/i18n/de.js';

// The learning route of docs/grammar-platform-plan.md §3.2.
const ROUTE = {
  'nomen-kasus': ['genitiv', 'genitiv-praep', 'lokale-praep', 'n-deklination', 'diminutiv', 'verben-als-nomen', 'nominalisierte-adjektive'],
  'adjektive': ['komparativ', 'superlativ', 'genitiv-adjektiv', 'partizip1', 'partizip-adjektiv', 'gradpartikeln'],
  'pronomen': ['irgendein', 'indefinitpronomen', 'irgend-pronomen', 'pronominaladverbien'],
  'relativsaetze': ['relativ-dativ', 'relativ-praep', 'relativ-einschub', 'relativ-genitiv', 'relativ-ort', 'relativ-was'],
  'infinitiv-verben': ['infinitiv-zu', 'statt-zu', 'ohne-zu', 'brauchen', 'lassen'],
  'passiv': ['passiv-perfekt', 'passiv-modal', 'subjektlos', 'erststellen-es'],
  'zeiten': ['plusquamperfekt', 'nachdem', 'bevor-bis', 'seit-waehrend', 'futur1'],
  'grund-folge': ['kausal-da-weil', 'deshalb-daher', 'sodass', 'indem'],
  'gegensatz-vergleich': ['obwohl', 'trotzdem', 'waehrend-adversativ', 'je-desto', 'doppelkonjunktionen'],
  'konjunktiv-bedingung': ['falls', 'sonst', 'irreale-bedingung', 'konjunktiv2-vergangenheit', 'konjunktiv2-vergangenheit-modal']
};

test('the content passes every structural check', () => {
  assert.deepEqual(validateContent(raw), []);
});

test('ten islands hold exactly the planned 51 lessons in order', () => {
  const ctx = context();
  assert.deepEqual(ctx.islands.map(island => island.id), Object.keys(ROUTE));
  for (const [island, ids] of Object.entries(ROUTE)) {
    assert.deepEqual(ctx.islandLessons(island).map(lesson => lesson.id), ids, island);
  }
  assert.equal(ctx.lessons.size, 51);
  const levels = [...ctx.lessons.values()].reduce((count, lesson) => ({ ...count, [lesson.level]: (count[lesson.level] || 0) + 1 }), {});
  assert.deepEqual(levels, { 'B1.1': 28, 'B1.2': 23 });
});

test('the original B1.1 course is carried over unchanged in size', () => {
  const ctx = context();
  const b11 = [...ctx.lessons.values()].filter(lesson => lesson.level === 'B1.1');
  const types = {};
  for (const q of b11.flatMap(lesson => lesson.questions)) types[q.type] = (types[q.type] || 0) + 1;
  assert.equal(b11.flatMap(lesson => lesson.questions).length, 253);
  assert.deepEqual(types, { cloze: 89, mcq: 58, order: 22, text: 84 });
});

test('every B1.2 lesson follows the nine-question template', () => {
  const ctx = context();
  for (const lesson of [...ctx.lessons.values()].filter(l => l.level === 'B1.2')) {
    assert.equal(lesson.questions.length, 9, lesson.id);
    assert.deepEqual(lesson.questions.map(q => q.difficulty), [1, 1, 1, 2, 2, 2, 3, 3, 2], lesson.id);
    assert.equal(lesson.questions[7].type, 'text', `${lesson.id}: question 8 corrects the pitfall`);
    assert.equal(lesson.questions[7].context, lesson.pitfallPair.split(' → ')[0], `${lesson.id}: question 8 uses the pitfall sentence`);
    assert.ok(lesson.source.lektion >= 7 && lesson.source.lektion <= 12);
  }
});

test('Arabic and German interface strings have the same keys and arguments', () => {
  assert.deepEqual(Object.keys(ar).sort(), Object.keys(de).sort());
  for (const key of Object.keys(ar)) {
    assert.equal(typeof ar[key], typeof de[key], key);
    if (typeof ar[key] === 'function') assert.equal(ar[key].length, de[key].length, `${key} arity`);
    if (Array.isArray(ar[key])) assert.equal(ar[key].length, de[key].length, key);
    if (ar[key] && typeof ar[key] === 'object' && !Array.isArray(ar[key])) assert.deepEqual(Object.keys(ar[key]).sort(), Object.keys(de[key]).sort(), key);
  }
});
