// Streak, XP and rank pills in the top bar.
import { t, num, getLang } from '../i18n/index.js';
import { levelFor, displayStreak } from '../engine/gamification.js';
import { esc } from './html.js';
import { flame, bolt } from './icons.js';

export function renderHud(state, day) {
  const streak = displayStreak(state, day);
  const level = levelFor(state.xp.total);
  const name = level.rank[getLang()];
  const streakLabel = esc(t('hudStreak', streak));
  const levelLabel = esc(t('hudLevel', num(level.level), name, num(state.xp.total)));
  return `<a class="hud-pill hud-streak ${streak ? 'live' : ''}" href="#progress" aria-label="${streakLabel}" title="${streakLabel}">
      ${flame}<b>${num(streak)}</b></a>
    <a class="hud-pill hud-xp" href="#progress" aria-label="${levelLabel}" title="${levelLabel}">
      ${bolt}<b>${num(state.xp.total)}</b></a>
    <a class="hud-avatar" href="#progress" aria-label="${levelLabel}" title="${levelLabel}">
      <span aria-hidden="true">${num(level.level)}</span>
      <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16" pathLength="100" stroke-dasharray="${Math.round(level.progress * 100)} 100"/></svg></a>`;
}
