import test from 'node:test';
import assert from 'node:assert/strict';
import { award, levelFor, displayStreak, RANKS, XP, QUESTION_XP } from '../src/js/engine/gamification.js';
import { addDays } from '../src/js/dates.js';
import { context, freshState } from './support/context.js';

const day = '2026-11-14';
const xpOf = notes => notes.filter(note => note.type === 'xp').reduce((sum, note) => sum + note.amount, 0);

function setup(goal = 60) {
  const ctx = context();
  const state = freshState(ctx);
  state.settings.dailyGoal = goal;
  return { ctx, state };
}

test('ranks start at 0 XP and end at the legend', () => {
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(149).level, 1);
  assert.equal(levelFor(150).level, 2);
  assert.equal(levelFor(6000).level, RANKS.length);
  assert.equal(levelFor(6000).to, null);
  assert.equal(levelFor(275).progress, 0.5);
});

test('learning a lesson pays once and moves the token to the next stop', () => {
  const { ctx, state } = setup();
  const first = ctx.route[0].id;
  const notes = award(ctx, state, { kind: 'lessonLearned', lesson: first }, day);
  assert.equal(xpOf(notes), XP.lesson);
  assert.equal(state.completed[first], day);
  assert.equal(state.stars[first], 1);
  assert.deepEqual([state.player.from, state.player.at, state.player.animate], [first, ctx.route[1].id, true]);
  assert.ok(notes.some(note => note.type === 'badge' && note.id === 'first-step'));
  assert.equal(xpOf(award(ctx, state, { kind: 'lessonLearned', lesson: first }, day)), 0);
});

test('question XP: first time by difficulty, halved with a hint, then 1 per day or 3 in review', () => {
  const { ctx, state } = setup();
  const [q1, , , q4] = ctx.lessons.get('passiv-perfekt').questions;
  assert.equal(xpOf(award(ctx, state, { kind: 'answer', q: q1, correct: true }, day)), QUESTION_XP[q1.difficulty]);
  assert.equal(xpOf(award(ctx, state, { kind: 'answer', q: q1, correct: true }, day)), 0, 'nothing more the same day');
  assert.equal(xpOf(award(ctx, state, { kind: 'answer', q: q1, correct: true }, addDays(day, 1))), XP.repeat);
  assert.equal(xpOf(award(ctx, state, { kind: 'answer', q: q1, correct: true, review: true }, addDays(day, 2))), XP.review);
  assert.equal(xpOf(award(ctx, state, { kind: 'answer', q: q4, correct: false }, day)), 0);
  assert.equal(xpOf(award(ctx, state, { kind: 'answer', q: q4, correct: true, hinted: true }, day)), Math.floor(QUESTION_XP[q4.difficulty] / 2));
  assert.equal(state.stats.reviewsDone, 1);
});

test('lesson runs pay a daily bonus, a perfect bonus once, and raise stars', () => {
  const { ctx, state } = setup(500);
  const lesson = 'genitiv';
  let notes = award(ctx, state, { kind: 'lessonRun', lesson, correct: 5, total: 9 }, day);
  assert.equal(xpOf(notes), XP.run);
  assert.equal(state.completed[lesson], undefined, 'below two stars the lesson is not learned');
  notes = award(ctx, state, { kind: 'lessonRun', lesson, correct: 7, total: 9 }, day);
  assert.equal(xpOf(notes), XP.lesson, 'same day: no second run bonus, but the lesson is learned');
  assert.equal(state.stars[lesson], 2);
  notes = award(ctx, state, { kind: 'lessonRun', lesson, correct: 9, total: 9 }, addDays(day, 1));
  assert.equal(xpOf(notes), XP.run + XP.perfectRun);
  assert.equal(state.stars[lesson], 3);
  assert.ok(notes.some(note => note.type === 'badge' && note.id === 'bullseye'));
  notes = award(ctx, state, { kind: 'lessonRun', lesson, correct: 6, total: 9 }, addDays(day, 2));
  assert.equal(state.stars[lesson], 3, 'stars never go down');
  assert.equal(xpOf(notes), XP.run);
});

test('daily goal pays a bonus once and builds the streak', () => {
  const { ctx, state } = setup(15);
  const lessons = ctx.route;
  let notes = award(ctx, state, { kind: 'lessonLearned', lesson: lessons[0].id }, day);
  assert.ok(notes.some(note => note.type === 'goal'));
  assert.equal(state.xp.total, XP.lesson + XP.goal);
  assert.equal(state.xp.byDay[day], XP.lesson, 'the bonus does not count towards the goal');
  notes = award(ctx, state, { kind: 'lessonLearned', lesson: lessons[1].id }, day);
  assert.ok(!notes.some(note => note.type === 'goal'));
  assert.equal(state.streak.current, 1);
  award(ctx, state, { kind: 'lessonLearned', lesson: lessons[2].id }, addDays(day, 1));
  award(ctx, state, { kind: 'lessonLearned', lesson: lessons[3].id }, addDays(day, 2));
  assert.equal(state.streak.current, 3);
  assert.ok(state.badges['streak-3']);
  assert.equal(displayStreak(state, addDays(day, 3)), 3, 'still alive the next day');
  assert.equal(displayStreak(state, addDays(day, 4)), 0, 'broken after a missed day');
  award(ctx, state, { kind: 'lessonLearned', lesson: lessons[4].id }, addDays(day, 5));
  assert.equal(state.streak.current, 1);
  assert.equal(state.streak.best, 3);
});

test('island exams conquer on 80 % and pay 100 then 20', () => {
  const { ctx, state } = setup(500);
  let notes = award(ctx, state, { kind: 'exam', island: 'passiv', correct: 7, total: 10 }, day);
  assert.equal(xpOf(notes), 0);
  assert.equal(state.islands.passiv.conquered, null);
  assert.equal(state.islands.passiv.examBest, 7);
  notes = award(ctx, state, { kind: 'exam', island: 'passiv', correct: 8, total: 10 }, day);
  assert.equal(xpOf(notes), XP.examFirst);
  assert.ok(notes.some(note => note.type === 'conquered'));
  assert.ok(state.badges['land-ho']);
  notes = award(ctx, state, { kind: 'exam', island: 'passiv', correct: 10, total: 10 }, day);
  assert.equal(xpOf(notes), XP.examAgain);
  assert.ok(state.badges['flawless-exam']);
  assert.equal(state.islands.passiv.examTries, 3);
});

test('the timed test pays once per day with a bonus at 90 %', () => {
  const { ctx, state } = setup(500);
  assert.equal(xpOf(award(ctx, state, { kind: 'test', correct: 18, total: 20 }, day)), XP.test + XP.testAce);
  assert.ok(state.badges['timed-ace']);
  assert.equal(xpOf(award(ctx, state, { kind: 'test', correct: 20, total: 20 }, day)), 0);
  assert.equal(xpOf(award(ctx, state, { kind: 'test', correct: 10, total: 20 }, addDays(day, 1))), XP.test);
});

test('level-up and level badges', () => {
  const { ctx, state } = setup(5000);
  state.xp.total = 145;
  const notes = award(ctx, state, { kind: 'lessonLearned', lesson: ctx.route[0].id }, day);
  assert.ok(notes.some(note => note.type === 'levelUp' && note.level === 2));
  for (const lesson of ctx.route.filter(l => l.level === 'B1.1')) state.completed[lesson.id] = day;
  const more = award(ctx, state, { kind: 'test', correct: 1, total: 20 }, day);
  assert.ok(more.some(note => note.type === 'badge' && note.id === 'b11'));
});
