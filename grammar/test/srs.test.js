import test from 'node:test';
import assert from 'node:assert/strict';
import { schedule, dueIds, INTERVALS } from '../src/js/engine/srs.js';
import { addDays, diffDays } from '../src/js/dates.js';
import { context, freshState } from './support/context.js';

test('date helpers cross month and year boundaries', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(diffDays('2026-10-24', '2026-10-26'), 2);
});

test('boxes climb on correct answers and reset on mistakes', () => {
  const result = {};
  const day = '2026-11-14';
  schedule(result, true, day);
  assert.deepEqual([result.box, result.due], [1, addDays(day, INTERVALS[1])]);
  for (const box of [2, 3, 4, 5]) {
    schedule(result, true, day);
    assert.equal(result.box, box);
    assert.equal(result.due, addDays(day, INTERVALS[box]));
  }
  schedule(result, true, day);
  assert.equal(result.box, 5);
  assert.equal(result.due, addDays(day, 30));
  schedule(result, false, day);
  assert.deepEqual([result.box, result.due], [1, '2026-11-15']);
});

test('due questions are sorted by date and respect the level filter', () => {
  const ctx = context();
  const state = freshState(ctx);
  const [a, b] = ctx.route[0].questions;
  state.results[a.id] = { due: '2026-11-13' };
  state.results[b.id] = { due: '2026-11-10' };
  state.results['unknown-1'] = { due: '2026-11-01' };
  state.results[ctx.route[1].questions[0].id] = { due: '2026-11-20' };
  assert.deepEqual(dueIds(ctx, state, '2026-11-14'), [b.id, a.id]);
  const otherLevel = ctx.route[0].level === 'B1.1' ? 'B1.2' : 'B1.1';
  assert.deepEqual(dueIds(ctx, state, '2026-11-14', otherLevel), []);
});
