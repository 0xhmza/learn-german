// Hörtraining (listening trainer): dictation comparison, number words, the learner model,
// review cards, sessions and the listening pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/js/engine/listening-trainer.js';
import { setLang } from '../src/js/i18n/index.js';
import { parse } from '../src/js/router.js';
import { award } from '../src/js/engine/gamification.js';
import { normalizeState } from '../src/js/engine/migrate.js';
import * as listening from '../src/js/views/listening-trainer.js';
import { context, freshState, seeded } from './support/context.js';

const day = '2026-11-25';

test('a dictation is compared word by word and each mistake gets a kind', () => {
  const result = L.compareDictation('Ich weiß nicht, ob der Zug pünktlich ankommt.', 'ich weis nicht ob der zug punktlich an kommt');
  const kinds = Object.fromEntries(result.parts.map(part => [part.expected, part.kind]));
  assert.equal(kinds.Ich, 'minor', 'case only counts as right');
  assert.equal(kinds['weiß'], 'sound');
  assert.equal(kinds['pünktlich'], 'sound');
  assert.equal(kinds.ankommt, 'segment');
  assert.equal(result.words, 8);
  assert.ok(result.accuracy > 0.6 && result.accuracy < 0.75);
  assert.deepEqual(L.missedWords(result).sort(), ['ankommt', 'pünktlich', 'weiß']);
});

test('endings, missing words, numbers and unknown words are told apart', () => {
  const ending = L.compareDictation('Ich helfe einem Freund.', 'Ich helfe einen Freund');
  assert.equal(ending.parts[2].kind, 'ending');
  const missing = L.compareDictation('Ich habe heute keine Zeit.', 'Ich habe heute Zeit');
  assert.deepEqual(missing.parts.map(part => part.kind), ['ok', 'ok', 'ok', 'missed', 'ok']);
  assert.equal(missing.accuracy, 0.8);
  const number = L.compareDictation('Der Bus fährt alle zwanzig Minuten.', 'Der Bus fährt alle dreißig Minuten.');
  assert.equal(number.errors.number, 1);
  const digits = L.compareDictation('Der Bus fährt alle zwanzig Minuten.', 'Der Bus fährt alle 20 Minuten.');
  assert.equal(digits.accuracy, 1, 'digits count as the number word');
  const unknown = L.compareDictation('Die Haltestelle ist hier.', 'Die Bahnhof ist hier.');
  assert.equal(unknown.parts[1].kind, 'word');
  const umlaut = L.compareDictation('Die Tür ist offen.', 'Die Tuer ist offen.');
  assert.equal(umlaut.accuracy, 1, 'ue for ü is accepted');
  const merged = L.compareDictation('Hast du heute Zeit?', 'Hastdu heute Zeit');
  assert.equal(merged.parts[0].kind, 'segment');
});

test('German number words, times, years and ordinals', () => {
  assert.equal(L.numberWords(21), 'einundzwanzig');
  assert.equal(L.numberWords(47), 'siebenundvierzig');
  assert.equal(L.numberWords(101), 'hunderteins');
  assert.equal(L.numberWords(850), 'achthundertfünfzig');
  assert.equal(L.numberWords(21000), 'einundzwanzigtausend');
  assert.equal(L.spokenTime(7, 30), 'halb acht');
  assert.equal(L.spokenTime(8, 45), 'Viertel vor neun');
  assert.equal(L.spokenTime(6, 25), 'fünf vor halb sieben');
  assert.equal(L.spokenTime(12, 30), 'halb eins');
  assert.equal(L.spokenYear(1989), 'neunzehnhundertneunundachtzig');
  assert.equal(L.spokenYear(2024), 'zweitausendvierundzwanzig');
  assert.equal(L.ordinal(3), 'dritten');
  assert.equal(L.ordinal(7), 'siebten');
  assert.equal(L.ordinal(20), 'zwanzigsten');
  assert.equal(L.ordinal(31), 'einunddreißigsten');
});

test('number items accept the usual ways to write the answer', () => {
  const rng = seeded(7);
  for (let i = 0; i < 200; i++) {
    const kind = L.NUMBER_KINDS[i % L.NUMBER_KINDS.length];
    const item = L.makeNumberItem(kind, rng);
    assert.ok(item.say && item.answer, kind);
    assert.ok(L.checkNumber(item, item.answer), `${kind} ${item.answer}`);
  }
  assert.ok(L.checkNumber({ kind: 'preis', answer: '2,50' }, '2.5 €'));
  assert.ok(L.checkNumber({ kind: 'uhrzeit', answer: '8:30' }, '20.30'));
  assert.ok(L.checkNumber({ kind: 'datum', answer: '3.5.' }, '03.05.2026'));
  assert.ok(L.checkNumber({ kind: 'telefon', answer: '0301234567' }, '030 / 12 34 567'));
  assert.ok(!L.checkNumber({ kind: 'zahl', answer: '47' }, '74'));
});

test('the listening level moves with dictation results and picks fitting clips', () => {
  const ctx = context();
  const state = L.defaultTrainer();
  assert.equal(L.thetaOf(state, 'B1'), 3);
  const clip = L.pickClip(ctx, state, 'B1', seeded(2));
  assert.ok(clip);
  const difficulty = L.clipDifficulty(clip);
  const up = L.updateTheta(state, 'B1', difficulty, 1);
  assert.ok(up > 3);
  const down = L.updateTheta(state, 'B1', difficulty, 0);
  assert.ok(down < up);
  const easy = L.defaultTrainer();
  easy.theta = 1.5;
  const hard = L.defaultTrainer();
  hard.theta = 5.5;
  const levelOf = s => L.clipDifficulty(L.pickClip(ctx, s, 'B1', seeded(4)));
  assert.ok(levelOf(easy) < levelOf(hard), 'stronger listeners get harder clips');
  assert.equal(L.thetaLevel(2), 'A2');
  assert.equal(L.thetaLevel(3.2), 'B1');
});

test('the speed ladder suggests faster, slower and back to normal', () => {
  const state = L.defaultTrainer();
  const dictation = (acc, rate = 1, replays = 1) => L.recordAttempt(state, { mode: 'diktat', day, acc, rate, replays });
  for (let i = 0; i < 3; i++) dictation(0.95);
  assert.deepEqual(L.speedAdvice(state), { change: 'up', rate: 1.1 });
  state.rate = 0.85;
  for (let i = 0; i < 3; i++) dictation(0.95, 0.85);
  assert.deepEqual(L.speedAdvice(state), { change: 'normal', rate: 1 });
  state.rate = 1.1;
  dictation(0.3, 1.1);
  dictation(0.4, 1.1);
  assert.deepEqual(L.speedAdvice(state), { change: 'down', rate: 1 });
});

test('missed words become review cards on the Leitner schedule', () => {
  const state = L.defaultTrainer();
  assert.ok(L.addCard(state, 'pünktlich', day, 'Der Zug kommt pünktlich an.'));
  assert.ok(!L.addCard(state, 'pünktlich', day));
  assert.deepEqual(L.dueCards(state, day), ['pünktlich']);
  L.gradeCard(state, 'pünktlich', true, day);
  assert.equal(state.cards['pünktlich'].box, 2);
  assert.equal(state.cards['pünktlich'].due, '2026-11-28', 'box 2 comes back after three days');
  assert.deepEqual(L.dueCards(state, day), []);
  L.gradeCard(state, 'pünktlich', false, '2026-11-26');
  assert.equal(state.cards['pünktlich'].box, 1);
  assert.ok(L.sameText('Hast du Zeit?', 'hast du zeit'));
});

test('weak sounds and frequent mistakes steer the daily round', () => {
  const ctx = context();
  const state = L.defaultTrainer();
  for (let i = 0; i < 6; i++) L.recordContrast(state, 'b-p', i === 0);
  for (let i = 0; i < 6; i++) L.recordContrast(state, 'ie-ei', true);
  assert.equal(L.weakContrasts(ctx, state)[0].contrast.id, 'b-p');
  L.recordAttempt(state, { mode: 'diktat', day, acc: 0.5, err: { number: 3, sound: 1 } });
  assert.equal(L.weakestDrill(ctx, state, day), 'zahlen');
  const round = L.planRound(ctx, state, 'B1', day);
  assert.deepEqual(round.tasks.map(task => task.mode), ['diktat', 'zahlen', 'text', 'reflexion']);
  L.addCard(state, 'Haltestelle', day);
  assert.equal(L.planRound(ctx, state, 'B1', day).tasks[0].mode, 'karten');
  state.session = L.planPlacement(day);
  assert.equal(L.currentTask(state, day).mode, 'diktat');
  for (let i = 0; i < 6; i++) L.advanceSession(state);
  assert.equal(L.currentTask(state, day).mode, 'laute');
  assert.equal(L.currentTask(state, '2026-11-26'), null, 'a session belongs to its day');
});

test('saved listening data is cleaned when loaded', () => {
  const ctx = context();
  const raw = freshState(ctx, day);
  raw.listenTrainer = {
    theta: 99, rate: 3, voice: 42, seconds: -5, placed: 'yesterday',
    attempts: [{ mode: 'diktat', day, acc: 2, err: { sound: 2, bogus: 1 } }, { mode: 'hack', day, acc: 1 }, 'x'],
    contrasts: { 'b-p': [3, 5], nope: [1, 1] },
    cards: { 'Zug': { box: 9, due: day }, '': { box: 1, due: day }, bad: { due: 'soon' } },
    reflections: [{ day, tags: ['speed', 'evil'] }],
    texts: { schlaf: { day, score: 0.5 }, missing: { day, score: 1 } },
    session: { kind: 'runde', day, at: 1, tasks: [{ mode: 'diktat', n: 3, done: 1 }, { mode: 'nope', n: 1 }] }
  };
  const state = normalizeState(raw, ctx, day).listenTrainer;
  assert.equal(state.theta, 7);
  assert.equal(state.rate, 1);
  assert.equal(state.voice, '');
  assert.equal(state.seconds, 0);
  assert.equal(state.placed, null);
  assert.deepEqual(state.attempts, [{ mode: 'diktat', day, acc: 1, err: { sound: 2 } }]);
  assert.deepEqual(state.contrasts, { 'b-p': [3, 5] });
  assert.deepEqual(state.cards, { Zug: { box: 5, due: day } });
  assert.deepEqual(state.reflections, [{ day, tags: ['speed'] }]);
  assert.deepEqual(Object.keys(state.texts), ['schlaf']);
  assert.equal(state.session.tasks.length, 1);
});

test('listening XP counts towards the daily goal and is capped', () => {
  const ctx = context();
  const state = freshState(ctx, day);
  award(ctx, state, { kind: 'listen', xp: 6 }, day);
  award(ctx, state, { kind: 'listen', xp: 500 }, day);
  assert.equal(state.xp.byDay[day], 26);
});

test('the listening content is complete and consistent', () => {
  const ctx = context();
  const { clips, contrasts, predict, casual, texts, rules } = ctx.listenTrainer;
  assert.ok(clips.length >= 50 && contrasts.length >= 10 && predict.length >= 20 && casual.length >= 20 && texts.length >= 8);
  for (const level of ['A2', 'B1', 'B2']) assert.ok(clips.some(clip => clip.level === level), level);
  for (const item of casual) assert.ok(rules[item.rule], item.id);
  for (const text of texts) for (const item of text.items) assert.ok(text.lines.some(([, line]) => line.includes(item.quote)), `${text.id}: ${item.quote}`);
});

test('the listening pages route, render and remember the last stop', () => {
  setLang('de');
  const ctx = context();
  assert.equal(parse('#hoertraining', ctx).view, 'listening-trainer');
  assert.equal(parse('#hoertraining/diktat', ctx).key, 'diktat');
  assert.equal(parse('#hoertraining/text-schlaf', ctx).key, 'text-schlaf');
  assert.equal(parse('#hoertraining/unbekannt', ctx).view, 'home');
  assert.equal(parse('#hoertraining/text-unbekannt', ctx).view, 'home');
  const state = freshState(ctx, day);
  const store = { state, update(fn) { return fn(this.state); } };
  const app = { ctx, store, get state() { return store.state; }, day: () => day, route: null, apply: () => [] };
  listening.resetLive();
  const home = listening.render(app, parse('#hoertraining', ctx));
  assert.match(home, /Einstufung Hören/);
  assert.match(home, /href="#hoertraining\/runde"/);
  assert.match(home, /Keine deutsche Stimme gefunden/, 'without speech output the page says how to get a voice');
  const dictation = listening.render(app, parse('#hoertraining/diktat', ctx));
  assert.match(dictation, /id="lis-answer"/);
  assert.match(dictation, /data-action="lis-play"/);
  const round = listening.render(app, parse('#hoertraining/runde', ctx));
  assert.match(round, /data-action="lis-start-round"/);
  listening.actions['lis-start-round']({ ...app, rerender() {}, navigate() {} });
  assert.equal(state.listenTrainer.session.kind, 'runde');
  const running = listening.render(app, parse('#hoertraining/runde', ctx));
  assert.match(running, /Schritt 1 von/);
});
