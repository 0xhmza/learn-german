import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { migrateLegacy, importLegacyExport, normalizeState, exportBackup, importBackup, defaultState } from '../src/js/engine/migrate.js';
import { createStore, STATE_KEY, LANG_KEY } from '../src/js/state.js';
import { XP, QUESTION_XP } from '../src/js/engine/gamification.js';
import { newRun, permutation } from '../src/js/engine/runs.js';
import { context, freshState } from './support/context.js';

const day = '2026-11-14';
const legacy = JSON.parse(await readFile(new URL('./fixtures/legacy-state.json', import.meta.url), 'utf8'));

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    data
  };
}

test('legacy progress becomes learned lessons, results, stars and XP', () => {
  const ctx = context();
  const state = migrateLegacy(legacy, ctx, day);
  assert.equal(state.completed['passiv-perfekt'], day);
  assert.equal(state.completed['je-desto'], day, 'all questions tried with 8/9 correct counts as learned');
  assert.equal(state.stars['je-desto'], 3);
  assert.equal(state.stars['passiv-perfekt'], 1);
  assert.equal(state.completed['no-such-lesson'], undefined);
  const r = state.results['passiv-perfekt-1'];
  assert.deepEqual([r.correct, r.box, r.due, r.xpDone, r.tries], [true, 2, day, true, 3]);
  assert.equal(state.results['passiv-perfekt-2'].box, 1);
  assert.equal(state.results['passiv-perfekt-2'].needsReview, true);
  assert.equal(state.results['ghost-1'], undefined);
  const correctXp = Object.entries(legacy.results)
    .filter(([id, value]) => value.correct && ctx.questions.has(id))
    .reduce((sum, [id]) => sum + QUESTION_XP[ctx.questions.get(id).difficulty], 0);
  assert.equal(state.xp.total, 2 * XP.lesson + correctXp);
  assert.deepEqual(state.xp.byDay, {}, 'migration does not start a streak');
  assert.equal(state.lastLesson, 'je-desto');
  assert.ok(state.badges['first-step']);
  assert.deepEqual(state.runs, {});
});

test('the store migrates once, copies preferences and keeps legacy keys', () => {
  const ctx = context();
  const storage = memoryStorage({
    'deutsch-b11-ar-2026-1': JSON.stringify(legacy),
    'deutsch-b11-lang': 'de'
  });
  const store = createStore(ctx, { storage, day });
  assert.equal(store.migrated, true);
  assert.equal(storage.getItem(LANG_KEY), 'de');
  assert.ok(storage.getItem('deutsch-b11-ar-2026-1'));
  const saved = JSON.parse(storage.getItem(STATE_KEY));
  assert.equal(saved.completed['passiv-perfekt'], day);
  const again = createStore(ctx, { storage, day: '2026-11-20' });
  assert.equal(again.migrated, false);
  assert.equal(again.state.completed['passiv-perfekt'], day);
});

test('blocked storage falls back to memory', () => {
  const ctx = context();
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const store = createStore(ctx, { storage, day });
  assert.equal(store.available, false);
  store.update(state => { state.completed.genitiv = day; });
  assert.equal(store.state.completed.genitiv, day);
});

test('the exported B1.1 results file can be imported', () => {
  const ctx = context();
  const state = freshState(ctx);
  const items = ctx.lessons.get('falls').questions.map((q, i) => ({ id: q.id, correct: i !== 0, streak: 1, tries: 1, needsReview: i === 0, topic: 'falls' }));
  const count = importLegacyExport({ als: '1', kind: 'results', items: [...items, { id: 'nope-1', correct: true }] }, ctx, state, day);
  assert.equal(count, items.length);
  assert.equal(state.completed.falls, day, 'all questions tried means the lesson counts as learned');
  assert.equal(state.stars.falls, 3, '8 of 9 correct');
  assert.throws(() => importLegacyExport({ kind: 'backup' }, ctx, state, day));
});

test('saved state is sanitized against the current content', () => {
  const ctx = context();
  const raw = defaultState(day);
  raw.completed = { genitiv: true, ghost: day };
  raw.stars = { genitiv: 7, lassen: 2 };
  raw.results = { 'genitiv-1': { correct: true, box: 9, due: 'tomorrow' }, 'ghost-1': {} };
  raw.runs = { genitiv: { key: 'genitiv', ids: ['genitiv-1'], position: 4 }, broken: { key: 'broken', ids: [] } };
  raw.settings = { levelFilter: 'C2', dailyGoal: 31, reduceMotion: 'yes' };
  raw.player = { at: 'ghost', from: null, animate: true };
  const state = normalizeState(raw, ctx, day);
  assert.deepEqual(state.completed, { genitiv: day });
  assert.deepEqual(state.stars, { lassen: 2 });
  assert.deepEqual(Object.keys(state.results), ['genitiv-1']);
  assert.equal(state.results['genitiv-1'].box, 5);
  assert.equal(state.results['genitiv-1'].due, day);
  assert.deepEqual(Object.keys(state.runs), ['genitiv']);
  assert.equal(state.runs.genitiv.position, 0);
  assert.deepEqual(state.settings, { levelFilter: 'all', dailyGoal: 30, reduceMotion: false });
  assert.equal(state.player.at, ctx.route.find(lesson => lesson.id !== 'genitiv').id);
  assert.equal(state.player.animate, false);
  assert.equal(normalizeState({ v: 99 }, ctx, day).v, 1);
});

test('backups round-trip and foreign files are rejected', () => {
  const ctx = context();
  const state = freshState(ctx);
  state.completed.lassen = day;
  state.xp.total = 321;
  const backup = JSON.parse(JSON.stringify(exportBackup(state, ctx, '2026-11-14T10:00:00Z')));
  const restored = importBackup(backup, ctx, day);
  assert.equal(restored.completed.lassen, day);
  assert.equal(restored.xp.total, 321);
  assert.throws(() => importBackup({ app: 'other', kind: 'backup', state: {} }, ctx, day));
});

test('version 1 cached attempts resume and new study progress survives a backup', () => {
  const ctx = context();
  const original = freshState(ctx, day);
  delete original.cards;
  delete original.sprach;
  const legacyRun = newRun(ctx, original, 'genitiv', { day });
  const choice = ctx.lessons.get('genitiv').questions.find(question => question.type === 'mcq');
  permutation(legacyRun, choice, choice.options.length);
  legacyRun.position = legacyRun.ids.indexOf(choice.id);
  legacyRun.answers[choice.id] = choice.answer;
  original.runs.genitiv = legacyRun;
  original.lastRun = 'genitiv';
  original.completed.genitiv = day;
  original.stars.genitiv = 2;
  original.xp.total = 142;
  const store = createStore(ctx, { storage: memoryStorage({ [STATE_KEY]: JSON.stringify(original) }), day });
  const state = store.state;
  assert.deepEqual(state.runs.genitiv, legacyRun);
  assert.equal(state.lastRun, 'genitiv');
  assert.deepEqual([state.completed.genitiv, state.stars.genitiv, state.xp.total], [day, 2, 142]);
  assert.deepEqual(state.cards, {});
  assert.deepEqual(state.sprach, {});

  const crossLesson = newRun(ctx, state, 'set-satzbau', { day });
  assert.ok(new Set(crossLesson.ids.map(id => ctx.questions.get(id).lesson)).size > 1);
  state.runs[crossLesson.key] = crossLesson;
  state.cards['genitiv-recall'] = { box: 3, due: '2026-11-21' };
  const { id, gaps } = ctx.sprachbausteine.get('gartenverein');
  state.sprach[id] = { finished: false, answers: gaps.map((gap, i) => i < 3 ? gap.answer : '') };
  const restored = importBackup(JSON.parse(JSON.stringify(exportBackup(state, ctx))), ctx, day);
  assert.deepEqual(restored.cards, state.cards);
  assert.deepEqual(restored.sprach, state.sprach);
  assert.deepEqual(restored.runs[crossLesson.key], crossLesson);
});
