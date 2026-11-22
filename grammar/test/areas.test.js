// Areas on the dashboard: current level, progress and where the learner stopped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../src/js/i18n/index.js';
import { parse } from '../src/js/router.js';
import { areaOf, recordVisit, currentLevel, grammarProgress, writingProgress, testsProgress, vocabProgress, writingTasks } from '../src/js/engine/areas.js';
import { normalizeState } from '../src/js/engine/migrate.js';
import { addWord } from '../src/js/engine/words.js';
import { stopFor } from '../src/js/components/stops.js';
import { context, freshState } from './support/context.js';

const day = '2026-11-14';
const appFor = (ctx, state) => ({ ctx, state, store: { state } });

test('routes belong to the right area', () => {
  const ctx = context();
  assert.equal(areaOf(parse('#lesson/genitiv', ctx)), 'grammar');
  assert.equal(areaOf(parse('#model-exams/petra/schreiben', ctx)), 'writing');
  assert.equal(areaOf(parse('#model-exams/petra/sprache-1', ctx)), 'tests');
  assert.equal(areaOf(parse('#practice/write-genitiv', ctx)), 'writing');
  assert.equal(areaOf(parse('#practice/exam-passiv', ctx)), 'tests');
  assert.equal(areaOf(parse('#practice/genitiv', ctx)), null);
  assert.equal(areaOf(parse('#model-exams', ctx)), null);
  assert.equal(areaOf(parse('#home', ctx)), null);
});

test('the last stop is saved per area and survives loading', () => {
  const ctx = context();
  const state = freshState(ctx, day);
  assert.equal(recordVisit(state, parse('#model-exams/petra/schreiben', ctx), day), true);
  assert.equal(recordVisit(state, parse('#model-exams/petra/schreiben', ctx), day), false, 'no change on the same day');
  recordVisit(state, parse('#lesson/genitiv', ctx), day);
  assert.deepEqual(state.last, { writing: { hash: 'model-exams/petra/schreiben', day }, grammar: { hash: 'lesson/genitiv', day } });
  const raw = JSON.parse(JSON.stringify(state));
  raw.last.tests = { hash: '<script>', day };
  raw.last.vocab = { hash: 'vokabeln', day };
  raw.settings.level = 'Z9';
  const loaded = normalizeState(raw, ctx, day);
  assert.deepEqual(loaded.last, state.last);
  assert.equal(currentLevel(loaded), 'B1');
  raw.settings.level = 'C1';
  assert.equal(currentLevel(normalizeState(raw, ctx, day)), 'C1');
});

test('progress counts lessons, words, writing tasks and checked exam parts', () => {
  const ctx = context();
  const state = freshState(ctx, day);
  assert.deepEqual(grammarProgress(ctx, state), { done: 0, total: ctx.lessons.size });
  state.completed.genitiv = day;
  assert.equal(grammarProgress(ctx, state).done, 1);
  const { exams, everyday } = writingTasks(ctx, state);
  assert.equal(exams.length, ctx.modelTests.size);
  assert.ok(everyday.length >= 10);
  const key = everyday[0].key;
  state.runs[key] = { answers: { [key]: 'Ich schreibe später weiter.' } };
  assert.equal(writingTasks(ctx, state).everyday[0].draft, true);
  assert.equal(writingProgress(ctx, state).done, 0);
  state.runs[key].finished = true;
  assert.equal(writingTasks(ctx, state).everyday[0].draft, false);
  state.modelExams.petra = { schreiben: { writing: 'Liebe Petra, ...' }, 'sprache-1': { checked: true, responses: {} } };
  state.results[key] = { correct: true };
  assert.deepEqual(writingProgress(ctx, state), { done: 2, total: exams.length + everyday.length });
  const tests = testsProgress(ctx, state);
  assert.equal(tests.done, 1);
  assert.equal(tests.total, ctx.modelTests.size * 5, 'three reading and two Sprachbausteine parts per exam');
  addWord(state, 'Umzug', day);
  assert.deepEqual(vocabProgress(state), { words: 1, last: { word: 'Umzug', day } });
  addWord(state, 'Ausweis', '2026-11-13');
  assert.deepEqual(vocabProgress(state), { words: 2, last: { word: 'Umzug', day } });
});

test('a saved stop becomes a title, a date and a link back', () => {
  setLang('de');
  const ctx = context();
  const state = freshState(ctx, day);
  const app = appFor(ctx, state);
  assert.equal(stopFor(app, 'writing'), null);
  recordVisit(state, parse('#model-exams/petra/schreiben', ctx), day);
  const writing = stopFor(app, 'writing');
  assert.match(writing.title, /Schriftlicher Ausdruck/);
  assert.match(writing.meta, /Modelltest 1 · .+ · zuletzt am 14. November$/);
  assert.match(writing.action, /href="#model-exams\/petra\/schreiben"/);
  state.last.writing.hash = 'model-exams/petra/lesen-1';
  state.modelExams.petra = { schreiben: { writing: 'Liebe Petra, ...' } };
  assert.match(stopFor(app, 'writing').action, /href="#model-exams\/petra\/schreiben"/);
  state.lastLesson = 'genitiv';
  const grammar = stopFor(app, 'grammar');
  assert.match(grammar.action, /href="#lesson\/genitiv"[^>]*>Fortsetzen</);
  state.completed.genitiv = day;
  assert.match(stopFor(app, 'grammar').meta, /Lektion abgeschlossen/);
});
