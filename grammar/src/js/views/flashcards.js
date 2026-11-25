// Karteikarten: a page only for flashcards. The hub shows the decks of a
// level by topic; a deck page chooses how to study; the study session
// opens in focus mode with a flipping card, swipe gestures, a quiz and a
// typing mode, and ends with a short summary.
import { t, num, getLang } from '../i18n/index.js';
import { esc, prose, link, button, crumbs } from '../components/html.js';
import { icons } from '../components/icons.js';
import { currentLevel } from '../engine/areas.js';
import { award as awardEvent } from '../engine/gamification.js';
import * as F from '../engine/flashcards.js';
import { speak, stopAudio, chooseVoice, germanVoices } from '../components/speech.js';

const MODES = ['flip', 'quiz', 'type'];
const SWIPE = 90;
let session = null;
let hub = { level: null, kind: 'all' };
const pref = { mode: 'flip' };

const flash = app => app.ctx.flash;
const lang = () => getLang();
const titleOf = deck => deck.title[lang()] || deck.title.de;
const otherTitle = deck => deck.title[lang() === 'de' ? 'ar' : 'de'];
const kindName = kind => t('fcKinds')[kind];
const reduce = app => app.reduceMotion?.() ?? false;

export function title(app, route) {
  const deck = flash(app).byId.get(route.key);
  return deck ? titleOf(deck) : t('fcTitle');
}

// German text with the article coloured by gender.
function german(text) {
  const article = F.articleOf(text);
  if (!article) return `<bdi lang="de" dir="ltr">${esc(text)}</bdi>`;
  return `<bdi lang="de" dir="ltr"><span class="fc-art fc-${article}">${esc(text.slice(0, article.length))}</span>${esc(text.slice(article.length))}</bdi>`;
}

function ring(percent, size = 46) {
  return `<span class="fc-ring" style="--p:${percent};--s:${size}px" role="img" aria-label="${esc(t('fcMasteredPercent', num(percent)))}"><b>${num(percent)}<small>%</small></b></span>`;
}

// ── Hub ─────────────────────────────────────────────────────────────────

function heroCards(app) {
  const day = app.day();
  const picks = F.queue(app.state, flash(app).decks.filter(deck => deck.kind === 'vocab' && deck.level === hub.level), day, { newLimit: 3, limit: 3 });
  const words = (picks.length ? picks : flash(app).decks.find(deck => deck.kind === 'vocab')?.cards.slice(0, 3) || []).slice(0, 3);
  return `<div class="fc-hero-art" aria-hidden="true">${words.map((card, i) => `<div class="fc-float fc-float-${i}"><span lang="de" dir="ltr">${esc(card.de)}</span><small lang="ar" dir="rtl">${esc(card.ar)}</small></div>`).join('')}</div>`;
}

function deckTile(app, deck, i) {
  const stats = F.deckStats(app.state, deck, app.day());
  return `<li style="--i:${i}"><a class="fc-deck tone-${deck.tone}" href="#karten/${deck.id}">
    <span class="fc-deck-top"><span class="fc-emoji" aria-hidden="true">${esc(deck.emoji)}</span>${ring(stats.percent)}</span>
    <strong>${esc(titleOf(deck))}</strong>
    <small class="fc-deck-sub" lang="${lang() === 'de' ? 'ar' : 'de'}" dir="${lang() === 'de' ? 'rtl' : 'ltr'}">${esc(otherTitle(deck))}</small>
    <span class="fc-deck-meta"><span class="fc-chip">${kindName(deck.kind)}</span><span>${t('fcCardsN', num(stats.total))}</span>
      ${stats.due ? `<span class="fc-due">${t('fcDueN', num(stats.due))}</span>` : stats.fresh === stats.total ? `<span class="fc-new">${t('fcNew')}</span>` : ''}</span>
  </a></li>`;
}

function hubPage(app) {
  const day = app.day();
  hub.level ||= F.FLASH_LEVELS.includes(currentLevel(app.state)) ? currentLevel(app.state) : 'A1';
  const all = F.totals(app.ctx, app.state, day);
  const streak = F.cardStreak(app.state, day);
  const todayQueue = todayCards(app);
  const levelDecks = flash(app).decks.filter(deck => deck.level === hub.level);
  const shown = levelDecks.filter(deck => hub.kind === 'all' || deck.kind === hub.kind);
  const last = flash(app).byId.get(app.state.flash.lastDeck);
  const kinds = ['all', ...F.KINDS.filter(kind => levelDecks.some(deck => deck.kind === kind))];
  if (!kinds.includes(hub.kind)) hub.kind = 'all';
  return `<section class="fc-hero">
      <div class="fc-hero-copy">
        <p class="fc-eyebrow">${icons.cards}<span>${t('fcEyebrow', num(flash(app).decks.length), num(flash(app).cards.size))}</span></p>
        <h1>${t('fcTitle')}</h1>
        <p>${t('fcIntro')}</p>
        <ul class="fc-stats">
          <li><strong>${num(all.due)}</strong><span>${t('fcStatDue')}</span></li>
          <li><strong>${num(all.learned)}</strong><span>${t('fcStatLearned')}</span></li>
          <li><strong>${num(all.mastered)}</strong><span>${t('fcStatMastered')}</span></li>
          <li><strong>${num(streak)}</strong><span>${t('fcStatStreak')}</span></li>
        </ul>
        <div class="actions">
          ${todayQueue.length ? button('fc-today', `${icons.sparkle}<span>${t('fcToday', num(todayQueue.length))}</span>`, 'primary fc-cta') : `<span class="fc-done-today">${icons.check}${t('fcAllDone')}</span>`}
          ${last ? link(`karten/${last.id}`, `${esc(last.emoji)} ${t('fcContinueDeck', esc(titleOf(last)))}`, 'secondary') : ''}
        </div>
      </div>
      ${heroCards(app)}
    </section>
    <div class="fc-toolbar">
      <div class="fc-levels" role="group" aria-label="${esc(t('fcLevel'))}">${F.FLASH_LEVELS.map(level => {
        const stats = F.totals(app.ctx, app.state, day, level);
        return `<button type="button" class="fc-level ${level === hub.level ? 'on' : ''}" data-action="fc-level" data-level="${level}" aria-pressed="${level === hub.level}">
          <b lang="de" dir="ltr">${level}</b><small>${t('fcCardsN', num(stats.total))}</small>${stats.due ? '<i class="fc-dot" aria-hidden="true"></i>' : ''}</button>`;
      }).join('')}</div>
      <div class="fc-kinds" role="group" aria-label="${esc(t('fcTopic'))}">${kinds.map(kind => `<button type="button" class="fc-kind ${kind === hub.kind ? 'on' : ''}" data-action="fc-kind" data-kind="${kind}" aria-pressed="${kind === hub.kind}">${kind === 'all' ? t('fcAll') : kindName(kind)}</button>`).join('')}</div>
    </div>
    <h2 class="fc-section-title">${t('fcLevelDecks', hub.level, t('levelNames')[hub.level] || '')}</h2>
    <ul class="fc-grid">${shown.map((deck, i) => deckTile(app, deck, i)).join('')}</ul>
    <p class="fc-foot">${t('fcFoot')} ${link('cards', t('fcLessonCards'), 'quiet')}</p>`;
}

// ── Deck page ───────────────────────────────────────────────────────────

function modeAvailable(deck, mode) {
  return mode === 'flip' || (mode === 'quiz' && F.supportsQuiz(deck)) || (mode === 'type' && F.supportsTyping(deck));
}

function deckPage(app, deck) {
  const day = app.day();
  const stats = F.deckStats(app.state, deck, day);
  const mode = modeAvailable(deck, pref.mode) ? pref.mode : 'flip';
  const studyCount = F.queue(app.state, [deck], day, { newLimit: 12, limit: 25 }).length;
  const settings = app.state.flash;
  const card = c => {
    const record = F.recordOf(app.state, c);
    const box = record?.box || 0;
    const front = deck.kind === 'grammar' ? prose(c[lang()] || c.de) : german(c.de);
    const back = deck.kind === 'grammar' ? prose(c.answer[lang()] || c.answer.de) : `<span lang="ar" dir="rtl">${esc(c.ar)}</span>`;
    return `<li class="fc-mini ${record && record.due <= day ? 'due' : ''}">
      <span class="fc-mini-front">${front}</span><span class="fc-mini-back">${back}</span>
      <span class="fc-boxes" role="img" aria-label="${esc(t('fcStrength', num(box)))}">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= box ? 'on' : ''}"></i>`).join('')}</span>
      ${deck.kind === 'grammar' ? '' : `<button type="button" class="icon-btn fc-say-mini" data-action="fc-say" data-say="${esc(c.de)}" aria-label="${esc(t('fcListen', c.de))}">${icons.play}</button>`}
    </li>`;
  };
  return `${crumbs([['karten', t('fcTitle')], [null, esc(titleOf(deck))]])}
    <section class="fc-deck-head tone-${deck.tone}">
      <span class="fc-deck-emoji" aria-hidden="true">${esc(deck.emoji)}</span>
      <div class="fc-deck-copy"><p class="fc-chips"><span class="fc-chip" lang="de" dir="ltr">${deck.level}</span><span class="fc-chip">${kindName(deck.kind)}</span></p>
        <h1>${esc(titleOf(deck))}</h1><p class="fc-deck-sub">${esc(otherTitle(deck))}</p></div>
      <div class="fc-deck-progress">${ring(stats.percent, 84)}
        <ul><li>${t('fcCardsN', num(stats.total))}</li><li>${t('fcDueN', num(stats.due))}</li><li>${t('fcNewN', num(stats.fresh))}</li></ul></div>
    </section>
    <section class="panel fc-setup" aria-labelledby="fc-setup-title">
      <h2 id="fc-setup-title">${t('fcHowStudy')}</h2>
      <div class="fc-modes" role="group" aria-label="${esc(t('fcHowStudy'))}">${MODES.map(item => {
        const ok = modeAvailable(deck, item);
        return `<button type="button" class="fc-mode ${item === mode ? 'on' : ''}" data-action="fc-mode" data-mode="${item}" aria-pressed="${item === mode}" ${ok ? '' : 'disabled'}>
          <span class="fc-mode-icon" aria-hidden="true">${{ flip: '🔄', quiz: '🎯', type: '⌨️' }[item]}</span><strong>${t('fcModes')[item]}</strong><small>${t('fcModeHow')[item]}</small></button>`;
      }).join('')}</div>
      <div class="fc-options">
        ${deck.kind === 'grammar' ? '' : `<div class="fc-switch" role="group" aria-label="${esc(t('fcDirection'))}"><span>${t('fcDirection')}</span>
          ${['de', 'ar'].map(dir => `<button type="button" data-action="fc-dir" data-dir="${dir}" aria-pressed="${settings.dir === dir}">${t('fcDir')[dir]}</button>`).join('')}</div>`}
        <label class="fc-toggle"><input type="checkbox" data-fc-speak ${settings.speak ? 'checked' : ''}> <span>${t('fcAutoSpeak')}</span></label>
      </div>
      <div class="actions fc-start">
        ${studyCount ? button('fc-start', `${icons.play}<span>${t('fcStart', num(studyCount))}</span>`, 'primary fc-cta') : `<span class="fc-done-today">${icons.check}${t('fcDeckDone')}</span>`}
        ${button('fc-start-all', t('fcStartAll', num(stats.total)), studyCount ? 'secondary' : 'primary')}
      </div>
      <p class="fc-hint">${t('fcKeys')}</p>
    </section>
    <h2 class="fc-section-title">${t('fcAllCards')}</h2>
    <ul class="fc-list">${deck.cards.map(card).join('')}</ul>`;
}

// ── Session ─────────────────────────────────────────────────────────────

function todayCards(app) {
  const level = hub.level || currentLevel(app.state);
  const decks = flash(app).decks;
  const due = F.queue(app.state, decks, app.day(), { newLimit: 0, limit: 40 });
  const fresh = F.queue(app.state, decks.filter(deck => deck.level === level), app.day(), { newLimit: 8, limit: 40 }).filter(card => !F.recordOf(app.state, card));
  return [...due, ...fresh].slice(0, 30);
}

function makeSession(app, route, cards, { title: heading, deck = null, mode = 'flip' }) {
  const usable = deck && !modeAvailable(deck, mode) ? 'flip' : mode;
  session = { route: route.hash, heading, deck: deck?.id || null, mode: usable, cards, index: 0, flipped: false,
    counts: { again: 0, hard: 0, good: 0, easy: 0 }, requeued: new Set(), wrong: [], answered: null, spoken: -1, done: false };
  prepare(app);
}

function open(app, cards, options) {
  if (!cards.length) return;
  makeSession(app, app.route, cards, options);
  if (options.deck) app.store.update(state => { state.flash.lastDeck = options.deck.id; });
  app.rerender({ keepScroll: true });
}

// Per-card setup: quiz options or a fresh typing field.
function prepare(app) {
  const card = session.cards[session.index];
  session.flipped = false;
  session.answered = null;
  session.typed = '';
  if (!card) return;
  const deck = flash(app).byId.get(card.deck);
  session.cardMode = session.mode === 'quiz' && F.supportsQuiz(deck) ? 'quiz' : session.mode === 'type' && F.supportsTyping(deck) ? 'type' : 'flip';
  if (session.cardMode === 'quiz') session.options = F.quizOptions(app.ctx, card, Math.random, app.state.flash.dir === 'de' ? 'ar' : 'de');
}

function close(app) {
  stopAudio();
  session = null;
  document.body.classList.remove('fc-open');
  // #karten/heute opens today's cards; closing goes back to the hub.
  if (app.route.key === 'heute') app.navigate('karten');
  else app.rerender();
}

function face(app, card, side) {
  const deck = flash(app).byId.get(card.deck);
  // Typing always asks for the German word, so the Arabic side comes first.
  const dir = session?.cardMode === 'type' ? 'ar' : app.state.flash.dir;
  const sayBtn = text => `<button type="button" class="fc-say" data-action="fc-say" data-say="${esc(text)}" aria-label="${esc(t('fcListen', text))}">${icons.play}</button>`;
  if (deck.kind === 'grammar') {
    return side === 'front'
      ? `<span class="fc-kind-label">${kindName('grammar')}</span><p class="fc-prompt">${prose(card[lang()] || card.de)}</p>`
      : `<span class="fc-kind-label">${t('fcAnswer')}</span><p class="fc-answer">${prose(card.answer[lang()] || card.answer.de)}</p>`;
  }
  const germanSide = `<span class="fc-kind-label">${kindName(deck.kind)}</span><p class="fc-word">${german(card.de)}</p>${sayBtn(card.de)}`;
  const arabicSide = `<span class="fc-kind-label">${t('fcMeaning')}</span><p class="fc-meaning" lang="ar" dir="rtl">${esc(card.ar)}</p>`;
  const details = `${card.extra && card.extra !== '—' ? `<p class="fc-extra">${deck.kind === 'vocab' && F.articleOf(card.de) ? `${t('fcPlural')} ` : ''}${german(card.extra)}</p>` : ''}
    ${card.example ? `<p class="fc-example" lang="de" dir="ltr">${esc(card.example)} ${sayBtn(card.example)}</p>` : ''}`;
  if (side === 'front') return dir === 'de' ? germanSide : arabicSide;
  return dir === 'de' ? `${arabicSide}${details}` : `<span class="fc-kind-label">${kindName(deck.kind)}</span><p class="fc-word">${german(card.de)}</p>${sayBtn(card.de)}${details}`;
}

function gradeBar(app, card) {
  const days = F.preview(F.recordOf(app.state, card));
  const label = n => (n === 0 ? t('fcNow') : t('fcInDays', num(n)));
  return `<div class="fc-grades" role="group" aria-label="${esc(t('fcHowWell'))}">${F.GRADES.map((value, i) => `<button type="button" class="fc-grade g-${value}" data-action="fc-grade" data-grade="${value}">
    <kbd aria-hidden="true">${i + 1}</kbd><strong>${t('fcGrades')[value]}</strong><small>${label(days[value])}</small></button>`).join('')}</div>`;
}

function quizBody(app, card) {
  const field = app.state.flash.dir === 'de' ? 'ar' : 'de';
  return `<div class="fc-quiz" role="group" aria-label="${esc(t('fcChoose'))}">${session.options.map((option, i) => {
    const state = session.answered ? (option === card ? 'right' : option.id === session.answered ? 'wrong' : '') : '';
    return `<button type="button" class="fc-choice ${state}" data-action="fc-choose" data-card="${esc(option.id)}" ${session.answered ? 'disabled' : ''}
      ${field === 'ar' ? 'lang="ar" dir="rtl"' : 'lang="de" dir="ltr"'}><kbd aria-hidden="true">${i + 1}</kbd><span>${field === 'ar' ? esc(option.ar) : german(option.de)}</span></button>`;
  }).join('')}</div>`;
}

function typeBody(card) {
  const result = session.answered ? session.check : null;
  return `<form class="fc-type" data-fc-type>
    <label for="fc-typed">${t('fcTypeLabel')}</label>
    <input id="fc-typed" lang="de" dir="ltr" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(session.typed || '')}" ${result ? 'readonly' : ''}>
    ${result ? `<p class="fc-type-result ${result.correct ? 'good' : 'bad'}" role="status">${result.correct ? t('fcRight') : t('fcTypeReasons')[result.reason]} · ${german(card.de)}</p>`
      : `<div class="fc-keys">${['ä', 'ö', 'ü', 'ß'].map(ch => `<button type="button" class="fc-key" data-action="fc-char" data-char="${ch}" lang="de">${ch}</button>`).join('')}</div>
         <button type="submit" class="btn primary">${t('fcCheck')}</button>`}
  </form>`;
}

function sessionMarkup(app) {
  if (session.done) return summary(app);
  const card = session.cards[session.index];
  const deck = flash(app).byId.get(card.deck);
  const total = session.cards.length;
  const position = session.index + 1;
  const mode = session.cardMode;
  const answered = Boolean(session.answered);
  const flipped = mode === 'flip' ? session.flipped : answered;
  return `<div class="fc-session ${flipped ? 'is-flipped' : ''} mode-${mode}" role="dialog" aria-modal="true" aria-labelledby="fc-session-title">
    <div class="fc-session-top">
      <button type="button" class="icon-btn fc-close" data-action="fc-close" aria-label="${esc(t('fcClose'))}">${icons.close}</button>
      <div class="fc-session-title"><strong id="fc-session-title">${esc(session.heading)}</strong><small>${t('fcCardOf', num(position), num(total))}</small></div>
      <span class="fc-session-count" aria-hidden="true">${num(session.counts.good + session.counts.easy)} ✓</span>
    </div>
    <div class="fc-progress" aria-hidden="true"><i style="inline-size:${Math.round(session.index / total * 100)}%"></i></div>
    <div class="fc-stage">
      <div class="fc-ghost g2 tone-${deck.tone}" aria-hidden="true"></div><div class="fc-ghost g1 tone-${deck.tone}" aria-hidden="true"></div>
      <div class="fc-card tone-${deck.tone} ${flipped ? 'flipped' : ''} ${reduce(app) ? 'still' : ''}" data-fc-card ${mode === 'flip' ? `data-action="fc-flip" role="button" tabindex="0" aria-label="${esc(t(flipped ? 'fcFlipBack' : 'fcFlip'))}"` : ''}>
        <div class="fc-face fc-front"><span class="fc-deck-tag">${esc(deck.emoji)} ${esc(titleOf(deck))}</span>${face(app, card, 'front')}${mode === 'flip' ? `<span class="fc-tap">${t('fcTapHint')}</span>` : ''}</div>
        <div class="fc-face fc-back"><span class="fc-deck-tag">${esc(deck.emoji)} ${esc(titleOf(deck))}</span>${face(app, card, 'back')}</div>
      </div>
      ${mode === 'flip' ? `<span class="fc-swipe-hint left" aria-hidden="true">${t('fcGrades').again}</span><span class="fc-swipe-hint right" aria-hidden="true">${t('fcGrades').good}</span>` : ''}
    </div>
    <div class="fc-controls" aria-live="polite">
      ${mode === 'flip' ? (flipped ? gradeBar(app, card) : `<button type="button" class="btn primary fc-flip-btn" data-action="fc-flip">${t('fcShow')} <kbd aria-hidden="true">␣</kbd></button>`)
        : mode === 'quiz' ? `${quizBody(app, card)}${answered ? `<button type="button" class="btn primary fc-next" data-action="fc-next">${t('fcNext')}</button>` : ''}`
        : `${typeBody(card)}${answered ? `<button type="button" class="btn primary fc-next" data-action="fc-next">${t('fcNext')}</button>` : ''}`}
    </div>
  </div>`;
}

function summary(app) {
  const { counts } = session;
  const total = counts.again + counts.hard + counts.good + counts.easy;
  const known = counts.good + counts.easy;
  const percent = Math.round(known / Math.max(1, total) * 100);
  const confetti = reduce(app) ? '' : `<div class="fc-confetti" aria-hidden="true">${Array.from({ length: 28 }, (_, i) => `<i style="--x:${(i * 37) % 100};--d:${(i % 7) * 0.12}s;--r:${(i * 53) % 360}deg;--c:${i % 5}"></i>`).join('')}</div>`;
  const deck = flash(app).byId.get(session.deck);
  const nextDeck = deck && flash(app).decks.filter(other => other.level === deck.level && other.id !== deck.id).find(other => F.deckStats(app.state, other, app.day()).fresh > 0);
  return `<div class="fc-session fc-summary" role="dialog" aria-modal="true" aria-labelledby="fc-summary-title">
    ${confetti}
    <div class="fc-summary-card">
      ${ring(percent, 120)}
      <h2 id="fc-summary-title" tabindex="-1">${percent >= 80 ? t('fcGreat') : percent >= 50 ? t('fcGood') : t('fcKeepGoing')}</h2>
      <p>${t('fcSummary', num(total), num(known))}</p>
      <ul class="fc-summary-grades">${F.GRADES.map(value => `<li class="g-${value}"><strong>${num(counts[value])}</strong><span>${t('fcGrades')[value]}</span></li>`).join('')}</ul>
      <div class="actions">
        ${session.wrong.length ? button('fc-retry', t('fcRetry', num(session.wrong.length)), 'primary') : ''}
        ${nextDeck ? link(`karten/${nextDeck.id}`, `${esc(nextDeck.emoji)} ${t('fcNextDeck')}`, session.wrong.length ? 'secondary' : 'primary', 'data-action="fc-close-link"') : ''}
        ${button('fc-close', t('fcBackToDecks'), 'secondary')}
      </div>
    </div>
  </div>`;
}

// Records a grade, then moves the card out of the way and shows the next.
function rate(app, value, direction = null) {
  if (!session || session.done) return;
  const card = session.cards[session.index];
  let notes = [];
  app.store.update(state => {
    F.grade(state, card, value, app.day());
    if (value === 'good' || value === 'easy') notes = awardEvent(app.ctx, state, { kind: 'flash', xp: 1 }, app.day());
  });
  app.toast?.(notes.filter(note => note.type !== 'xp'));
  session.counts[value] += 1;
  if (value === 'again') {
    if (!session.wrong.includes(card)) session.wrong.push(card);
    if (!session.requeued.has(card.id)) {
      session.requeued.add(card.id);
      session.cards.push(card);
    }
  }
  const el = document.querySelector('[data-fc-card]');
  const out = direction || (value === 'again' ? 'left' : 'right');
  const finish = () => {
    session.index += 1;
    if (session.index >= session.cards.length) session.done = true;
    else prepare(app);
    app.rerender();
    focusSession();
  };
  if (el && !reduce(app)) {
    el.classList.add(`out-${out}`);
    setTimeout(finish, 260);
  } else finish();
}

function focusSession() {
  const target = document.querySelector('.fc-summary h2, #fc-typed:not([readonly]), .fc-next, .fc-grade.g-good, .fc-flip-btn, .fc-choice');
  target?.focus({ preventScroll: true });
}

function flip(app) {
  if (!session || session.cardMode !== 'flip') return;
  session.flipped = !session.flipped;
  const root = document.querySelector('.fc-session');
  const card = document.querySelector('[data-fc-card]');
  card?.classList.toggle('flipped', session.flipped);
  root?.classList.toggle('is-flipped', session.flipped);
  const controls = document.querySelector('.fc-controls');
  const current = session.cards[session.index];
  if (controls) controls.innerHTML = session.flipped ? gradeBar(app, current) : `<button type="button" class="btn primary fc-flip-btn" data-action="fc-flip">${t('fcShow')} <kbd aria-hidden="true">␣</kbd></button>`;
  card?.setAttribute('aria-label', t(session.flipped ? 'fcFlipBack' : 'fcFlip'));
  if (session.flipped && app.state.flash.dir === 'ar' && app.state.flash.speak) say(app, current.de);
  document.querySelector('.fc-grade.g-good')?.focus({ preventScroll: true });
}

function say(app, text) {
  if (!germanVoices().length) return;
  speak(text, { voice: chooseVoice({ voice: app.state.listenTrainer?.voice || '', vary: false }) });
}

function check(app, typed) {
  const card = session.cards[session.index];
  session.typed = typed;
  session.check = F.checkTyped(card, typed);
  session.answered = card.id;
  session.correct = session.check.correct;
  app.rerender();
  focusSession();
  say(app, card.de);
}

export function render(app, route) {
  if (session && session.route !== route.hash) session = null;
  const deck = flash(app).byId.get(route.key);
  // #karten/heute (from the dashboard) opens today's cards directly.
  if (route.key === 'heute' && !session && !app.redrawing) {
    const cards = todayCards(app);
    if (cards.length) makeSession(app, route, cards, { title: t('fcTodayTitle') });
  }
  const page = deck ? deckPage(app, deck) : hubPage(app);
  return `<div class="fc-page">${page}</div>${session ? sessionMarkup(app) : ''}`;
}

export const actions = {
  'fc-level'(app, target) { hub.level = target.dataset.level; app.rerender(); document.querySelector(`[data-level="${hub.level}"]`)?.focus(); },
  'fc-kind'(app, target) { hub.kind = target.dataset.kind; app.rerender(); document.querySelector(`[data-kind="${hub.kind}"]`)?.focus(); },
  'fc-mode'(app, target) { pref.mode = target.dataset.mode; app.rerender(); document.querySelector(`[data-mode="${pref.mode}"]`)?.focus(); },
  'fc-dir'(app, target) {
    app.store.update(state => { state.flash.dir = target.dataset.dir === 'ar' ? 'ar' : 'de'; });
    app.rerender();
    document.querySelector(`[data-dir="${app.state.flash.dir}"]`)?.focus();
  },
  'fc-today'(app) { open(app, todayCards(app), { title: t('fcTodayTitle'), mode: 'flip' }); },
  'fc-start'(app) {
    const deck = flash(app).byId.get(app.route.key);
    open(app, F.queue(app.state, [deck], app.day(), { newLimit: 12, limit: 25 }), { title: titleOf(deck), deck, mode: pref.mode });
  },
  'fc-start-all'(app) {
    const deck = flash(app).byId.get(app.route.key);
    open(app, [...deck.cards].sort(() => Math.random() - 0.5), { title: titleOf(deck), deck, mode: pref.mode });
  },
  'fc-retry'(app) {
    const deck = flash(app).byId.get(session.deck);
    open(app, [...session.wrong], { title: session.heading, deck, mode: session.mode });
  },
  'fc-close': app => close(app),
  'fc-close-link'(app, target) {
    session = null;
    document.body.classList.remove('fc-open');
    app.navigate(target.getAttribute('href').slice(1));
  },
  'fc-flip': app => flip(app),
  'fc-grade': (app, target) => rate(app, target.dataset.grade),
  'fc-next'(app) { rate(app, session.correct ? 'good' : 'again'); },
  'fc-choose'(app, target) {
    if (!session || session.answered) return;
    const card = session.cards[session.index];
    session.answered = target.dataset.card;
    session.correct = target.dataset.card === card.id;
    app.rerender();
    focusSession();
    say(app, card.de);
  },
  'fc-say': (app, target) => say(app, target.dataset.say),
  'fc-char'(app, target) {
    const input = document.querySelector('#fc-typed');
    if (!input) return;
    const at = input.selectionStart ?? input.value.length;
    input.value = input.value.slice(0, at) + target.dataset.char + input.value.slice(input.selectionEnd ?? at);
    input.focus();
    input.setSelectionRange(at + 1, at + 1);
  }
};

export function onChange(app, event) {
  if (event.target.matches('[data-fc-speak]')) app.store.update(state => { state.flash.speak = event.target.checked; });
}

export function onKey(app, event) {
  if (!session) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    close(app);
    return;
  }
  if (session.done || event.target.matches?.('input, textarea, select')) return;
  if (session.cardMode === 'flip') {
    if (event.key === ' ' || (event.key === 'Enter' && (!event.target.matches || event.target.matches('[data-fc-card], body, main')))) {
      event.preventDefault();
      flip(app);
    } else if (session.flipped && ['1', '2', '3', '4'].includes(event.key)) rate(app, F.GRADES[Number(event.key) - 1]);
    else if (session.flipped && event.key === 'ArrowLeft') rate(app, 'again', 'left');
    else if (session.flipped && event.key === 'ArrowRight') rate(app, 'good', 'right');
  } else if (session.cardMode === 'quiz' && !session.answered && ['1', '2', '3', '4'].includes(event.key)) {
    document.querySelectorAll('.fc-choice')[Number(event.key) - 1]?.click();
  } else if (session.answered && event.key === 'Enter') {
    event.preventDefault();
    actions['fc-next'](app);
  }
}

// Swipe the flipped card: right for "good", left for "again". A short tap
// flips it like a click.
function mountSwipe(app) {
  const card = document.querySelector('[data-fc-card]');
  if (!card || session?.cardMode !== 'flip') return () => {};
  let start = null;
  let dx = 0;
  const down = event => {
    if (event.target.closest('button')) return;
    start = { x: event.clientX, y: event.clientY };
    dx = 0;
    card.setPointerCapture?.(event.pointerId);
  };
  const move = event => {
    if (!start || !session.flipped) return;
    dx = event.clientX - start.x;
    card.style.setProperty('--dx', String(dx));
    card.classList.add('dragging');
    document.querySelector('.fc-stage')?.style.setProperty('--hint', String(Math.max(-1, Math.min(1, dx / SWIPE))));
  };
  const up = () => {
    if (!start) return;
    card.classList.remove('dragging');
    document.querySelector('.fc-stage')?.style.removeProperty('--hint');
    const moved = Math.abs(dx) > 6;
    start = null;
    if (moved) {
      card.dataset.swiped = '1';
      setTimeout(() => { delete card.dataset.swiped; }, 0);
    }
    if (Math.abs(dx) >= SWIPE && session.flipped) rate(app, dx > 0 ? 'good' : 'again', dx > 0 ? 'right' : 'left');
    else card.style.removeProperty('--dx');
  };
  // A swipe must not count as a tap on the card.
  const click = event => {
    if (card.dataset.swiped) {
      event.stopPropagation();
      event.preventDefault();
    }
  };
  card.addEventListener('pointerdown', down);
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerup', up);
  card.addEventListener('pointercancel', up);
  card.addEventListener('click', click, true);
  return () => {
    card.removeEventListener('pointerdown', down);
    card.removeEventListener('pointermove', move);
    card.removeEventListener('pointerup', up);
    card.removeEventListener('pointercancel', up);
    card.removeEventListener('click', click, true);
  };
}

export function mount(app) {
  document.body.classList.toggle('fc-open', Boolean(session));
  if (!session) return () => document.body.classList.remove('fc-open');
  const form = document.querySelector('[data-fc-type]');
  const submit = event => {
    event.preventDefault();
    if (!session.answered) check(app, document.querySelector('#fc-typed')?.value || '');
  };
  form?.addEventListener('submit', submit);
  const unswipe = mountSwipe(app);
  // Read the German side aloud once when a new card appears.
  const card = session.cards[session.index];
  if (card && !session.done && session.spoken !== session.index) {
    session.spoken = session.index;
    focusSession();
    const deck = flash(app).byId.get(card.deck);
    if (app.state.flash.speak && app.state.flash.dir === 'de' && deck.kind !== 'grammar') say(app, card.de);
  }
  return () => {
    form?.removeEventListener('submit', submit);
    unswipe();
  };
}

// For tests: forget the open session and hub filters.
export function reset() {
  session = null;
  hub = { level: null, kind: 'all' };
}
