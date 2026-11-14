import test from 'node:test';
import assert from 'node:assert/strict';
import { runStars, lessonStars, islandProgress, nextLesson, record, visitLesson, missingPrereqs, overall } from '../src/js/engine/progress.js';
import { context, freshState } from './support/context.js';

const day = '2026-11-14';

test('run stars use the 66 % and 88 % thresholds', () => {
  assert.equal(runStars(5, 9), 0);
  assert.equal(runStars(6, 9), 2);
  assert.equal(runStars(7, 9), 2);
  assert.equal(runStars(8, 9), 3);
  assert.equal(runStars(6, 10), 0);
  assert.equal(runStars(7, 10), 2);
  assert.equal(runStars(8, 10), 2);
  assert.equal(runStars(9, 10), 3);
  assert.equal(runStars(0, 0), 0);
});

test('a learned lesson has at least one star', () => {
  const ctx = context();
  const state = freshState(ctx);
  assert.equal(lessonStars(state, 'genitiv'), 0);
  state.completed.genitiv = day;
  assert.equal(lessonStars(state, 'genitiv'), 1);
  state.stars.genitiv = 3;
  assert.equal(lessonStars(state, 'genitiv'), 3);
});

test('the next lesson walks the route, then the unmastered ones, then stops', () => {
  const ctx = context();
  const state = freshState(ctx);
  assert.equal(nextLesson(ctx, state).id, ctx.route[0].id);
  state.completed[ctx.route[0].id] = day;
  assert.equal(nextLesson(ctx, state).id, ctx.route[1].id);
  for (const lesson of ctx.route) state.completed[lesson.id] = day;
  assert.equal(nextLesson(ctx, state).id, ctx.route[0].id);
  for (const lesson of ctx.route) state.stars[lesson.id] = 3;
  assert.equal(nextLesson(ctx, state), null);
  state.settings.levelFilter = 'B1.1';
  state.stars[ctx.route.find(lesson => lesson.level === 'B1.1').id] = 2;
  assert.equal(nextLesson(ctx, state).level, 'B1.1');
});

test('island progress counts learned lessons, stars and the exam gate', () => {
  const ctx = context();
  const state = freshState(ctx);
  const lessons = ctx.islandLessons('passiv');
  let p = islandProgress(ctx, state, 'passiv');
  assert.deepEqual([p.learned, p.stars, p.examReady], [0, 0, false]);
  lessons.forEach(lesson => { state.completed[lesson.id] = day; });
  state.stars[lessons[0].id] = 3;
  p = islandProgress(ctx, state, 'passiv');
  assert.equal(p.learned, lessons.length);
  assert.equal(p.stars, lessons.length + 2);
  assert.equal(p.examReady, true);
  assert.equal(overall(ctx, state).learned, lessons.length);
});

test('a mistake leaves review after two correct answers in a row', () => {
  const ctx = context();
  const state = freshState(ctx);
  const q = ctx.route[0].questions[0];
  record(state, q, false, day);
  assert.equal(state.results[q.id].needsReview, true);
  record(state, q, true, day);
  assert.equal(state.results[q.id].needsReview, true);
  const { cleared } = record(state, q, true, day);
  assert.equal(cleared, true);
  assert.equal(state.results[q.id].needsReview, false);
  assert.equal(state.results[q.id].tries, 3);
  assert.equal(state.stats.mistakesCleared, 1);
});

test('opening a lesson moves the player token', () => {
  const ctx = context();
  const state = freshState(ctx);
  const first = state.player.at;
  visitLesson(state, 'lassen');
  assert.deepEqual([state.player.from, state.player.at, state.player.animate], [first, 'lassen', true]);
  state.player.animate = false;
  visitLesson(state, 'lassen');
  assert.equal(state.player.animate, false);
  assert.equal(state.lastLesson, 'lassen');
});

test('missing prerequisites are listed', () => {
  const ctx = context();
  const state = freshState(ctx);
  const lesson = ctx.lessons.get('relativ-genitiv');
  assert.deepEqual(missingPrereqs(ctx, state, lesson).map(l => l.id), ['relativ-dativ', 'genitiv']);
  state.completed.genitiv = day;
  assert.deepEqual(missingPrereqs(ctx, state, lesson).map(l => l.id), ['relativ-dativ']);
});
