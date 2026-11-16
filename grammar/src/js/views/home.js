// Dashboard: next stop, today's goal, the island map and every topic.
import { t, num, getLang } from '../i18n/index.js';
import { inFilter, lessonTitle, islandName } from '../content.js';
import { islandProgress, lessonStars, nextLesson, overall, pendingErrors } from '../engine/progress.js';
import { levelFor, displayStreak } from '../engine/gamification.js';
import { dueIds } from '../engine/srs.js';
import { addDays } from '../dates.js';
import { mountMap } from '../components/map.js';
import { esc, prose, link, button, stars, levelChip, meter, formatDay } from '../components/html.js';

function goalRing(value, goal) {
  const share = Math.min(1, goal ? value / goal : 0);
  const c = 2 * Math.PI * 34;
  return `<svg class="goal-ring" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="34" class="track"/>
    <circle cx="42" cy="42" r="34" class="arc ${share >= 1 ? 'full' : ''}" stroke-dasharray="${(c * share).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 42 42)"/></svg>`;
}

function continueCard(app) {
  const { ctx, state } = app;
  const lang = getLang();
  const level = levelFor(state.xp.total);
  const next = nextLesson(ctx, state);
  const started = Object.keys(state.completed).length > 0;
  const allConquered = ctx.islands.every(island => state.islands[island.id]?.conquered);
  const nextIsland = next && ctx.islandById.get(next.island);
  const rankLine = level.to === null ? t('maxRank') : t('toNextRank', num(level.to - state.xp.total));
  return `<section class="panel dash-continue" aria-labelledby="dash-title">
    <h1 id="dash-title" class="eyebrow">${t('greeting')}</h1>
    <div class="rank-row">
      <span class="rank-badge" aria-hidden="true">${num(level.level)}</span>
      <div class="rank-text"><span class="label">${t('rank')}</span><strong>${esc(level.rank[lang])}</strong><small>${rankLine}</small></div>
      <span class="rank-xp">${t('totalXp', num(state.xp.total))}</span>
    </div>
    <div class="xp-bar" aria-hidden="true"><i style="inline-size:${Math.round(level.progress * 100)}%"></i></div>
    ${next ? `<a class="next-card" href="#lesson/${next.id}">
        <span class="unit-emoji ${nextIsland.palette}" aria-hidden="true">${next.emoji}</span>
        <span class="next-text"><small>${t('continueTitle')} · ${esc(islandName(nextIsland, lang))}</small>
          <b>${prose(lessonTitle(next, lang))}</b>
          <span class="next-meta"><span class="de-name" lang="de" dir="ltr">${esc(next.german)}</span>${levelChip(next.level)}${stars(lessonStars(state, next.id))}</span></span>
        <span class="go" aria-hidden="true">${t('next')}</span></a>
      <div class="actions">${link(`lesson/${next.id}`, started ? t('continueBtn') : t('startBtn'), 'primary')}${link('practice', t('choosePractice'))}</div>`
    : `<div class="treasure-note"><span aria-hidden="true">🏆</span><div><strong>${allConquered ? t('treasure') : t('allMastered')}</strong>${allConquered ? `<p>${t('treasureText')}</p>` : ''}</div></div>
      <div class="actions">${button('run', t('startReview'), 'primary', 'data-key="review"')}${link('practice', t('choosePractice'))}</div>`}
  </section>`;
}

function todayCard(app) {
  const { ctx, state } = app;
  const day = app.day();
  const goal = state.settings.dailyGoal;
  const earned = state.xp.byDay[day] || 0;
  const streak = displayStreak(state, day);
  const filter = state.settings.levelFilter;
  const due = dueIds(ctx, state, day, filter).length;
  const mistakes = pendingErrors(ctx, state, filter).length;
  const week = Array.from({ length: 7 }, (_, i) => addDays(day, i - 6)).map(date => {
    const reached = (state.xp.byDay[date] || 0) >= goal || state.xp.goalBonusDay === date;
    const active = (state.xp.byDay[date] || 0) > 0;
    return `<li class="${reached ? 'reached' : active ? 'active' : ''} ${date === day ? 'today' : ''}" title="${esc(formatDay(date, { weekday: 'long', day: 'numeric', month: 'long' }))}"><span>${esc(formatDay(date, { weekday: 'narrow' }))}</span></li>`;
  }).join('');
  return `<section class="panel dash-today" aria-labelledby="today-title">
    <h2 id="today-title">${t('todayTitle')}</h2>
    <div class="goal-row">
      <div class="goal-ring-wrap">${goalRing(earned, goal)}<span class="goal-num">${num(Math.min(earned, 999))}</span></div>
      <div><span class="label">${t('goalLabel')}</span><strong>${earned >= goal ? t('goalDone') : t('dailyGoal', num(earned), num(goal))}</strong></div>
    </div>
    <div class="streak-row">
      <span class="streak-flame ${streak ? 'live' : ''}" aria-hidden="true">🔥</span>
      <div><strong>${streak ? t('streakDays', streak) : t('streakNone')}</strong>
      <ol class="week" aria-label="${esc(t('streakWeek'))}">${week}</ol></div>
    </div>
    <div class="today-actions">
      <p>${due ? t('dueReviews', num(due)) : t('noDue')}</p>
      ${due ? button('run', t('startReview'), 'quiet', 'data-key="review"') : ''}
      <p>${mistakes ? t('mistakesN', num(mistakes)) : ''}</p>
      ${mistakes ? button('run', t('practiceMistakes'), 'secondary', 'data-key="mistakes"') : ''}
    </div>
  </section>`;
}

function islandCard(app, island) {
  const { ctx, state } = app;
  const lang = getLang();
  const filter = state.settings.levelFilter;
  const lessons = ctx.islandLessons(island.id).filter(lesson => inFilter(lesson, filter));
  if (!lessons.length) return '';
  const p = islandProgress(ctx, state, island.id, filter);
  const other = lang === 'de' ? `<span lang="ar" dir="rtl">${esc(island.name.ar)}</span>` : `<bdi lang="de" dir="ltr">${esc(island.name.de)}</bdi>`;
  return `<article class="unit-card island-card ${p.conquered ? 'conquered' : ''}">
    <div class="unit-head">
      <span class="unit-emoji ${island.palette}" aria-hidden="true">${island.emoji}</span>
      <span><strong>${num(island.order)}. ${esc(islandName(island, lang))}</strong><small>${other}</small></span>
      ${p.conquered ? `<span class="conquered-flag" title="${esc(t('conquered'))}" role="img" aria-label="${esc(t('conquered'))}">🚩</span>` : ''}
    </div>
    <div class="unit-meter">${meter(p.learned, p.total, islandName(island, lang))}<span>${t('learnedOf', num(p.learned), num(p.total))}</span><span class="star-sum" aria-label="${esc(t('starsTotal'))}">★ ${num(p.stars)}</span></div>
    <ul>${lessons.map(lesson => `<li><a href="#lesson/${lesson.id}">
      <span>${prose(lessonTitle(lesson, lang))}${lang === 'ar' ? `<span class="de-name" lang="de" dir="ltr">${esc(lesson.german)}</span>` : ''}</span>
      <span class="li-meta">${levelChip(lesson.level)}${stars(lessonStars(state, lesson.id), 14)}</span></a></li>`).join('')}</ul>
    <a class="card-foot" href="#island/${island.id}">${t('openIsland')}</a>
  </article>`;
}

export function render(app) {
  const { ctx, state } = app;
  const filter = state.settings.levelFilter;
  const stats = overall(ctx, state, filter);
  const filters = ['all', ...ctx.levels.map(level => level.id)].map(id => `<button type="button" class="filter-chip" data-action="filter" data-level="${id}" aria-pressed="${filter === id}">${id === 'all' ? t('filterAll') : `<span lang="de" dir="ltr">${id}</span>`}</button>`).join('');
  return `
    <div class="dash-top">${continueCard(app)}${todayCard(app)}</div>
    <section class="panel map-panel" aria-labelledby="map-title">
      <div class="panel-head"><h2 id="map-title">${t('mapTitle')} 🧭</h2><p class="muted">${t('mapHelp')}</p></div>
      <div class="map-host" id="map-host"></div>
    </section>
    <div class="section-heading">
      <div><h2>${t('allTopics')}</h2><p>${t('topicsCount', num(stats.lessons), num(stats.questions), num(ctx.islands.length))}</p></div>
      <div class="filter-group" role="group" aria-label="${esc(t('filterLabel'))}">${filters}</div>
    </div>
    <section class="units islands-grid" aria-label="${esc(t('allTopics'))}">${ctx.islands.map(island => islandCard(app, island)).join('')}</section>`;
}

export function mount(app, root) {
  return mountMap(root.querySelector('#map-host'), app);
}

export const actions = {
  filter(app, target) {
    app.store.update(state => { state.settings.levelFilter = target.dataset.level; });
    app.rerender();
  }
};

