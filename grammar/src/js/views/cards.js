import { t, num, getLang } from '../i18n/index.js';
import { inFilter, lessonTitle, islandName } from '../content.js';
import { schedule } from '../engine/srs.js';
import { shuffle } from '../engine/runs.js';
import { button, crumbs, esc, germanLine, meter, plainText, prose } from '../components/html.js';

const ROUND_SIZE = 12;
let round = null;

export const title = () => t('cardsTitle');

function deck(app, key) {
  const { ctx, state } = app;
  return [...ctx.cards.values()].filter(card => key ? card.lesson === key : inFilter(ctx.lessons.get(card.lesson), state.settings.levelFilter));
}

function dueCards(app, cards) {
  const day = app.day();
  const { cards: reviews } = app.state;
  return cards.filter(card => !reviews[card.id] || reviews[card.id].due <= day)
    .sort((a, b) => (reviews[a.id]?.due || '9999').localeCompare(reviews[b.id]?.due || '9999'));
}

export function render(app, route) {
  if (!app.redrawing) round = null;
  const { ctx } = app;
  const lang = getLang();
  const cards = deck(app, route.key);
  const due = dueCards(app, cards).length;
  const lesson = ctx.lessons.get(route.key);
  const trail = lesson
    ? [['cards', t('cardsTitle')], [`lesson/${lesson.id}`, prose(lessonTitle(lesson, lang))]]
    : [['practice', t('practice')], [null, t('cardsTitle')]];
  const current = round?.cards[round.position];
  const options = ctx.islands.map(island => `<optgroup label="${esc(islandName(island, lang))}">${ctx.islandLessons(island.id)
    .filter(item => ctx.lessonStudy.has(item.id)).map(item => `<option value="${item.id}">${esc(plainText(lessonTitle(item, lang)))}</option>`).join('')}</optgroup>`).join('');
  return `${crumbs(trail)}
    <section class="simple-banner practice-head"><h1>${t('cardsTitle')}</h1><p>${lesson ? prose(lessonTitle(lesson, lang)) : t('cardsIntro')}</p></section>
    ${current ? renderCard(ctx, current, lang) : `<section class="panel study-page">
      <h2 id="card-heading" tabindex="-1">${round ? t('cardsComplete') : t('cardsReview')}</h2>
      ${round ? `<p>${t('cardsResult', num(round.remembered), num(round.cards.length))}</p>` : `<p>${t('cardsHow')}</p>`}
      <p class="study-meta">${due ? t('cardsDue', num(due)) : t('cardsAllCaughtUp')}</p>
      <div class="actions study-actions">${due ? button('cards-start', t(round ? 'cardsContinue' : 'cardsStart'), 'primary') : ''}
        ${lesson ? button('cards-all', t('cardsAll'), due ? 'secondary' : 'primary') : ''}</div>
      ${!lesson ? `<div class="form-row study-actions"><label for="card-lesson">${t('chooseLesson')}<select id="card-lesson">${options}</select></label>${button('cards-lesson', t('openDeck'))}</div>` : ''}
    </section>`}`;
}

function renderCard(ctx, card, lang) {
  const lesson = ctx.lessons.get(card.lesson);
  const study = ctx.lessonStudy.get(card.lesson);
  const recall = card.kind === 'recall';
  const prompt = recall ? lesson.i18n[lang].recall[0] : study.task[lang];
  const explanation = recall ? lesson.i18n[lang].recall[1] : study[lang];
  const position = round.position + 1;
  const total = round.cards.length;
  return `<section class="panel study-page card-stage">
    <div class="quiz-meta"><a href="#lesson/${lesson.id}">${prose(lessonTitle(lesson, lang))}</a><span>${t('cardOf', num(position), num(total))}</span></div>
    ${meter(position, total, t('position'))}
    <h2 id="card-heading" tabindex="-1">${prose(prompt)}</h2>
    ${!recall && !round.revealed ? `<div class="card-examples" lang="de" dir="ltr">${round.examples.map((example, i) => `<p>${i === 0 ? 'A' : 'B'} · ${esc(example)}</p>`).join('')}</div>` : ''}
    ${round.revealed ? `<div class="card-answer" id="card-answer" tabindex="-1">
      <h3>${t('solution')}</h3>${!recall ? germanLine(study.correct) : ''}<p>${prose(explanation)}</p></div>
      <div class="actions study-actions">${button('card-again', t('cardAgain'))}${button('card-known', t('cardKnown'), 'primary')}</div>`
      : `<div class="actions study-actions">${button('card-reveal', t('showAnswer'), 'primary')}</div>`}
  </section>`;
}

function redraw(app, selector = '#card-heading') {
  app.rerender();
  document.querySelector(selector)?.focus();
}

function start(app, all = false) {
  const cards = deck(app, app.route.key);
  const selected = (all ? cards : dueCards(app, cards)).slice(0, ROUND_SIZE);
  if (!selected.length) return;
  round = { cards: selected, position: 0, revealed: false, remembered: 0 };
  chooseExamples(app);
  redraw(app);
}

function rate(app, correct) {
  if (!round?.revealed) return;
  const { id } = round.cards[round.position];
  app.store.update(state => { state.cards[id] = schedule(state.cards[id] || { box: 1 }, correct, app.day()); });
  round.position++;
  round.revealed = false;
  round.remembered += Number(correct);
  chooseExamples(app);
  redraw(app);
}

function chooseExamples(app) {
  const card = round.cards[round.position];
  if (card?.kind !== 'apply') return;
  const { correct, alternative } = app.ctx.lessonStudy.get(card.lesson);
  round.examples = shuffle([correct, alternative]);
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
