import test from 'node:test';
import assert from 'node:assert/strict';
import { context, freshState } from './support/context.js';
import { setLang } from '../src/js/i18n/index.js';
import { parse } from '../src/js/router.js';
import { writing } from '../src/js/views/sections.js';
import { writingCounts } from '../src/js/components/writing-meter.js';
import { skillResults } from '../src/js/components/skills-radar.js';
import { exportBackup, importBackup } from '../src/js/engine/migrate.js';
import { courseProgress, criteria, newWritingAttempt, nextReadinessTask, normalizeWritingReview,
  readinessProgress, submitWriting, writingDeadline, writingScore } from '../src/js/engine/writing.js';

const day = '2026-11-23';
const start = Date.UTC(2026, 10, 23, 12);
const rubric = (grade = 'A') => normalizeWritingReview({
  grades: Object.fromEntries(criteria.map(key => [key, grade])),
  reasons: Object.fromEntries(criteria.map(key => [key, 'Beispiel aus der Antwort'])),
  tags: ['coverage']
});

test('a guided draft, self-check and separate revision survive a backup round trip', () => {
  const ctx = context();
  const state = freshState(ctx, day);
  const course = ctx.writingCourse;
  const task = ctx.writingExercises.get('besuch-planen');
  const attempt = state.writingCourse[task.id] = newWritingAttempt(task);
  attempt.answers[0] = 'Liebe Lea, das passt!';
  attempt.plan[0] = 'Besuch bestätigen';
  assert.equal(submitWriting(task, attempt, start, day), true);
  attempt.evidence['0-0'] = [11, 20];
  attempt.checks = ['task'];
  attempt.revision = ['Liebe Lea, das Wochenende passt!'];
  const restored = importBackup(exportBackup(state, ctx), ctx, day);
  assert.equal(restored.writingCourse[task.id].answers[0], attempt.answers[0]);
  assert.deepEqual(restored.writingCourse[task.id].revision, attempt.revision);
  assert.deepEqual(restored.writingCourse[task.id].evidence, attempt.evidence);
  assert.equal(restored.writingCourse[task.id].plan[0], 'Besuch bestätigen');
  assert.equal(courseProgress(course, restored).done, 0);
  attempt.revealed = true;
  attempt.done = true;
  assert.equal(courseProgress(course, state).done, 1);
});

test('a timed attempt fixes the submission at the saved deadline', () => {
  const ctx = context();
  const task = ctx.writingCourse.readiness[0];
  const attempt = newWritingAttempt(task, start);
  const deadline = writingDeadline(task, attempt);
  assert.equal(submitWriting(task, attempt, deadline - 1, day), false);
  assert.equal(submitWriting(task, attempt, deadline + 60000, day), true);
  assert.equal(attempt.submitted, deadline);
  assert.equal(submitWriting(task, attempt, deadline + 120000, day), false);
});

test('reserve tasks stay hidden until assigned and cannot be assigned twice', () => {
  setLang('de');
  const ctx = context();
  const state = freshState(ctx, day);
  const task = ctx.writingCourse.readiness[0];
  const route = parse(`#schreiben/${task.id}`, ctx);
  assert.equal(route.task, true);
  let html = writing.render({ ctx, state }, route);
  assert.doesNotMatch(html, /Spielenachmittag|Musterlösung/);
  assert.equal(nextReadinessTask(ctx.writingCourse, state).id, task.id);
  const attempt = state.writingCourse[task.id] = newWritingAttempt(task, start);
  assert.equal(nextReadinessTask(ctx.writingCourse, state).id, task.id);
  html = writing.render({ ctx, state }, route);
  assert.match(html, /Spielenachmittag/);
  assert.doesNotMatch(html, /Musterlösung/);
  attempt.answers[0] = 'Hallo Milan, ich komme gern mit!';
  submitWriting(task, attempt, start + 9000, day);
  html = writing.render({ ctx, state }, route);
  assert.match(html, /Musterlösung zeigen/);
  assert.doesNotMatch(html, /writing-manuscript|kurzes Kartenspiel/);
  assert.notEqual(nextReadinessTask(ctx.writingCourse, state).id, task.id);
});

test('the 45-point milestone needs separate days and a second assessment', () => {
  const ctx = context();
  const course = ctx.writingCourse;
  const state = freshState(ctx, day);
  const [one, two, three] = course.readiness;
  for (const [i, task] of [one, two, three].entries()) {
    const time = start + 86400000 * i;
    const attempt = state.writingCourse[task.id] = newWritingAttempt(task, time);
    attempt.answers[0] = 'Eine geschriebene Antwort.';
    submitWriting(task, attempt, time + 9000, `2026-11-${23 + i}`);
    attempt.review = rubric();
  }
  assert.equal(writingScore(rubric('B')), 27);
  assert.equal(readinessProgress(course, state).achieved, false);
  state.writingCourse[two.id].secondReview = rubric();
  assert.equal(readinessProgress(course, state).achieved, true);
  state.writingCourse[three.id].day = state.writingCourse[two.id].day;
  assert.equal(readinessProgress(course, state).achieved, false);
});

test('counters handle German compounds and line breaks, and ungraded skills stay unmeasured', () => {
  assert.deepEqual(writingCounts('E-Mail und Grüße\r\n\r\nBis morgen!'), { words: 5, lines: 3 });
  assert.deepEqual(writingCounts(''), { words: 0, lines: 0 });
  const ctx = context();
  const state = freshState(ctx, day);
  assert.deepEqual(skillResults(ctx, state).map(axis => axis.value), [null, null, null, null]);
  state.listeningSample = { correct: 0, total: 3 };
  const task = ctx.writingCourse.readiness[0];
  state.writingCourse[task.id] = { review: rubric('B') };
  assert.deepEqual(skillResults(ctx, state).map(axis => axis.value), [null, null, 60, 0]);
});
