// Short notices for XP, stars, ranks, badges and conquered islands.
// They never take focus; the region is a polite live region.
import { t, num, getLang } from '../i18n/index.js';
import { lessonTitle, islandName } from '../content.js';
import { RANKS } from '../engine/gamification.js';
import { esc, prose } from './html.js';

const MAX_VISIBLE = 3;
const VISIBLE_MS = 4000;

export function describeNotes(ctx, notes) {
  const lang = getLang();
  const messages = [];
  const xp = notes.filter(note => note.type === 'xp').reduce((sum, note) => sum + note.amount, 0);
  if (xp) messages.push({ icon: '✨', text: t('xpGain', num(xp)), kind: 'xp' });
  for (const note of notes) {
    if (note.type === 'goal') messages.push({ icon: '🎯', text: t('goalReached', num(note.amount)), kind: 'goal' });
    if (note.type === 'learned') messages.push({ icon: '✅', text: t('learnedToast', lessonTitle(ctx.lessons.get(note.lesson), lang)), kind: 'learned' });
    if (note.type === 'stars') messages.push({ icon: '⭐', text: t('starsToast', num(note.stars), lessonTitle(ctx.lessons.get(note.lesson), lang)), kind: 'stars' });
    if (note.type === 'levelUp') messages.push({ icon: '🧭', text: t('levelUp', RANKS[note.level - 1][lang]), kind: 'level' });
    if (note.type === 'conquered') messages.push({ icon: '🚩', text: t('conqueredToast', islandName(ctx.islandById.get(note.island), lang)), kind: 'conquered' });
    if (note.type === 'badge') {
      const badge = ctx.badgeById.get(note.id);
      if (badge) messages.push({ icon: badge.emoji, text: t('badgeNew', badge.name[lang]), kind: 'badge' });
    }
  }
  return messages;
}

export function createToaster(region) {
  const queue = [];
  const show = () => {
    while (region.children.length < MAX_VISIBLE && queue.length) {
      const { icon, text, kind } = queue.shift();
      const item = document.createElement('div');
      item.className = `toast ${kind}`;
      item.innerHTML = `<span class="toast-icon" aria-hidden="true">${esc(icon)}</span><span class="toast-text">${prose(text)}</span>
        <button type="button" class="toast-close" aria-label="${esc(t('dismiss'))}">×</button>`;
      const remove = () => {
        clearTimeout(timer);
        item.classList.add('leave');
        setTimeout(() => { item.remove(); show(); }, 180);
      };
      const timer = setTimeout(remove, VISIBLE_MS);
      item.querySelector('button').addEventListener('click', remove);
      region.append(item);
    }
  };
  return messages => {
    queue.push(...messages);
    show();
  };
}
