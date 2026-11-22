// Dashboard cards and the "where you stopped" banner of the area pages.
import { t, num } from '../i18n/index.js';
import { displayStreak } from '../engine/gamification.js';
import { addDays } from '../dates.js';
import { esc } from './html.js';
import { flame, icons } from './icons.js';
import { CEFR } from '../cefr.js';
import { currentLevel } from '../engine/areas.js';

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

// The current level; opens the page to switch levels.
export function levelCard(state) {
  const level = currentLevel(state);
  const info = CEFR.find(item => item.id === level);
  return `<a class="widget level-widget" href="#level" aria-label="${esc(`${t('currentLevel')}: ${level} · ${t('levelNames')[level]}. ${t('changeLevel')}`)}">
    <span class="level-code level-card-code ${info.tone}" lang="de" dir="ltr" aria-hidden="true">${level}</span>
    <span class="level-card-text"><small>${t('currentLevel')}</small><strong>${esc(t('levelNames')[level])}</strong>
      <span class="level-card-change">${t('changeLevel')} ${icons.chevron}</span></span>
  </a>`;
}

// One area on the dashboard. `value` is the big number, `percent` the bar
// (omitted for open-ended areas such as the word list).
export function progressCard({ area, href, icon, title, detail, value, percent }) {
  return `<a class="progress-card ${area}" href="#${href}">
    <span class="pc-icon" aria-hidden="true">${icon}</span>
    <span class="pc-text"><strong>${title}</strong><small>${detail}</small></span>
    ${value === undefined ? '' : `<span class="pc-value"><bdi dir="ltr">${value}</bdi></span>`}
    ${percent === undefined ? '' : `<span class="bar pc-bar" aria-hidden="true"><i style="inline-size:${percent}%"></i></span>`}
  </a>`;
}

// "Where you stopped": shown at the top of every area page.
export function resumeCard({ stop, empty, eyebrow }) {
  if (!stop) {
    return `<section class="resume-card empty"><div class="resume-copy"><p class="eyebrow-line">${eyebrow || t('notStarted')}</p>
      <h2>${empty.title}</h2>${empty.detail ? `<p class="resume-meta">${empty.detail}</p>` : ''}</div>
      ${empty.action ? `<div class="resume-actions">${empty.action}</div>` : ''}</section>`;
  }
  return `<section class="resume-card"><div class="resume-copy"><p class="eyebrow-line">${eyebrow || t('stoppedHere')}</p>
    <h2>${stop.title}</h2><p class="resume-meta">${stop.meta}</p></div>
    ${stop.action ? `<div class="resume-actions">${stop.action}</div>` : ''}</section>`;
}

// For levels without content yet: what is missing and a way to switch.
export function levelSoonCard(level, heading = 'h2') {
  return `<section class="panel level-soon"><span class="empty-icon" aria-hidden="true">${icons.sparkle}</span>
    <div><${heading}>${t('levelSoonTitle', level)}</${heading}><p>${t('levelSoonText')}</p>
      <p><a class="btn secondary" href="#level">${t('changeLevel')}</a></p></div></section>`;
}
