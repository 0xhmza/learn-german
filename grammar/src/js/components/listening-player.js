import { num } from '../i18n/index.js';
import { h } from '../i18n/listening.js';
import { esc, button } from './html.js';
import { MAX_PLAYS } from '../engine/listening.js';
import { icons } from './icons.js';

export function playerStatus(plays) {
  return `${num(Math.max(0, MAX_PLAYS - plays))} ${h('playsLeft')}`;
}

export function listeningPlayer(url, { limit = null, label = 'audio' } = {}) {
  return `<section class="listening-player panel" aria-label="${esc(h('audio'))}">
    <audio preload="none" ${url ? `src="${esc(url)}"` : ''} data-listening-audio></audio>
    <div class="listening-waves" aria-hidden="true">${icons.listen}${'<i></i>'.repeat(7)}</div>
    <div class="listening-controls">
      ${button('listen-play', esc(h(label)), 'primary', limit >= MAX_PLAYS ? 'disabled' : '')}
      ${button('listen-stop', esc(h('stop')), 'quiet', 'disabled')}
      ${limit === null ? `<label>${esc(h('speed'))} <select data-listening-speed aria-label="${esc(h('speed'))}"><option value="1">1×</option><option value=".85">0,85×</option><option value=".7">0,7×</option></select></label>`
        : `<span class="listening-plays" data-listening-plays>${esc(playerStatus(limit))}</span>`}
    </div>
    <p class="listening-status" data-listening-audio-status role="status"></p>
  </section>`;
}

export const readListeningSpeed = () => Number(document.querySelector('[data-listening-speed]')?.value ?? 1);

export async function playListening(controller, start, end) {
  if (!controller || controller.busy) return false;
  controller.busy = true;
  controller.setStatus(h('loading'));
  try {
    const started = await controller.play(start, end, readListeningSpeed());
    if (started) controller.setStatus('');
    return started;
  } catch {
    controller.setStatus(h('audioError'));
    return false;
  } finally { controller.busy = false; }
}
