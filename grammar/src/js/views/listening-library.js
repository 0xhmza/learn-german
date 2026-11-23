import { num } from '../i18n/index.js';
import { h } from '../i18n/listening.js';
import { button, crumbs, esc } from '../components/html.js';
import { checkListening } from '../engine/listening.js';
import { buildListeningClips, EPISODE_FILE, transcriptRevision } from '../engine/listening-clips.js';
import { mountListeningAudio } from '../components/listening-audio.js';
import { listeningPlayer, playListening } from '../components/listening-player.js';

const canLoadLocal = () => ['127.0.0.1', 'localhost', '[::1]'].includes(globalThis.location?.hostname);
const serverEpisodes = new Map();
const imported = new Map();
const modes = { word: 'tvWord', phrase: 'tvPhrase', dictation: 'tvDictation' };
let listed = false;
let loadingList = false;
let importTicket = 0;
let selection = 0;
let media = null;
let message = '';
let audio = null;
let objectUrl = null;

const currentClip = () => media?.clips[media.index];
const isOpen = app => app.route.view === 'listening' && app.route.key === 'serien';
const redraw = (app, selector) => {
  if (!isOpen(app)) return;
  app.rerender();
  if (selector) document.querySelector(selector)?.focus({ preventScroll: true });
};

async function indexServer(app) {
  if (loadingList || !canLoadLocal()) return;
  loadingList = true;
  try {
    const response = await fetch('api/hoeren', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const pairs = data.episodes.filter(episode => EPISODE_FILE.test(episode.id) && episode.count > 0);
    serverEpisodes.clear();
    for (const episode of pairs) serverEpisodes.set(episode.id, episode);
  } catch { /* Hosted builds can still use imported files. */ }
  finally { listed = true; loadingList = false; redraw(app); }
}

function visibleEpisodes() {
  return [...new Map([...serverEpisodes, ...imported]).values()].sort((a, b) => a.id.localeCompare(b.id));
}

function clipTask(clip) {
  return media.mode === 'dictation' ? { answer: clip.text } : clip[media.mode];
}

function clipCard(app) {
  if (!media) return '';
  const { episode, index, clips, mode, answer, result, heard } = media;
  if (!clips.length) return `<p class="notice">${esc(h('tvNoPairs'))}</p>`;
  const clip = currentClip();
  if (!clip) return `<section class="panel"><p>${esc(h('tvDone'))}</p>${button('listen-tv-repeat', esc(h('retry')))}</section>`;
  const task = clipTask(clip);
  const line = task.before === undefined ? h('dictationInstruction') : `${esc(task.before)}<b class="listening-gap" aria-label="${esc(h('blank'))}">___</b>${esc(task.after)}`;
  const practiceCount = clips.filter(item => app.state.listening.clips[item.id] === 'done').length;
  return `<section class="listening-scene">
    <div class="listening-scene-heading"><h2><bdi>${esc(episode.label)}</bdi></h2><span>${num(index + 1)} / ${num(clips.length)} · ${num(practiceCount)} ${esc(h('finished'))}</span></div>
    <div class="listening-modes" role="group" aria-label="${esc(h('exercises'))}">
      ${Object.entries(modes).map(([value, title]) => button('listen-tv-mode', esc(h(title)), 'quiet',
        `data-mode="${value}" aria-pressed="${value === mode}"`)).join('')}
    </div>
    ${listeningPlayer(episode.file ? '' : `api/hoeren/${episode.id}/audio`)}
    <section class="panel listening-task${result ? result.correct ? ' yes' : ' no' : ''}">
      <label for="tv-answer">${esc(h('responseLabel'))}</label>
      <p ${task.before === undefined ? '' : 'lang="de" dir="ltr"'}>${line}</p>
      <input id="tv-answer" class="listening-answer" type="text" data-listening-tv-answer value="${esc(answer)}" lang="de" dir="ltr"
        maxlength="350" autocomplete="off" autocapitalize="off" spellcheck="false" ${result ? 'readonly' : ''}>
      ${result ? `<div class="listening-feedback" role="status">
        <strong>${esc(h(result.correct ? result.spelling ? 'correct' : 'partialNote' : 'listenAgain'))}</strong>
        <p><bdi lang="de">${esc(task.answer)}</bdi></p>
        <details><summary>${esc(h('transcript'))}</summary><p lang="de" dir="ltr">${esc(clip.text)}</p></details></div>` : ''}
      <div class="actions">
        ${result
          ? `${!result.correct ? button('listen-tv-retry', esc(h('retry'))) : ''}
            ${result.correct && mode !== 'dictation' ? button('listen-tv-longer', esc(h('tvLonger')), 'secondary') : ''}
            ${button('listen-tv-next', esc(h('tvNext')), 'primary')}`
          : button('listen-tv-check', esc(h('checkOne')), 'primary', heard && answer.trim() ? '' : 'disabled')}
        ${button('listen-tv-skip', esc(h('tvMismatch')), 'quiet')}
      </div>
    </section>
  </section>`;
}

export function renderLibrary(app) {
  const episodes = visibleEpisodes();
  return `${crumbs([['hoeren', esc(h('nav'))], [null, esc(h('tv'))]])}
  <div class="listening">
    <header class="listening-heading"><h1>${esc(h('tv'))}</h1><p>${esc(h('tvIntro'))}</p></header>
    <section class="panel listening-library-source">
      <div class="actions">
        <label class="btn secondary file-btn">${esc(h('tvFolder'))}<input type="file" webkitdirectory multiple
          data-listening-folder class="sr-only"></label>
        ${canLoadLocal() ? button('listen-tv-refresh', esc(h('tvRefresh')), 'quiet', loadingList ? 'disabled' : '') : ''}
      </div>
      <details><summary>${esc(h('tvFormats'))}</summary><p>${esc(h('tvFileHelp'))}</p></details>
      ${episodes.length ? `<label class="field"><span>${esc(h('tvEpisode'))}</span>
        <select data-listening-episode><option value="">—</option>${episodes.map(episode =>
          `<option value="${esc(episode.id)}" ${media?.episode.id === episode.id ? 'selected' : ''}>${esc(episode.label)} · ${num(episode.count)} ${esc(h('tvCount'))}</option>`).join('')}</select></label>`
        : `<p class="muted">${esc(h(loadingList || (!listed && canLoadLocal()) ? 'tvLoading' : 'tvEmpty'))}</p>`}
      ${message ? `<p role="status">${esc(h(message))}</p>` : ''}
      <p class="muted">${esc(h('tvNote'))}</p>
    </section>
    ${clipCard(app)}
  </div>`;
}

async function selectEpisode(app, id) {
  const ticket = ++selection;
  const episode = imported.get(id) ?? serverEpisodes.get(id);
  media = null;
  if (!episode) { message = ''; redraw(app); return; }
  message = 'tvLoading';
  redraw(app);
  try {
    let clips = episode.clips;
    if (!clips) {
      const response = await fetch(`api/hoeren/${id}`);
      if (!response.ok) throw new Error('Episode unavailable');
      ({ clips } = await response.json());
    }
    if (ticket !== selection) return;
    const fresh = clips.findIndex(clip => !app.state.listening.clips[clip.id]);
    media = { episode, clips, index: fresh === -1 ? clips.length : fresh, answer: '', mode: 'word', heard: false, result: null };
    message = '';
  } catch {
    if (ticket !== selection) return;
    message = 'tvError';
  }
  redraw(app);
}

async function importEpisodes(app, files) {
  const ticket = ++importTicket;
  const filesByPair = new Map();
  for (const file of files) {
    const kind = /\.de\.srt$/i.test(file.name) ? 'transcript' : /\.mp4$/i.test(file.name) ? 'file' : null;
    if (!kind) continue;
    const id = file.name.replace(/(?:\.de\.srt|\.mp4)$/i, '').toLowerCase();
    if (!EPISODE_FILE.test(id)) continue;
    const folder = file.webkitRelativePath.slice(0, file.webkitRelativePath.lastIndexOf('/') + 1);
    const pair = filesByPair.get(folder + id) ?? { id };
    pair[kind] = file;
    filesByPair.set(folder + id, pair);
  }
  message = 'tvLoading';
  redraw(app);
  const episodes = await Promise.all([...filesByPair.values()].map(async ({ id, file, transcript }) => {
    if (!file?.size || !transcript?.size || transcript.size > 3_000_000) return null;
    try {
      const text = await transcript.text();
      const clips = buildListeningClips(id, globalThis.Subtitles.parse(text), transcriptRevision(text));
      const series = id.split('.')[0];
      const label = `${series === 'simpsons' ? 'The Simpsons' : 'SpongeBob Schwammkopf'} · ${id.split('.')[1].toUpperCase()}`;
      return clips.length ? { id, label, series, file, count: clips.length, clips } : null;
    } catch { return null; }
  }));
  if (ticket !== importTicket) return;
  const good = episodes.filter(Boolean);
  for (const episode of good) imported.set(episode.id, episode);
  if (good.length) await selectEpisode(app, good[0].id);
  else { message = 'tvNoPairs'; redraw(app); }
}

function resetClip(app, mode = media.mode) {
  Object.assign(media, { answer: '', mode, result: null, heard: false });
  message = '';
  redraw(app, '[data-action="listen-play"]');
}

function nextClip(app) {
  let index = media.index + 1;
  while (index < media.clips.length && app.state.listening.clips[media.clips[index].id] === 'skipped') index++;
  media.index = index;
  resetClip(app, 'word');
}

export function libraryChange(app, event) {
  const target = event.target;
  if (target.hasAttribute('data-listening-speed')) audio?.speed(Number(target.value));
  if (target.hasAttribute('data-listening-episode')) void selectEpisode(app, target.value);
  if (target.hasAttribute('data-listening-folder') && target.files?.length) void importEpisodes(app, [...target.files]);
}

function syncCheckButton() {
  const check = document.querySelector('[data-action="listen-tv-check"]');
  if (check) check.disabled = !media.heard || !media.answer.trim();
}

export function libraryInput(event) {
  if (!event.target.hasAttribute('data-listening-tv-answer') || !media || media.result) return;
  media.answer = event.target.value;
  syncCheckButton();
}

export const libraryActions = {
  'listen-tv-refresh': app => indexServer(app),
  'listen-tv-mode': (app, target) => {
    const mode = target.dataset.mode;
    if (Object.hasOwn(modes, mode) && mode !== media.mode) resetClip(app, mode);
  },
  'listen-tv-longer': app => resetClip(app, media.mode === 'word' ? 'phrase' : 'dictation'),
  'listen-tv-retry': app => resetClip(app),
  'listen-tv-next': nextClip,
  'listen-tv-repeat'(app) { media.index = 0; resetClip(app, 'word'); },
  'listen-tv-skip'(app) {
    const clip = currentClip();
    if (!clip) return;
    app.store.update(state => { state.listening.clips[clip.id] = 'skipped'; });
    nextClip(app);
    app.notify(h('tvSkipped'));
  },
  'listen-tv-check'(app) {
    const clip = currentClip();
    if (!clip || !media.heard || !media.answer.trim() || media.result) return;
    media.result = checkListening(clipTask(clip), media.answer);
    if (media.result.correct) app.store.update(state => { state.listening.clips[clip.id] = 'done'; });
    redraw(app, '[data-action="listen-tv-next"]');
  }
};

export async function libraryPlay() {
  const clip = currentClip();
  const selected = media;
  if (clip && await playListening(audio, clip.start, clip.end) && selected === media && currentClip() === clip) {
    media.heard = true;
    syncCheckButton();
  }
}

export const libraryPause = () => audio?.pause();

export function mountLibrary(app, root) {
  if (!listed && !loadingList && canLoadLocal()) void indexServer(app);
  const element = root.querySelector('[data-listening-audio]');
  if (element && media?.episode.file) {
    objectUrl = URL.createObjectURL(media.episode.file);
    element.src = objectUrl;
  }
  audio = mountListeningAudio(root);
  return () => {
    audio?.dispose();
    audio = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  };
}
