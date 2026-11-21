import { t, num, getLang } from '../i18n/index.js';
import { inFilter, lessonTitle, islandName, localizeQuestion } from '../content.js';
import { schedule } from '../engine/srs.js';
import { cardQueue, cardQuestionId } from '../engine/study.js';
import { button, crumbs, esc, meter, plainText, prose } from '../components/html.js';

const ROUND_SIZE = 12;
let round = null;

export const title = () => t('cardsTitle');

const queue = (app, key) => cardQueue(app.ctx, app.state, app.day(), app.state.settings.levelFilter, key);

function deckPicker(app, lang) {
  const { ctx, state } = app;
  const options = ctx.islands.map(island => {
    const entries = ctx.islandLessons(island.id).filter(lesson => ctx.decks.has(lesson.id) && inFilter(lesson, state.settings.levelFilter));
    return entries.length ? `<optgroup label="${esc(islandName(island, lang))}">${entries.map(lesson =>
      `<option value="${lesson.id}">${esc(plainText(lessonTitle(lesson, lang)))} · ${t('cardsCount', ctx.decks.get(lesson.id).length)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  return `<div class="form-row study-actions deck-picker"><label for="card-lesson">${t('chooseLesson')}<select id="card-lesson">${options}</select></label>${button('cards-lesson', t('openDeck'))}</div>`;
}

export function render(app, route) {
  if (!app.redrawing) round = null;
  const { ctx } = app;
  const lang = getLang();
  const { due, fresh } = queue(app, route.key);
  const lesson = ctx.lessons.get(route.key);
  const deckSize = ctx.decks.get(route.key)?.length;
  const waiting = due.length + fresh.length;
  const trail = lesson
    ? [['cards', t('cardsTitle')], [`lesson/${lesson.id}`, prose(lessonTitle(lesson, lang))]]
    : [['practice', t('practice')], [null, t('cardsTitle')]];
  const current = round?.cards[round.position];
  return `${crumbs(trail)}
    <section class="simple-banner practice-head"><h1>${t('cardsTitle')}</h1><p>${lesson ? prose(lessonTitle(lesson, lang)) : t('cardsIntro')}</p></section>
    ${current ? renderCard(ctx, current, lang) : `<section class="panel study-page">
      <h2 id="card-heading" tabindex="-1">${round ? t('cardsComplete') : t('cardsReview')}</h2>
      ${round ? `<p>${t('cardsResult', num(round.remembered), num(round.cards.length))}</p>` : `<p>${t('cardsHow')}</p>`}
      <p class="study-meta">${lesson ? `${t('cardsCount', deckSize)} · ` : ''}${t('cardsDue', num(due.length))} · ${t('cardsNew', num(fresh.length))}</p>
      <div class="actions study-actions">${waiting ? button('cards-start', t(round ? 'cardsContinue' : 'cardsStart'), 'primary') : ''}
        ${lesson && waiting !== deckSize ? button('cards-all', t('cardsAll', num(deckSize)), waiting ? 'secondary' : 'primary') : ''}</div>
      ${!lesson ? deckPicker(app, lang) : ''}
    </section>`}`;
}

function renderCard(ctx, card, lang) {
  const lesson = ctx.lessons.get(card.lesson);
  const { prompt, explain } = localizeQuestion(ctx.questions.get(cardQuestionId(card.id)), lang);
  const position = round.position + 1;
  const total = round.cards.length;
  return `<section class="panel study-page card-stage">
    <div class="quiz-meta"><a href="#lesson/${lesson.id}">${prose(lessonTitle(lesson, lang))}</a><span>${t('cardOf', num(position), num(total))}</span></div>
    ${meter(position, total, t('position'))}
    <h2 id="card-heading" tabindex="-1">${prose(prompt)}</h2>
    ${round.revealed ? `<div class="card-answer" id="card-answer" tabindex="-1">
      <h3>${t('cardsAnswer')}</h3><p>${prose(explain)}</p></div>
      <div class="actions study-actions">${button('card-again', t('cardAgain'))}${button('card-known', t('cardKnown'), 'primary')}</div>`
      : `<div class="actions study-actions">${button('card-reveal', t('showAnswer'), 'primary')}</div>`}
  </section>`;
}

function redraw(app, selector = '#card-heading') {
  app.rerender();
  document.querySelector(selector)?.focus();
}

function start(app, all = false) {
  const key = app.route.key;
  const { due, fresh } = queue(app, key);
  let selected = key ? [...due, ...fresh] : [...due, ...fresh.slice(0, 2)].slice(0, ROUND_SIZE);
  if (all) selected = app.ctx.decks.get(key);
  if (!selected?.length) return;
  round = { cards: selected, position: 0, revealed: false, remembered: 0 };
  redraw(app);
}

function rate(app, correct) {
  if (!round?.revealed) return;
  const { id } = round.cards[round.position];
  app.store.update(state => { state.cards[id] = schedule(state.cards[id] || {}, correct, app.day()); });
  round.position++;
  round.revealed = false;
  round.remembered += Number(correct);
  redraw(app);
}

export const actions = {
  'cards-start': app => start(app),
  'cards-all': app => start(app, true),
  'cards-lesson': app => app.navigate(`cards/${document.querySelector('#card-lesson').value}`),
  'card-reveal'(app) {
    if (!round) return;
    round.revealed = true;
    redraw(app, '#card-answer');
  },
  'card-again': app => rate(app, false),
  'card-known': app => rate(app, true)
};
