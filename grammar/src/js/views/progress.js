// Progress: rank, totals, activity calendar and badges.
import { t, num, getLang } from '../i18n/index.js';
import { overall, pendingErrors } from '../engine/progress.js';
import { levelFor, displayStreak } from '../engine/gamification.js';
import { icons, flame, bolt } from '../components/icons.js';
import { addDays, diffDays } from '../dates.js';
import { esc, link, button, formatDay } from '../components/html.js';
import { downloadBackup } from './settings.js';

export const title = () => t('navProfile');

function calendar(state, day) {
  // 12 full weeks ending with the current week; weeks start on Monday.
  const [y, m, d] = day.split('-').map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const start = addDays(day, -weekday - 7 * 11);
  const level = xp => (xp <= 0 ? 0 : xp < 15 ? 1 : xp < 30 ? 2 : xp < 60 ? 3 : 4);
  const cells = Array.from({ length: 84 }, (_, i) => {
    const date = addDays(start, i);
    if (diffDays(day, date) > 0) return '<span class="cal-cell future" aria-hidden="true"></span>';
    const xp = state.xp.byDay[date] || 0;
    const label = t('calendarDay', formatDay(date), num(xp));
    return `<span class="cal-cell l${level(xp)}" role="img" aria-label="${esc(label)}" title="${esc(label)}"></span>`;
  }).join('');
  return `<section class="panel"><h2>${t('calendar')}</h2>
    <div class="calendar">${cells}</div>
    <div class="cal-legend" aria-hidden="true"><span>${t('less')}</span>${[0, 1, 2, 3, 4].map(n => `<span class="cal-cell l${n}"></span>`).join('')}<span>${t('more')}</span></div></section>`;
}

export function render(app) {
  const { ctx, state, store } = app;
  const lang = getLang();
  const day = app.day();
  const stats = overall(ctx, state);
  const mistakes = pendingErrors(ctx, state).length;
  const level = levelFor(state.xp.total);
  const badges = ctx.badges.map(badge => {
    const earned = state.badges[badge.id];
    return `<li class="badge ${earned ? 'earned' : 'locked'}"><span class="badge-icon" aria-hidden="true">${badge.emoji}</span>
      <span><strong>${esc(badge.name[lang])}</strong><small>${esc(badge.text[lang])}</small><em>${earned ? t('badgeEarned', formatDay(earned)) : t('badgeLocked')}</em></span></li>`;
  }).join('');
  const streak = displayStreak(state, day);
  const tiles = [
    ['streak', flame, num(streak), t('streakTitle')],
    ['xp', bolt, num(state.xp.total), t('totalXp', '').trim()],
    ['lessons', icons.learn, t('of', num(stats.learned), num(stats.lessons)), t('lessonsDone')],
    ['stars', icons.sparkle, t('of', num(stats.stars), num(stats.maxStars)), t('starsTotal')],
    ['islands', icons.trophy, t('of', num(stats.conquered), num(stats.islands)), t('islandsConquered')],
    ['answers', icons.check, t('of', num(stats.correct), num(stats.questions)), t('rightAnswers')]
  ].map(([kind, icon, value, label]) => `<div class="stat-tile ${kind}"><span class="stat-icon" aria-hidden="true">${icon}</span>
    <span><strong>${value}</strong><small>${label}</small></span></div>`).join('');
  return `
    <section class="profile-head">
      <span class="profile-avatar" aria-hidden="true">${num(level.level)}</span>
      <div class="profile-copy">
        <small>${t('profileTitle')} · ${t('rank')}</small>
        <h1>${esc(level.rank[lang])}</h1>
        <p>${t('totalXp', num(state.xp.total))} · ${t('streakBest', num(state.streak.best))}</p>
        <div class="goal-bar rank" aria-hidden="true"><i style="inline-size:${Math.round(level.progress * 100)}%"></i></div>
        <p class="widget-note">${level.to === null ? t('maxRank') : t('toNextRank', num(level.to - state.xp.total))}</p>
      </div>
      <div class="profile-actions">${button('backup', t('backup'))}${link('settings', t('settings'), 'quiet')}</div>
    </section>
    <p class="muted profile-note">${store.available ? t('localBackup') : t('progressNoStore')}</p>
    <section class="home-section"><div class="section-row"><h2>${t('completedMilestones')}</h2>
      ${mistakes ? button('run', t('reviewMistakes'), 'secondary', 'data-key="mistakes"') : ''}</div>
      <div class="stat-tiles">${tiles}</div>
      <p class="muted section-note">${t('milestoneInfo')}</p></section>
    ${calendar(state, day)}
    <section class="panel"><h2>${t('badges')}</h2><ul class="badges">${badges}</ul></section>`;
}

export const actions = {
  backup: app => downloadBackup(app)
};
