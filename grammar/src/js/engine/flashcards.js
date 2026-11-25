// Karteikarten: decks per level and topic, a spaced-repetition schedule
// with four grades, study queues, quiz options and the typing check.
// The B1 grammar decks reuse the grammar flashcards of the lessons and
// share their review dates (state.cards) with the lesson card page.
import { addDays, isDay } from '../dates.js';
import { INTERVALS } from './srs.js';

export const FLASH_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
export const KINDS = ['vocab', 'verbs', 'grammar', 'phrases'];
export const GRADES = ['again', 'hard', 'good', 'easy'];
export const TONES = ['rose', 'lime', 'amber', 'sky', 'violet', 'teal', 'indigo', 'orange', 'pink', 'slate'];
const MAX_CARDS = 5000;
const KEEP_DAYS = 400;
const ISLAND_TONES = { lilac: 'violet', peach: 'orange', mint: 'teal', blue: 'sky', pink: 'pink', yellow: 'amber', sky: 'sky', sand: 'amber', coral: 'rose', teal: 'teal' };

const slug = text => String(text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

// Builds every deck from the level files and the lesson flashcards.
export function buildFlash(rawLevels = [], ctx) {
  const decks = [];
  for (const file of rawLevels) {
    for (const deck of file.decks || []) {
      const cards = deck.cards.map(([de, ar, extra, example]) => {
        const card = { id: `${deck.id}~${slug(de)}`, deck: deck.id, kind: deck.kind, de, ar, extra: extra || '', example: example || '', store: 'flash' };
        if (deck.kind === 'grammar') card.answer = { de: extra, ar: extra };
        return card;
      });
      decks.push({ id: deck.id, level: file.level, kind: deck.kind, emoji: deck.emoji, tone: deck.tone, title: deck.title, cards });
    }
  }
  // B1 grammar: one deck per grammar island, made of the lesson cards.
  for (const island of ctx?.islands || []) {
    const cards = ctx.islandLessons(island.id).flatMap(lesson => (ctx.decks.get(lesson.id) || []).map(card => {
      const q = ctx.questions.get(`card-${card.id}`);
      return { id: card.id, deck: `b1-insel-${island.id}`, kind: 'grammar', lesson: lesson.id, store: 'cards',
        de: q.i18n.de.prompt, ar: q.i18n.ar.prompt, answer: { de: q.i18n.de.explain, ar: q.i18n.ar.explain }, extra: '', example: '' };
    }));
    if (cards.length) decks.push({ id: `b1-insel-${island.id}`, level: 'B1', kind: 'grammar', emoji: island.emoji, tone: ISLAND_TONES[island.palette] || 'indigo', title: island.name, island: island.id, cards });
  }
  const order = deck => FLASH_LEVELS.indexOf(deck.level) * 10 + KINDS.indexOf(deck.kind);
  decks.sort((a, b) => order(a) - order(b));
  const cards = new Map(decks.flatMap(deck => deck.cards.map(card => [card.id, card])));
  return { decks, byId: new Map(decks.map(deck => [deck.id, deck])), cards };
}

// ── State ───────────────────────────────────────────────────────────────

export function defaultFlash() {
  return { cards: {}, days: {}, lastDeck: null, dir: 'de', speak: true };
}

const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const count = (value, max) => (Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0);

export function normalizeFlash(raw, ctx) {
  const flash = defaultFlash();
  if (!plain(raw)) return flash;
  const known = ctx.flash?.cards;
  for (const [id, value] of Object.entries(plain(raw.cards) ? raw.cards : {}).slice(-MAX_CARDS)) {
    if (!known?.has(id) || known.get(id).store !== 'flash' || !plain(value) || !isDay(value.due)) continue;
    flash.cards[id] = { box: count(value.box, 5), due: value.due, reps: count(value.reps, 1e5), lapses: count(value.lapses, 1e5) };
  }
  for (const [day, value] of Object.entries(plain(raw.days) ? raw.days : {}).slice(-KEEP_DAYS)) {
    if (isDay(day) && count(value, 1e5)) flash.days[day] = count(value, 1e5);
  }
  if (ctx.flash?.byId.has(raw.lastDeck)) flash.lastDeck = raw.lastDeck;
  flash.dir = raw.dir === 'ar' ? 'ar' : 'de';
  flash.speak = raw.speak !== false;
  return flash;
}

// The saved schedule of a card, wherever it lives.
export const recordOf = (state, card) => (card.store === 'cards' ? state.cards[card.id] : state.flash.cards[card.id]) || null;

// Days until the card comes back for each grade, shown on the buttons.
export function preview(record) {
  const box = record?.box || 0;
  return {
    again: 0,
    hard: box <= 1 ? 1 : Math.max(1, Math.round(INTERVALS[box] / 2)),
    good: INTERVALS[Math.min(5, box + 1)],
    easy: INTERVALS[Math.min(5, box + 2)]
  };
}

// Applies a grade. "again" shows the card once more in this session.
export function grade(state, card, value, day) {
  const record = recordOf(state, card) || {};
  const days = preview(record)[value];
  const box = value === 'again' ? 1 : value === 'hard' ? Math.max(1, record.box || 0) : value === 'good' ? Math.min(5, (record.box || 0) + 1) : Math.min(5, (record.box || 0) + 2);
  const next = { box, due: addDays(day, days) };
  if (card.store === 'cards') state.cards[card.id] = next;
  else {
    state.flash.cards[card.id] = { ...next, reps: (record.reps || 0) + 1, lapses: (record.lapses || 0) + (value === 'again' && record.box ? 1 : 0) };
    const keys = Object.keys(state.flash.cards);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_CARDS))) delete state.flash.cards[old];
  }
  state.flash.days[day] = (state.flash.days[day] || 0) + 1;
  const days400 = Object.keys(state.flash.days);
  if (days400.length > KEEP_DAYS) days400.sort().slice(0, days400.length - KEEP_DAYS).forEach(old => delete state.flash.days[old]);
  return next;
}

export function deckStats(state, deck, day) {
  let fresh = 0;
  let due = 0;
  let mastered = 0;
  for (const card of deck.cards) {
    const record = recordOf(state, card);
    if (!record) fresh += 1;
    else {
      if (record.due <= day) due += 1;
      if (record.box >= 4) mastered += 1;
    }
  }
  const total = deck.cards.length;
  return { total, fresh, due, learned: total - fresh, mastered, percent: Math.round(mastered / Math.max(1, total) * 100) };
}

// Due cards first (oldest first), then new cards in deck order.
export function queue(state, decks, day, { newLimit = 10, limit = 30 } = {}) {
  const due = [];
  const fresh = [];
  for (const deck of decks) {
    for (const card of deck.cards) {
      const record = recordOf(state, card);
      if (!record) fresh.push(card);
      else if (record.due <= day) due.push({ card, due: record.due });
    }
  }
  due.sort((a, b) => a.due.localeCompare(b.due));
  return [...due.map(entry => entry.card), ...fresh.slice(0, newLimit)].slice(0, limit);
}

export function totals(ctx, state, day, level = null) {
  const decks = level ? ctx.flash.decks.filter(deck => deck.level === level) : ctx.flash.decks;
  return decks.reduce((sum, deck) => {
    const stats = deckStats(state, deck, day);
    return { total: sum.total + stats.total, due: sum.due + stats.due, learned: sum.learned + stats.learned, mastered: sum.mastered + stats.mastered };
  }, { total: 0, due: 0, learned: 0, mastered: 0 });
}

// Days in a row with at least one card, counting today or yesterday.
export function cardStreak(state, day) {
  let streak = 0;
  let cursor = state.flash.days[day] ? day : addDays(day, -1);
  while (state.flash.days[cursor]) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// ── Quiz and typing ─────────────────────────────────────────────────────

export const supportsQuiz = deck => deck.kind !== 'grammar' && deck.cards.length >= 4;
export const supportsTyping = deck => deck.kind === 'vocab' || deck.kind === 'verbs';

// Three wrong answers from the same deck, then from the same level.
export function quizOptions(ctx, card, rng = Math.random, field = 'ar') {
  const deck = ctx.flash.byId.get(card.deck);
  const pool = [...deck.cards, ...ctx.flash.decks.filter(other => other.level === deck.level && other.kind === deck.kind && other !== deck).flatMap(other => other.cards)];
  const seen = new Set([card[field]]);
  const wrong = [];
  for (const other of pool.map(item => [rng(), item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item)) {
    if (wrong.length === 3) break;
    if (seen.has(other[field])) continue;
    seen.add(other[field]);
    wrong.push(other);
  }
  return [card, ...wrong].map(item => [rng(), item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
}

const ARTICLE = /^(der|die|das)\s+/i;
const fold = text => String(text ?? '').normalize('NFC').toLowerCase().trim()
  .replace(/[.,!?;:„“"…]/g, '').replace(/\s+/g, ' ')
  .replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü').replace(/ß/g, 'ss');

// Checks a typed German answer. Nouns need their article.
export function checkTyped(card, typed) {
  const want = fold(card.de);
  const got = fold(typed);
  if (!got) return { correct: false, reason: 'empty' };
  if (got === want) return { correct: true, reason: 'exact' };
  const article = ARTICLE.exec(card.de);
  if (article) {
    const noun = want.replace(ARTICLE, '');
    if (got === noun) return { correct: false, reason: 'noArticle' };
    if (got.replace(ARTICLE, '') === noun) return { correct: false, reason: 'wrongArticle' };
  }
  return { correct: false, reason: 'wrong' };
}

export const articleOf = text => ARTICLE.exec(text)?.[1].toLowerCase() || null;
