// The word list and the gap texts of the Sprachbausteine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../src/js/i18n/index.js';
import { parse } from '../src/js/router.js';
import { cleanWord, addWord, removeWord, wordList, MAX_WORDS } from '../src/js/engine/words.js';
import { normalizeState, exportBackup, importBackup } from '../src/js/engine/migrate.js';
import { vocab } from '../src/js/views/sections.js';
import * as sprachbausteine from '../src/js/views/sprachbausteine.js';
import * as modelExams from '../src/js/views/model-exams.js';
import { context, freshState } from './support/context.js';

const day = '2026-11-14';
const fakeApp = (ctx, state) => {
  const store = { state, available: true, update(fn) { return fn(this.state); }, save() {} };
  return { ctx, store, get state() { return store.state; }, day: () => day, redrawing: false, route: null };
};

test('a picked string is saved as one German word without punctuation', () => {
  assert.equal(cleanWord('Gebäudes.'), 'Gebäudes');
  assert.equal(cleanWord(' „Umzug“ '), 'Umzug');
  assert.equal(cleanWord('E-Mail,'), 'E-Mail');
  assert.equal(cleanWord('geht’s'), 'geht’s');
  assert.equal(cleanWord('zwei Wörter'), null);
  assert.equal(cleanWord('المبنى'), null);
  assert.equal(cleanWord('123'), null);
  assert.equal(cleanWord(''), null);
  assert.equal(cleanWord('x'.repeat(80)), null);
});

test('words are added once, removed, listed newest first and capped', () => {
  const ctx = context();
  const state = freshState(ctx, day);
  assert.equal(addWord(state, 'Umzug!', '2026-11-01'), 'Umzug');
  assert.equal(addWord(state, 'Umzug', '2026-11-05'), 'Umzug');
  assert.equal(state.words.Umzug, '2026-11-01', 'the first day stays');
  addWord(state, 'Ausweis', '2026-11-03');
  addWord(state, 'Laden', '2026-11-03');
  assert.deepEqual(wordList(state).map(([word]) => word), ['Laden', 'Ausweis', 'Umzug']);
  removeWord(state, 'Ausweis');
  assert.deepEqual(Object.keys(state.words), ['Umzug', 'Laden']);
  assert.equal(addWord(state, 'zwei Wörter', day), null);
  for (let i = 0; i < MAX_WORDS + 5; i++) addWord(state, `Wort${'abcdefghij'[i % 10]}${i}`.replace(/\d/g, d => 'klmnopqrst'[d]), day);
  assert.equal(Object.keys(state.words).length, MAX_WORDS);
  assert.equal(state.words.Umzug, undefined, 'the oldest words go first');
});

test('the word list survives saving, loading and backups, and bad entries are dropped', () => {
  const ctx = context();
  const state = freshState(ctx, day);
  addWord(state, 'Gebäudes', day);
  const raw = JSON.parse(JSON.stringify(state));
  raw.words['zwei Wörter'] = day;
  raw.words.Laden = 'gestern';
  raw.words['المبنى'] = day;
  const loaded = normalizeState(raw, ctx, day);
  assert.deepEqual(loaded.words, { Gebäudes: day });
  const restored = importBackup(JSON.parse(JSON.stringify(exportBackup(loaded, ctx))), ctx, day);
  assert.deepEqual(restored.words, { Gebäudes: day });
  assert.deepEqual(normalizeState({ ...raw, words: ['Umzug'] }, ctx, day).words, {});
});

for (const lang of ['de', 'ar']) {
  test(`Meine Wörter lists saved words as German text (${lang})`, () => {
    setLang(lang);
    const ctx = context();
    const state = freshState(ctx, day);
    const app = fakeApp(ctx, state);
    assert.match(vocab.render(app), /class="muted">[^<]+<\/p>\s*<\/section>/, 'empty list message');
    addWord(state, 'Gebäudes', day);
    const html = vocab.render(app);
    assert.match(html, /<ul class="my-words" lang="de" dir="ltr">/);
    assert.match(html, /data-action="word-remove" data-word="Gebäudes"/);
    assert.match(html, /data-action="words-copy"/);
  });
}

test('Sprachbausteine part 1 has a dropdown in every gap, part 2 drop gaps and a word list', () => {
  setLang('de');
  const ctx = context();
  const state = freshState(ctx, day);
  const app = fakeApp(ctx, state);
  for (const set of ctx.sprachbausteine.values()) {
    const route = parse(`#sprachbausteine/${set.id}`, ctx);
    app.route = route;
    const html = sprachbausteine.render(app, route);
    if (set.bank) {
      assert.equal((html.match(/data-drop-gap="/g) || []).length, set.gaps.length, set.id);
      assert.equal((html.match(/class="bank-chip /g) || []).length, set.bank.length, set.id);
      assert.doesNotMatch(html, /<select/, set.id);
    } else {
      assert.equal((html.match(/data-sprach-gap="/g) || []).length, set.gaps.length, set.id);
      assert.doesNotMatch(html, /data-drop-gap/, set.id);
    }
  }
  const bankSet = [...ctx.sprachbausteine.values()].find(set => set.bank);
  state.sprach[bankSet.id] = { answers: bankSet.gaps.map((gap, i) => (i === 0 ? bankSet.bank[0] : '')), finished: false };
  const route = parse(`#sprachbausteine/${bankSet.id}`, ctx);
  app.route = route;
  const html = sprachbausteine.render(app, route);
  assert.match(html, new RegExp(`class="drop-gap filled" data-drop-gap="0" data-value="${bankSet.bank[0]}"`));
  assert.match(html, new RegExp(`class="bank-chip used" data-bank-value="${bankSet.bank[0]}"[^>]*disabled`));
});

for (const lang of ['de', 'ar']) {
  test(`mock exam Sprachbausteine fill their gaps in the text (${lang})`, () => {
    setLang(lang);
    const ctx = context();
    const state = freshState(ctx, day);
    const app = fakeApp(ctx, state);
    for (const model of ctx.modelTests.values()) {
      for (const id of ['sprache-1', 'sprache-2']) {
        const section = model.sections.find(part => part.id === id);
        const route = parse(`#model-exams/${model.id}/${id}`, ctx);
        app.route = route;
        const html = modelExams.render(app, route);
        const gaps = id === 'sprache-1' ? /<select data-exam-item="/g : /data-drop-gap="/g;
        assert.equal((html.match(gaps) || []).length, section.items.length, `${model.id} ${id}`);
        assert.doesNotMatch(html, /class="exam-questions"/, `${model.id} ${id}: no separate answer list while working`);
        if (id === 'sprache-2') assert.equal((html.match(/class="bank-chip /g) || []).length, Object.keys(section.choices).length);
        assert.ok(!/undefined|NaN|\$\{/.test(html), `${model.id} ${id}: template holes`);
      }
    }
    const model = [...ctx.modelTests.values()][0];
    const section = model.sections.find(part => part.id === 'sprache-2');
    const [first, second] = section.items;
    state.modelExams[model.id] = { 'sprache-2': { responses: { [first.number]: first.answer, [second.number]: first.answer === 'a' ? 'b' : 'a' }, checked: true } };
    const route = parse(`#model-exams/${model.id}/sprache-2`, ctx);
    app.route = route;
    const checked = modelExams.render(app, route);
    assert.equal((checked.match(/class="exam-filled good"/g) || []).length, 1);
    assert.match(checked, /class="exam-filled bad"><small aria-hidden="true">[^<]+<\/small><s>/);
    assert.match(checked, /class="exam-questions"/, 'the answer list returns as feedback');
  });
}
