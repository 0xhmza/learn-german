// Karteikarten: decks per level, the four-grade schedule, queues, quiz,
// typing check, saved state and the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../src/js/engine/flashcards.js';
import { setLang } from '../src/js/i18n/index.js';
import { parse } from '../src/js/router.js';
import { normalizeState } from '../src/js/engine/migrate.js';
import * as page from '../src/js/views/flashcards.js';
import { context, freshState, seeded } from './support/context.js';

const day = '2026-11-25';

test('every level has decks, and B1 grammar comes from the lesson cards', () => {
  const ctx = context();
  for (const level of F.FLASH_LEVELS) assert.ok(ctx.flash.decks.some(deck => deck.level === level), level);
  const islands = ctx.flash.decks.filter(deck => deck.island);
  assert.equal(islands.length, ctx.islands.length);
  assert.equal(islands.reduce((sum, deck) => sum + deck.cards.length, 0), ctx.cards.size, 'all 156 lesson cards appear');
  assert.ok(islands.every(deck => deck.level === 'B1' && deck.kind === 'grammar' && deck.cards.every(card => card.store === 'cards')));
  assert.ok(ctx.flash.cards.size > 600);
  for (const deck of ctx.flash.decks) assert.ok(F.TONES.includes(deck.tone), deck.id);
});

test('grades move cards through the boxes', () => {
  const ctx = context();
  const state = freshState(ctx, day);
  const card = ctx.flash.byId.get('a1-familie').cards[0];
  assert.deepEqual(F.preview(null), { again: 0, hard: 1, good: 1, easy: 3 });
  F.grade(state, card, 'good', day);
  assert.deepEqual(state.flash.cards[card.id], { box: 1, due: '2026-11-26', reps: 1, lapses: 0 });
  F.grade(state, card, 'easy', '2026-11-26');
  assert.equal(state.flash.cards[card.id].box, 3);
  assert.equal(state.flash.cards[card.id].due, '2026-12-03');
  F.grade(state, card, 'again', '2026-12-03');
  assert.equal(state.flash.cards[card.id].box, 1);
  assert.equal(state.flash.cards[card.id].lapses, 1);
  assert.equal(state.flash.cards[card.id].due, '2026-12-03', 'again comes back the same day');
  assert.equal(state.flash.days[day], 1);
});

test('lesson grammar cards keep their schedule in state.cards', () => {
  const ctx = context();
  const state = freshState(ctx, day);
  const card = ctx.flash.decks.find(deck => deck.island).cards[0];
  F.grade(state, card, 'good', day);
  assert.deepEqual(state.cards[card.id], { box: 1, due: '2026-11-26' });
  assert.equal(state.flash.cards[card.id], undefined);
});

test('queues put due cards first, then new ones', () => {
  const ctx = context();
  const state = freshState(ctx, day);
  const deck = ctx.flash.byId.get('a2-reisen');
  F.grade(state, deck.cards[5], 'again', '2026-11-20');
  const queue = F.queue(state, [deck], day, { newLimit: 3 });
  assert.equal(queue[0], deck.cards[5]);
  assert.equal(queue.length, 4);
  const stats = F.deckStats(state, deck, day);
  assert.equal(stats.due, 1);
  assert.equal(stats.fresh, deck.cards.length - 1);
  assert.equal(F.cardStreak(state, '2026-11-20'), 1);
  assert.equal(F.cardStreak(state, day), 0);
});

test('quiz options are distinct and include the answer', () => {
  const ctx = context();
  const card = ctx.flash.byId.get('b1-umwelt').cards[2];
  const options = F.quizOptions(ctx, card, seeded(3));
  assert.equal(options.length, 4);
  assert.ok(options.includes(card));
  assert.equal(new Set(options.map(option => option.ar)).size, 4);
});

test('typing needs the article for nouns', () => {
  const card = { de: 'der Bahnhof' };
  assert.equal(F.checkTyped(card, 'Der Bahnhof').correct, true);
  assert.equal(F.checkTyped(card, 'Bahnhof').reason, 'noArticle');
  assert.equal(F.checkTyped(card, 'die Bahnhof').reason, 'wrongArticle');
  assert.equal(F.checkTyped({ de: 'die Tür' }, 'die Tuer').correct, true);
  assert.equal(F.checkTyped({ de: 'umsteigen' }, 'umsteigen').correct, true);
  assert.equal(F.articleOf('das Kind'), 'das');
});

test('saved flashcard data is cleaned when loaded', () => {
  const ctx = context();
  const raw = freshState(ctx, day);
  const good = ctx.flash.byId.get('a1-essen').cards[0].id;
  const lesson = ctx.flash.decks.find(deck => deck.island).cards[0].id;
  raw.flash = { cards: { [good]: { box: 9, due: day, reps: 2 }, [lesson]: { box: 1, due: day }, nope: { box: 1, due: day } }, days: { [day]: 4, bad: 2 }, lastDeck: 'missing', dir: 'xx', speak: false };
  const flash = normalizeState(raw, ctx, day).flash;
  assert.deepEqual(flash.cards, { [good]: { box: 5, due: day, reps: 2, lapses: 0 } });
  assert.deepEqual(flash.days, { [day]: 4 });
  assert.equal(flash.lastDeck, null);
  assert.equal(flash.dir, 'de');
  assert.equal(flash.speak, false);
});

test('the flashcards page routes, renders and opens a study session', () => {
  setLang('de');
  const ctx = context();
  assert.equal(parse('#karten', ctx).view, 'flashcards');
  assert.equal(parse('#karten/a1-familie', ctx).key, 'a1-familie');
  assert.equal(parse('#karten/heute', ctx).key, 'heute');
  assert.equal(parse('#karten/unbekannt', ctx).view, 'home');
  const state = freshState(ctx, day);
  const store = { state, update(fn) { return fn(this.state); } };
  let rendered = '';
  const app = { ctx, store, get state() { return store.state; }, day: () => day, reduceMotion: () => true, redrawing: false };
  app.rerender = () => { rendered = page.render(app, app.route); };
  page.reset();
  app.route = parse('#karten', ctx);
  const hub = page.render(app, app.route);
  assert.match(hub, /Karteikarten/);
  assert.match(hub, /data-action="fc-level" data-level="C1"/);
  assert.match(hub, /href="#karten\/b1-wohnen"/, 'the course level B1 is shown first');
  app.route = parse('#karten/a1-familie', ctx);
  const deck = page.render(app, app.route);
  assert.match(deck, /data-action="fc-start"/);
  assert.match(deck, /fc-art fc-die/, 'articles are coloured');
  page.actions['fc-start'](app);
  assert.match(rendered, /class="fc-session/);
  assert.match(rendered, /Karte 1 von 12/);
  assert.equal(state.flash.lastDeck, 'a1-familie');
  page.reset();
});
