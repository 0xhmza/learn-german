import test from 'node:test';
import assert from 'node:assert/strict';
import { context, freshState } from './support/context.js';
import { setLang } from '../src/js/i18n/index.js';
import { parse } from '../src/js/router.js';
import { writing } from '../src/js/views/sections.js';
import { writingCounts } from '../src/js/components/writing-meter.js';
import { skillResults } from '../src/js/components/skills-radar.js';
import { lastReadingResult } from '../src/js/engine/model-exams.js';
import { exportBackup, importBackup } from '../src/js/engine/migrate.js';
import { courseProgress, criteria, expireWritingDrafts, newWritingAttempt, nextReadinessTask, normalizeWritingReview,
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

test('an expired draft becomes a submission without reopening its editor', () => {
  const ctx = context();
  const state = freshState(ctx, day);
  const [task, next] = ctx.writingCourse.readiness;
  const attempt = state.writingCourse[task.id] = newWritingAttempt(task, start);
  attempt.answers[0] = 'Mein gespeicherter Entwurf.';
  const deadline = writingDeadline(task, attempt);
  assert.equal(expireWritingDrafts(ctx.writingExercises, state.writingCourse, deadline - 1), false);
  assert.equal(expireWritingDrafts(ctx.writingExercises, state.writingCourse, deadline + 60000), true);
  assert.equal(attempt.submitted, deadline);
  assert.equal(attempt.answers[0], 'Mein gespeicherter Entwurf.');
  assert.equal(nextReadinessTask(ctx.writingCourse, state), next);
  assert.equal(expireWritingDrafts(ctx.writingExercises, state.writingCourse, deadline + 60000), false);
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
  assert.deepEqual(writingCounts('z. B. um 18:30 Uhr geht´s.'), { words: 5, lines: 1 });
  assert.deepEqual(writingCounts(''), { words: 0, lines: 0 });
  const ctx = context();
  const state = freshState(ctx, day);
  assert.deepEqual(skillResults(ctx, state).map(axis => axis.value), [null, null, null, null]);
  state.listeningSample = { correct: 0, total: 3 };
  const task = ctx.writingCourse.readiness[0];
  state.writingCourse[task.id] = { review: rubric('B') };
  assert.deepEqual(skillResults(ctx, state).map(axis => axis.value), [null, null, 60, 0]);
});

test('a reading retake keeps the last graded score through backup and restore', () => {
  const ctx = context();
  const state = freshState(ctx, day);
  const review = ctx.modelTests.get('petra').sections.find(section => section.id === 'lesen-1');
  const responses = Object.fromEntries(review.items.map(item => [item.number, item.answer]));
  state.modelExams.petra = { 'lesen-1': { responses, checked: true } };
  const snapshot = importBackup(exportBackup(state, ctx), ctx, day);
  const result = snapshot.modelExams.petra['lesen-1'];
  result.readingResult = lastReadingResult(review, result);
  assert.deepEqual(result.readingResult, { correct: 5, total: 5 });
  result.checked = false;
  result.responses = {};
  const reopened = importBackup(exportBackup(snapshot, ctx), ctx, day);
  assert.deepEqual(skillResults(ctx, reopened)[0], { value: 100, count: 5 });
  reopened.modelExams.petra['lesen-1'].checked = true;
  assert.deepEqual(skillResults(ctx, reopened)[0], { value: 0, count: 5 });
});


test('a pending review preserves the streak and a second same-day response does not count', () => {
  const ctx = context();
  const course = ctx.writingCourse;
  const state = freshState(ctx, day);
  const days = ['2026-11-23', '2026-11-24', '2026-11-24', '2026-11-25', '2026-11-26'];
  const submissions = course.readiness.slice(0, days.length).map((task, index) => {
    const time = Date.parse(days[index]) + index * 3600000;
    const attempt = state.writingCourse[task.id] = newWritingAttempt(task, time);
    attempt.answers[0] = 'Mein ausgefüllter Entwurf.';
    submitWriting(task, attempt, time + 30000, days[index]);
    return attempt;
  });
  submissions[0].review = rubric();
  submissions[1].review = rubric();
  submissions[1].secondReview = rubric();
  submissions[2].review = rubric('B');
  assert.equal(readinessProgress(course, state).streak, 2);
  assert.equal(readinessProgress(course, state).achieved, false);
  submissions[4].review = rubric();
  assert.equal(readinessProgress(course, state).streak, 1);
  assert.equal(readinessProgress(course, state).achieved, false);
  submissions[3].review = rubric();
  assert.equal(readinessProgress(course, state).streak, 4);
  assert.equal(readinessProgress(course, state).achieved, true);
  submissions[3].review = rubric('B');
  assert.equal(readinessProgress(course, state).streak, 1);
  assert.equal(readinessProgress(course, state).achieved, false);
});

test('a blank expired mock stays incomplete, including after restoring an old backup', () => {
  setLang('de');
  const ctx = context();
  const state = freshState(ctx, day);
  const task = ctx.writingExercises.get('probe-bibliothek');
  const attempt = state.writingCourse[task.id] = newWritingAttempt(task, start);
  const deadline = writingDeadline(task, attempt);
  submitWriting(task, attempt, deadline, day);
  attempt.revealed = true;
  attempt.done = true;
  attempt.review = rubric();
  const restored = importBackup(exportBackup(state, ctx), ctx, day);
  assert.equal(restored.writingCourse[task.id].done, false);
  assert.equal(restored.writingCourse[task.id].review, null);
  assert.equal(courseProgress(ctx.writingCourse, restored).done, 0);
  const route = parse(`#schreiben/${task.id}`, ctx);
  const html = writing.render({ ctx, state: restored }, route);
  assert.match(html, /Musterlösung/);
  assert.match(html, /Neue Runde starten/);
  assert.doesNotMatch(html, /Aufgabe abgeschlossen|Bewertung der Lehrkraft/);
});

test('the readiness list and radar show the second teacher’s result when recorded', () => {
  setLang('de');
  const ctx = context();
  const state = freshState(ctx, day);
  const task = ctx.writingCourse.readiness[0];
  const attempt = state.writingCourse[task.id] = newWritingAttempt(task, start);
  attempt.answers[0] = 'Ich komme am Wochenende gern mit.';
  submitWriting(task, attempt, start + 30000, day);
  attempt.review = rubric();
  attempt.secondReview = rubric('B');
  const route = parse('#schreiben/bereit', ctx);
  const html = writing.render({ ctx, state }, route);
  assert.match(html, /27 \/ 45/);
  assert.doesNotMatch(html, /<span>45 \/ 45<\/span>/);
  assert.equal(skillResults(ctx, state)[2].value, 60);
});
