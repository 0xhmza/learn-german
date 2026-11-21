import test from 'node:test';
import assert from 'node:assert/strict';
import { context, freshState } from './support/context.js';
import { normalizeState } from '../src/js/engine/migrate.js';
import { award } from '../src/js/engine/gamification.js';
import { dailyReview, resumableRun } from '../src/js/engine/study.js';
import { newRun } from '../src/js/engine/runs.js';
import { render as renderQuiz } from '../src/js/views/quiz.js';
import { setLang } from '../src/js/i18n/index.js';

const start = '2026-11-18';
const delayed = '2026-11-25';

test('daily review combines due questions, due cards and delayed transfer within the chosen level', () => {
  const ctx = context();
  const state = freshState(ctx, start);
  assert.deepEqual(dailyReview(ctx, state, start).ids, []);
  award(ctx, state, { kind: 'lessonLearned', lesson: 'nachdem' }, start);
  assert.equal(dailyReview(ctx, state, start).fresh, 3);
  const answer = id => award(ctx, state, { kind: 'answer', q: ctx.questions.get(id), correct: true }, start);
  answer('nachdem-1');
  answer('card-nachdem-reihenfolge');
  assert.equal(state.transfer.nachdem.due, delayed);
  assert.equal(state.results['card-nachdem-reihenfolge'], undefined);
  assert.equal(dailyReview(ctx, state, '2026-11-24').transfers, 0);
  assert.deepEqual(newRun(ctx, state, 'daily', { day: delayed }).ids, [
    'transfer-nachdem', 'nachdem-1', 'card-nachdem-reihenfolge', 'card-nachdem-vergangenheit', 'card-nachdem-gegenwart'
  ]);
  const wrongLevel = ctx.lessons.get('nachdem').level === 'B1.1' ? 'B1.2' : 'B1.1';
  assert.deepEqual(dailyReview(ctx, state, delayed, wrongLevel).ids, []);
  award(ctx, state, { kind: 'answer', q: ctx.questions.get('transfer-nachdem'), correct: true }, delayed);
  const restored = normalizeState(JSON.parse(JSON.stringify(state)), ctx, delayed);
  assert.deepEqual(restored.transfer.nachdem, { last: delayed, correct: true, hinted: false });
  assert.equal(restored.viewed.nachdem, start);
  assert.equal(dailyReview(ctx, restored, delayed).transfers, 0);
});

test('every topic has its own recall cards and daily review reveals them without an answer field', () => {
  setLang('de');
  const ctx = context();
  const state = freshState(ctx, start);
  assert.equal(ctx.decks.size, ctx.lessons.size);
  for (const [id, deck] of ctx.decks) {
    assert.ok(deck.length >= 3);
    const lesson = ctx.lessons.get(id);
    for (const card of deck) {
      const q = ctx.questions.get(`card-${card.id}`);
      assert.equal(q.type, 'text');
      for (const lang of ['de', 'ar']) {
        assert.notEqual(q.i18n[lang].prompt, lesson.i18n[lang].recall[0]);
        assert.notEqual(q.i18n[lang].prompt, ctx.lessonStudy.get(id).task[lang]);
        for (const practice of lesson.questions) assert.notEqual(q.i18n[lang].prompt, practice.i18n[lang].prompt);
      }
    }
  }
  award(ctx, state, { kind: 'lessonLearned', lesson: 'genitiv' }, start);
  const run = newRun(ctx, state, 'daily', { day: start });
  state.runs.daily = run;
  const app = { ctx, state, day: () => start };
  const front = renderQuiz(app, { key: run.key });
  assert.match(front, /Antwort zeigen/);
  assert.doesNotMatch(front, /Wessen\?|<textarea|type="radio"/);
  run.grades[run.ids[0]] = 'shown';
  const back = renderQuiz(app, { key: run.key });
  assert.match(back, /Wessen\?/);
  assert.match(back, /Habe ich gewusst/);
});

test('short practice can be resumed when the most recent timed test expired', () => {
  const ctx = context();
  const state = freshState(ctx, start);
  const quick = newRun(ctx, state, 'quick-nachdem', { day: start });
  assert.deepEqual(quick.ids, ['nachdem-1', 'nachdem-2']);
  state.runs[quick.key] = quick;
  state.runs.test = newRun(ctx, state, 'test', { day: start, now: 0 });
  state.lastRun = 'test';
  assert.equal(resumableRun(state, 60 * 60 * 1000), quick);
});

test('finished short practice offers repair for the lesson and explains delayed review', () => {
  const ctx = context();
  const state = freshState(ctx, start);
  const run = newRun(ctx, state, 'quick-nachdem', { day: start });
  const q = ctx.questions.get(run.ids[0]);
  award(ctx, state, { kind: 'answer', q, correct: false }, start);
  run.grades[q.id] = false;
  run.finished = true;
  state.runs[run.key] = run;
  const html = renderQuiz({ ctx, state, day: () => start }, { key: run.key });
  assert.match(html, /data-key="repair-nachdem"/);
  assert.match(html, /data-key="nachdem"/);
  assert.match(html, /25/);
});
