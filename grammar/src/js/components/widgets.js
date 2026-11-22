// Side cards: streak week, daily goal, rank and the level strip.
import { t, num, getLang } from '../i18n/index.js';
import { displayStreak, levelFor } from '../engine/gamification.js';
import { overall } from '../engine/progress.js';
import { addDays } from '../dates.js';
import { esc } from './html.js';
import { flame, bolt, icons } from './icons.js';
import { CEFR } from '../cefr.js';

export function streakCard(state, day) {
  const streak = displayStreak(state, day);
  const goal = state.settings.dailyGoal;
  const [y, m, d] = day.split('-').map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const names = t('weekdaysShort');
  const days = names.map((name, i) => {
    const date = addDays(day, i - weekday);
    const reached = (state.xp.byDay[date] || 0) >= goal;
    const today = date === day;
    return `<li class="${reached ? 'hit' : ''} ${today ? 'today' : ''}"><span class="wk-dot">${reached ? flame : ''}</span><span>${name}</span></li>`;
  }).join('');
  return `<section class="widget streak-widget ${streak ? 'live' : ''}">
    <div class="widget-head"><span class="widget-icon streak" aria-hidden="true">${flame}</span>
      <div><strong class="widget-big">${num(streak)}</strong><span class="widget-label">${t('streakTitle')}</span></div></div>
    <ol class="week" aria-label="${esc(t('streakDays', streak))}">${days}</ol>
    <p class="widget-note">${state.streak.best > streak ? t('streakBest', num(state.streak.best)) : t('streakHint')}</p>
  </section>`;
}

export function goalCard(state, day) {
  const goal = state.settings.dailyGoal;
  const xp = state.xp.byDay[day] || 0;
  const percent = Math.min(100, Math.round((xp / goal) * 100));
  return `<section class="widget goal-widget">
    <div class="widget-head"><span class="widget-icon xp" aria-hidden="true">${bolt}</span>
      <div><strong class="widget-title">${t('setGoal')}</strong><span class="widget-label">${xp >= goal ? t('goalDone') : t('goalToday', num(xp), num(goal))}</span></div></div>
    <div class="goal-bar" role="img" aria-label="${esc(t('goalToday', num(xp), num(goal)))}"><i style="inline-size:${percent}%"></i></div>
  </section>`;
}

export function rankCard(state) {
  const lang = getLang();
  const level = levelFor(state.xp.total);
  return `<a class="widget rank-widget" href="#progress">
    <div class="widget-head"><span class="rank-medal" aria-hidden="true">${num(level.level)}</span>
      <div><strong class="widget-title">${esc(level.rank[lang])}</strong><span class="widget-label">${t('totalXp', num(state.xp.total))}</span></div></div>
    <div class="goal-bar rank" aria-hidden="true"><i style="inline-size:${Math.round(level.progress * 100)}%"></i></div>
    <p class="widget-note">${level.to === null ? t('maxRank') : t('toNextRank', num(level.to - state.xp.total))}</p>
  </a>`;
}

// Today's essentials for narrow screens, where the side cards are hidden:
// streak, daily goal, due review and the exam trainer in one row.
export function todayStrip(state, day, review) {
  const streak = displayStreak(state, day);
  const goal = state.settings.dailyGoal;
  const xp = state.xp.byDay[day] || 0;
  const percent = Math.min(100, Math.round((xp / goal) * 100));
  return `<section class="today" aria-label="${esc(t('todayLabel'))}">
    <a class="today-chip streak-chip ${streak ? 'live' : ''}" href="#progress"><span class="today-icon" aria-hidden="true">${flame}</span>
      <span><b>${num(streak)}</b><small>${t('streakTitle')}</small></span></a>
    <a class="today-chip goal-chip" href="#progress"><span class="today-ring" style="--p:${percent}" aria-hidden="true">${bolt}</span>
      <span><b><bdi dir="ltr">${num(xp)}/${num(goal)}</bdi></b><small>${t('setGoal')}</small></span></a>
    ${review.ids.length
      ? `<button type="button" class="today-chip review-chip" data-action="run" data-key="daily"><span class="today-icon" aria-hidden="true">${icons.cards}</span>
        <span><b>${num(review.ids.length)}</b><small>${t('reviewToday')}</small></span></button>`
      : `<a class="today-chip review-chip" href="#practice"><span class="today-icon" aria-hidden="true">${icons.practice}</span>
        <span><b>${t('tabPractice')}</b><small>${t('reviewAndTrain')}</small></span></a>`}
    <a class="today-chip exam-chip" href="#model-exams"><span class="today-icon" aria-hidden="true">${icons.exam}</span>
      <span><b>${t('navExam')}</b><small>telc B1</small></span></a>
  </section>`;
}

// Five level cards; B1 carries the grammar course and its progress.
export function levelStrip(ctx, state) {
  const stats = overall(ctx, state);
  return `<ul class="level-strip">${CEFR.map(level => {
    const percent = level.grammar ? Math.round((stats.learned / Math.max(1, stats.lessons)) * 100) : 0;
    return `<li><a class="level-card ${level.grammar ? 'active' : 'soon'}" href="#level/${level.slug}">
      <span class="level-code ${level.tone}" lang="de" dir="ltr">${level.id}</span>
      <span class="level-name">${esc(t('levelNames')[level.id])}</span>
      <span class="level-state">${level.grammar ? t('courseProgressPct', num(percent)) : t('comingSoon')}</span>
      ${level.grammar ? `<span class="level-bar" aria-hidden="true"><i style="inline-size:${percent}%"></i></span>` : ''}
    </a></li>`;
  }).join('')}</ul>`;
}
