// Header of the focused player (lessons and practice): a close button and
// the progress track. Up to 30 steps are drawn as segments, longer runs as
// one continuous bar.
import { t, num } from '../i18n/index.js';
import { esc } from './html.js';
import { icons } from './icons.js';

export function playerBar(closeHash, closeLabel, index, total) {
  const done = Math.min(index, total);
  const track = total <= 30
    ? Array.from({ length: total }, (_, i) => `<i class="${i < done ? 'done' : i === done ? 'now' : ''}"></i>`).join('')
    : `<b style="inline-size:${Math.round((done / Math.max(1, total)) * 100)}%"></b>`;
  const label = t('guidePosition', num(Math.min(done + 1, total)), num(total));
  return `<header class="player-bar">
    <a class="icon-btn player-close" href="#${closeHash}" data-player-close aria-label="${esc(closeLabel)}" title="${esc(closeLabel)}">${icons.close}</a>
    <div class="player-track ${total > 30 ? 'continuous' : ''}" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}">${track}</div>
  </header>`;
}
