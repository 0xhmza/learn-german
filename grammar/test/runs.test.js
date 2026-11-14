import test from 'node:test';
import assert from 'node:assert/strict';
import { newRun, parseRunKey, examQuestions, examSize, passMark, mixedQuestions, permutation, runScore } from '../src/js/engine/runs.js';
import { context, freshState, seeded } from './support/context.js';

const day = '2026-11-14';

test('run keys are recognised', () => {
  const ctx = context();
  const lesson = ctx.route[0];
  assert.deepEqual(parseRunKey(ctx, lesson.id), { kind: 'lesson', id: lesson.id });
  assert.deepEqual(parseRunKey(ctx, 'island-passiv'), { kind: 'island', id: 'passiv' });
  assert.deepEqual(parseRunKey(ctx, 'exam-zeiten'), { kind: 'exam', id: 'zeiten' });
  assert.deepEqual(parseRunKey(ctx, 'review'), { kind: 'review', id: null });
  assert.equal(parseRunKey(ctx, 'unit-3'), null);
  assert.equal(parseRunKey(ctx, 'exam-atlantis'), null);
});

test('a lesson run keeps the original question order', () => {
  const ctx = context();
  const state = freshState(ctx);
  const lesson = ctx.lessons.get('passiv-perfekt');
  const run = newRun(ctx, state, 'passiv-perfekt', { day, rng: seeded(1) });
  assert.deepEqual(run.ids, lesson.questions.map(q => q.id));
  assert.equal(run.mode, 'practice');
  assert.equal(run.deadline, null);
});

test('exam size, pass mark and composition', () => {
  assert.equal(examSize(2), 8);
  assert.equal(examSize(5), 10);
  assert.equal(examSize(7), 12);
  assert.equal(passMark(8), 7);
  assert.equal(passMark(10), 8);
  assert.equal(passMark(12), 10);
  const ctx = context();
  for (const island of ctx.islands) {
    const lessons = ctx.islandLessons(island.id);
    if (!lessons.length) continue;
    const ids = examQuestions(ctx, island.id, seeded(7));
    assert.equal(new Set(ids).size, ids.length, 'no duplicates');
    assert.equal(ids.length, Math.min(examSize(lessons.length), lessons.reduce((n, lesson) => n + lesson.questions.filter(q => q.type !== 'text').length, 0)));
    for (const id of ids) {
      const q = ctx.questions.get(id);
      assert.notEqual(q.type, 'text');
      assert.ok(lessons.some(lesson => lesson.id === q.lesson));
    }
    const used = new Set(ids.map(id => ctx.questions.get(id).lesson));
    assert.equal(used.size, lessons.length, `every lesson of ${island.id} appears`);
  }
});

test('mixed and timed runs draw two questions per island', () => {
  const ctx = context();
  const state = freshState(ctx);
  const islandsWithLessons = ctx.islands.filter(island => ctx.islandLessons(island.id).length).length;
  const mixed = mixedQuestions(ctx, 'all', seeded(3));
  assert.equal(mixed.length, Math.min(20, islandsWithLessons * 2));
  assert.equal(new Set(mixed).size, mixed.length);
  const test = newRun(ctx, state, 'test', { day, rng: seeded(4), now: 1000 });
  assert.equal(test.mode, 'test');
  assert.equal(test.deadline, 1000 + 20 * 60000);
  for (const id of test.ids) {
    const q = ctx.questions.get(id);
    assert.notEqual(q.type, 'text');
    assert.ok([1, 2].includes(q.difficulty));
  }
  const b11 = mixedQuestions(ctx, 'B1.1', seeded(5));
  assert.ok(b11.every(id => ctx.lessons.get(ctx.questions.get(id).lesson).level === 'B1.1'));
});

test('mistake and review runs are empty until there is something to repeat', () => {
  const ctx = context();
  const state = freshState(ctx);
  assert.equal(newRun(ctx, state, 'mistakes', { day }), null);
  assert.equal(newRun(ctx, state, 'review', { day }), null);
  const q = ctx.route[0].questions[0];
  state.results[q.id] = { correct: false, needsReview: true, due: day };
  assert.deepEqual(newRun(ctx, state, 'mistakes', { day }).ids, [q.id]);
  assert.deepEqual(newRun(ctx, state, 'review', { day }).ids, [q.id]);
});

test('order pieces are never shown already solved', () => {
  const run = { order: {} };
  const q = { id: 'x', type: 'order' };
  const always = () => 0.999;
  const result = permutation(run, q, 4, always);
  assert.notDeepEqual(result, [0, 1, 2, 3]);
  assert.equal(permutation(run, q, 4), result, 'stable once chosen');
});

test('scores count graded answers only', () => {
  const run = { ids: ['a', 'b', 'c'], grades: { a: true, b: false } };
  assert.deepEqual(runScore(run), { total: 3, correct: 1, counted: 2 });
});
