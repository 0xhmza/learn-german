// Progress: rank, totals, activity calendar, badges and per-island detail.
import { t, num, getLang } from '../i18n/index.js';
import { lessonTitle, islandName } from '../content.js';
import { overall, pendingErrors, islandProgress, lessonStars } from '../engine/progress.js';
import { levelFor } from '../engine/gamification.js';
import { addDays, diffDays } from '../dates.js';
import { esc, prose, link, button, stars, formatDay } from '../components/html.js';
import { downloadBackup } from './settings.js';

export const title = () => t('tabProgress');

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
  const islands = ctx.islands.map(island => {
    const p = islandProgress(ctx, state, island.id);
    return `<details class="panel island-stats"><summary><span class="sum-emoji ${island.palette}" aria-hidden="true">${p.conquered ? '🚩' : island.emoji}</span>
      <span>${esc(islandName(island, lang))}</span><span class="muted">${t('learnedOf', num(p.learnedAll), num(p.totalAll))} · ★ ${num(p.stars)}</span></summary>
      <ul class="stat-list">${ctx.islandLessons(island.id).map(lesson => {
        const attempts = [...lesson.questions.map(q => q.id), `apply-${lesson.id}`, `write-${lesson.id}`].flatMap(id => state.results[id] || []);
        const last = attempts.map(item => item.last).sort().at(-1);
        const recent = attempts.filter(item => item.last === last);
        const transfer = state.transfer[lesson.id];
        const retry = transfer?.last && (!transfer.correct || transfer.hinted);
        return `<li class="lesson-evidence">
          <div class="row-between"><a href="#lesson/${lesson.id}">${prose(lessonTitle(lesson, lang))}</a>${stars(lessonStars(state, lesson.id), 14)}</div>
          ${state.viewed[lesson.id] ? `<p>${t('viewed')} · ${formatDay(state.viewed[lesson.id])}</p>` : ''}
          ${last ? `<p>${t('lastPractice', formatDay(last), t('practiceScore', num(recent.filter(item => item.correct).length), num(recent.length)))}</p>
            <p>${t('answerEvidence', num(recent.filter(item => !item.self).length), num(recent.filter(item => item.self).length), num(recent.filter(item => item.hinted).length))}</p>` : ''}
          ${transfer?.last ? `<p>${formatDay(transfer.last)} · ${t(retry ? 'transferTryAgain' : 'transferCorrect')}</p>` : ''}
          ${transfer?.due ? `<p>${t('transferPending', formatDay(transfer.due))}</p>` : ''}
        </li>`;
      }).join('')}</ul></details>`;
  }).join('');
  return `
    <section class="simple-banner practice-head"><h1>${t('progressTitle')}</h1>
      <p>${store.available ? t('localBackup') : t('progressNoStore')}</p>
      <div class="actions">${button('backup', t('backup'))}${mistakes ? button('run', t('reviewMistakes'), 'secondary', 'data-key="mistakes"') : ''}</div>
    </section>
    <section class="panel">
      <h2>${t('completedMilestones')}</h2><p>${t('milestoneInfo')}</p>
      <div class="stats four">
        <div class="stat"><strong>${t('of', num(stats.learned), num(stats.lessons))}</strong>${t('lessonsDone')}</div>
        <div class="stat"><strong>${t('of', num(stats.stars), num(stats.maxStars))}</strong>${t('starsTotal')}</div>
        <div class="stat"><strong>${t('of', num(stats.conquered), num(stats.islands))}</strong>${t('islandsConquered')}</div>
        <div class="stat"><strong>${t('of', num(stats.correct), num(stats.questions))}</strong>${t('rightAnswers')}</div>
      </div>
    </section>
    <div class="section-heading"><h2>${t('byIsland')}</h2></div>
    <div class="island-stats-list">${islands}</div>
    <details class="panel modes-panel"><summary>${t('calendar')} · ${t('badges')}</summary>
      <div class="rank-row big">
        <span class="rank-badge" aria-hidden="true">${num(level.level)}</span>
        <div class="rank-text"><span class="label">${t('rank')}</span><strong>${esc(level.rank[lang])}</strong>
          <small>${level.to === null ? t('maxRank') : t('toNextRank', num(level.to - state.xp.total))}</small></div>
        <span class="rank-xp">${t('totalXp', num(state.xp.total))}</span>
      </div>
      <div class="xp-bar" aria-hidden="true"><i style="inline-size:${Math.round(level.progress * 100)}%"></i></div>
      ${calendar(state, day)}
      <section><h2>${t('badges')}</h2><ul class="badges">${badges}</ul></section>
    </details>
    <div class="actions" style="margin-top:14px">${link('settings', t('settings'))}</div>`;
}

export const actions = {
  backup: app => downloadBackup(app)
};
