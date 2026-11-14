// Streak and rank in the top bar.
import { t, num, getLang } from '../i18n/index.js';
import { levelFor, displayStreak } from '../engine/gamification.js';
import { esc } from './html.js';

export function renderHud(state, day) {
  const streak = displayStreak(state, day);
  const level = levelFor(state.xp.total);
  const name = level.rank[getLang()];
  const percent = Math.round(level.progress * 100);
  return `<a class="hud-streak ${streak ? 'live' : ''}" href="#progress" aria-label="${esc(t('hudStreak', streak))}" title="${esc(t('hudStreak', streak))}">
      <span aria-hidden="true">🔥</span><b>${num(streak)}</b></a>
    <a class="hud-level" href="#progress" aria-label="${esc(t('hudLevel', num(level.level), name, num(state.xp.total)))}" title="${esc(t('hudLevel', num(level.level), name, num(state.xp.total)))}">
      <span class="hud-badge" aria-hidden="true">${num(level.level)}</span>
      <span class="hud-bar" aria-hidden="true"><i style="inline-size:${percent}%"></i></span>
      <b class="hud-xp">${num(state.xp.total)}</b></a>`;
}
