// Hörtraining: the listening trainer beside the Hören course. The area page shows the listening profile,
// the daily round and the drills. Every drill trains a part of listening
// that learners of German find hard: decoding whole sentences (dictation),
// telling sounds apart, numbers, the verb at the end of the sentence,
// everyday reduced speech, and longer texts heard several times.
import { t, num, getLang } from '../i18n/index.js';
import { esc, prose, de, link, button, crumbs, formatDay } from '../components/html.js';
import { icons } from '../components/icons.js';
import { resumeCard } from '../components/widgets.js';
import { stopFor } from '../components/stops.js';
import { currentLevel } from '../engine/areas.js';
import { wordList } from '../engine/words.js';
import { award as awardEvent } from '../engine/gamification.js';
import * as L from '../engine/listening-trainer.js';
import { speak, speakLines, playRecording, stopAudio, germanVoices, chooseVoice, speechAvailable, onVoicesChanged } from '../components/speech.js';

export const DRILLS = ['diktat', 'laute', 'zahlen', 'satzende', 'alltag', 'karten'];
export const KEYS = new Set(['runde', 'einstufung', 'texte', 'methode', ...DRILLS]);
const LEVEL_ORDER = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5 };
const XP_FOR = { diktat: [2, 4, 6], choice: 2, card: 2, text: 12 };

// What is happening in the drill on screen. Kept in memory only: a reload
// starts a new item, finished items are saved in the learner state.
let live = null;

const listening = app => app.state.listenTrainer;
const level = app => currentLevel(app.state);
const theta = app => L.thetaOf(listening(app), level(app));
const percent = value => `${num(Math.round((value ?? 0) * 100))} %`;
const rateLabel = rate => `${num(rate)}×`;
const shuffle = list => list.map(value => [Math.random(), value]).sort((a, b) => a[0] - b[0]).map(([, value]) => value);
const voiceReady = () => speechAvailable() && germanVoices().length > 0;
const textOf = (app, id) => app.ctx.listenTrainer.textById.get(id);
const modeName = mode => t('lisModes')[mode] || mode;

export function title(app, route) {
  if (!route.key) return t('lisTrainer');
  if (route.key.startsWith('text-')) return textOf(app, route.key.slice(5))?.title[getLang()] || t('navListening');
  return { runde: t('lisRound'), einstufung: t('lisPlacement'), texte: t('lisTexts'), methode: t('lisMethod') }[route.key] || modeName(route.key);
}

// ── Shared pieces ───────────────────────────────────────────────────────

function voiceNotice() {
  if (voiceReady()) return '';
  return `<section class="notice lis-voice-notice" role="status"><strong>${t('lisNoVoiceTitle')}</strong> ${prose(t('lisNoVoiceText'))}</section>`;
}

function playButtons(label = t('lisPlay'), { slow = true, count = true } = {}) {
  const replays = live?.replays || 0;
  return `<div class="lis-player">
    <button type="button" class="lis-play" data-action="lis-play" aria-describedby="lis-replays">
      <span class="lis-play-icon" aria-hidden="true">${icons.play}</span><span>${label}</span></button>
    ${slow ? button('lis-slow', `${icons.slow}<span>${t('lisSlow')}</span>`, 'quiet lis-slow') : ''}
    ${count ? `<span id="lis-replays" class="lis-replays">${t('lisReplays', num(replays))}</span>` : ''}
  </div>`;
}

function rateSelect(app) {
  const rate = listening(app).rate;
  return `<label class="lis-rate"><span>${t('lisSpeed')}</span>
    <select data-lis-rate>${L.RATES.map(value => `<option value="${value}" ${value === rate ? 'selected' : ''}>${rateLabel(value)}${value < 1 ? ` · ${t('lisSupport')}` : value === 1 ? ` · ${t('lisNormal')}` : ''}</option>`).join('')}</select></label>`;
}

function counter(done, total) {
  return `<p class="lis-count"><span>${t('lisItemOf', num(done + 1), num(total))}</span><span class="bar" aria-hidden="true"><i style="inline-size:${Math.round(done / Math.max(1, total) * 100)}%"></i></span></p>`;
}

const umlautKeys = () => `<div class="lis-keys" role="group" aria-label="${esc(t('lisSpecialChars'))}">${['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'].map(ch =>
  `<button type="button" class="lis-key" data-action="lis-char" data-char="${ch}" lang="de">${ch}</button>`).join('')}</div>`;

function nextButton(label = t('lisNext')) {
  return `<div class="actions lis-next">${button('lis-next', label, 'primary', 'data-lis-focus')}</div>`;
}

// ── Item choice ─────────────────────────────────────────────────────────

function pickFrom(app, list, mode) {
  const ls = listening(app);
  const max = Math.max(2, Math.round(theta(app) + 0.6));
  const recent = new Set([...ls.attempts.filter(entry => entry.mode === mode).slice(-15).map(entry => entry.id), ...(live?.used || [])]);
  let pool = list.filter(item => (LEVEL_ORDER[item.level] || 3) <= max && !recent.has(item.id));
  if (!pool.length) pool = list.filter(item => !(live?.used || []).includes(item.id));
  if (!pool.length) pool = list;
  return pool[Math.floor(Math.random() * pool.length)];
}

function newItem(app, mode) {
  const { ctx } = app;
  const ls = listening(app);
  const seed = Math.random();
  if (mode === 'diktat') {
    const clip = L.pickClip(ctx, ls, level(app), Math.random, live?.used || []);
    return clip && { mode, id: clip.id, clip, difficulty: L.clipDifficulty(clip), seed };
  }
  if (mode === 'laute') {
    const trial = L.makeContrastTrial(ctx, ls, live?.contrast || '');
    return { mode, id: trial.contrast, ...trial, seed, jitter: 0.9 + Math.random() * 0.2 };
  }
  if (mode === 'zahlen') {
    const kinds = live?.session ? ['zahl', 'uhrzeit', 'preis', 'datum', 'telefon'] : L.NUMBER_KINDS;
    const kind = live?.numberKind && live.numberKind !== 'mix' ? live.numberKind : kinds[Math.floor(Math.random() * kinds.length)];
    return { mode, id: kind, number: L.makeNumberItem(kind), seed };
  }
  if (mode === 'satzende') {
    const item = pickFrom(app, ctx.listenTrainer.predict, mode);
    return item && { mode, id: item.id, item, order: shuffle(item.options.map((_, i) => i)), seed };
  }
  if (mode === 'alltag') {
    const item = pickFrom(app, ctx.listenTrainer.casual, mode);
    return item && { mode, id: item.id, item, order: shuffle(item.options.map((_, i) => i)), seed };
  }
  if (mode === 'karten') {
    const due = L.dueCards(ls, app.day()).filter(text => !(live?.used || []).includes(text));
    return due.length ? { mode, id: due[0], text: due[0], from: ls.cards[due[0]]?.from, seed } : null;
  }
  return null;
}

// The drill for this page: the route itself, or the current step of the
// daily round or the placement check.
function sessionOf(app, route) {
  if (!['runde', 'einstufung'].includes(route.key)) return null;
  const session = listening(app).session;
  return session && session.kind === route.key && session.day === app.day() ? session : null;
}

function ensureLive(app, route) {
  const session = sessionOf(app, route);
  const task = session?.tasks[session.at] || null;
  const mode = task ? task.mode : DRILLS.includes(route.key) ? route.key : route.key?.startsWith('text-') ? 'text' : null;
  const stamp = `${route.key}|${session ? `${session.day}:${session.at}` : ''}|${mode}`;
  if (!live || live.stamp !== stamp) {
    live = { stamp, mode, session: Boolean(session), test: session?.kind === 'einstufung', used: [], done: 0, right: 0,
      contrast: live?.contrast || '', numberKind: live?.numberKind || 'mix', replays: 0, phase: 'listen', item: null, textPhase: 'pre' };
  }
  if (!live.item && DRILLS.includes(mode)) {
    live.item = newItem(app, mode);
    live.phase = 'listen';
    live.replays = 0;
  }
  return { session, task, mode };
}

// ── Playing audio ───────────────────────────────────────────────────────

function voiceFor(app, seed, speaker = 0) {
  const ls = listening(app);
  return chooseVoice({ voice: ls.voice, vary: !ls.voice, speaker, seed });
}

async function playItem(app, { slow = false } = {}) {
  const item = live?.item;
  if (!item) return;
  const ls = listening(app);
  const rate = slow ? 0.75 : ls.rate;
  const voice = voiceFor(app, item.seed);
  const counted = live.phase === 'listen';
  if (counted) {
    live.replays += 1;
    if (slow) live.slowed = true;
    const shown = document.querySelector('#lis-replays');
    if (shown) shown.textContent = t('lisReplays', num(live.replays));
  }
  const text = { diktat: item.clip?.de, laute: item.pair?.[item.target], zahlen: item.number?.say, alltag: item.item?.spoken, karten: item.text,
    satzende: item.item && (live.phase === 'listen' ? `${item.item.start} …` : `${item.item.start} ${item.item.options[item.item.answer]}.`) }[item.mode];
  document.body.classList.add('lis-playing');
  let ms = null;
  try {
    ms = await speak(text, { rate: item.mode === 'laute' ? rate * item.jitter : rate, voice });
  } finally {
    document.body.classList.remove('lis-playing');
  }
  if (ms) {
    app.store.update(state => { state.listenTrainer.seconds += ms / 1000; });
    // The first full-speed playback gives the real speaking rate.
    if (item.mode === 'diktat' && !slow && !live.ms) live.ms = ms;
  }
}

// Plays the sentence with the transcript and marks each word as it is spoken.
async function playWithText(app) {
  const item = live?.item;
  const box = document.querySelector('[data-lis-transcript]');
  if (!item || !box) return;
  box.hidden = false;
  const words = [...box.querySelectorAll('[data-at]')];
  const mark = index => words.forEach(word => word.classList.toggle('now', Number(word.dataset.at) <= index && index < Number(word.dataset.end)));
  const ms = await speak(item.clip.de, { rate: listening(app).rate, voice: voiceFor(app, item.seed), onWord: mark });
  words.forEach(word => word.classList.remove('now'));
  if (ms) app.store.update(state => { state.listenTrainer.seconds += ms / 1000; });
}

function textVoices(app, text) {
  const speakers = [...new Set(text.lines.map(([speaker]) => speaker))];
  const voices = {};
  const pitches = {};
  const seed = live?.textSeed ?? (live && (live.textSeed = Math.random()));
  speakers.forEach((speaker, i) => {
    voices[speaker] = voiceFor(app, seed, i);
    pitches[speaker] = germanVoices().length > 1 ? 1 : [1, 0.78, 1.18][i % 3];
  });
  return { voices, pitches };
}

async function playText(app, text, only = null) {
  const ls = listening(app);
  const lines = only === null ? text.lines : [text.lines[only]];
  const highlight = index => {
    for (const row of document.querySelectorAll('[data-lis-line]')) row.classList.toggle('now', only === null ? Number(row.dataset.lisLine) === index : Number(row.dataset.lisLine) === only && index >= 0);
  };
  document.body.classList.add('lis-playing');
  let ms;
  try {
    if (text.recording && only === null) ms = await playRecording(app.ctx.learning.examSample?.listening?.audio, ls.rate);
    else ms = await speakLines(lines, { rate: ls.rate, ...textVoices(app, text), onLine: highlight });
  } finally {
    document.body.classList.remove('lis-playing');
  }
  if (ms) app.store.update(state => { state.listenTrainer.seconds += ms / 1000; });
}

// ── Recording results ───────────────────────────────────────────────────

// XP is added quietly; only the daily goal, a new rank or a badge is announced.
function award(app, xp) {
  if (xp <= 0) return;
  const notes = app.store.update(state => awardEvent(app.ctx, state, { kind: 'listen', xp }, app.day()));
  app.toast?.(notes.filter(note => note.type !== 'xp'));
}

function record(app, entry) {
  app.store.update(state => L.recordAttempt(state.listenTrainer, { day: app.day(), ...entry }));
}

function checkDictation(app) {
  const item = live.item;
  const answer = document.querySelector('#lis-answer')?.value || '';
  const result = L.compareDictation(item.clip.de, answer);
  const ls = listening(app);
  const rate = live.slowed ? Math.min(ls.rate, 0.75) : ls.rate;
  const sps = live.ms ? L.syllables(item.clip.de) / (live.ms / 1000) : null;
  const err = Object.fromEntries(Object.entries(result.errors).filter(([, n]) => n > 0));
  const missed = L.missedWords(result);
  app.store.update(state => {
    const own = state.listenTrainer;
    L.updateTheta(own, level(app), item.difficulty, result.accuracy, { rate, replays: live.replays, step: live.test ? 1 : 0.5 });
    L.recordAttempt(own, { day: app.day(), mode: 'diktat', id: item.id, acc: Math.round(result.accuracy * 100) / 100, replays: live.replays, rate,
      ...(sps ? { sps: Math.round(sps * 10) / 10 } : {}), ...(Object.keys(err).length ? { err } : {}) });
    for (const word of missed) L.addCard(own, word, app.day(), item.clip.de);
  });
  live.result = { ...result, answer, missed, sps };
  live.phase = 'checked';
  live.right += result.accuracy >= 0.8 ? 1 : 0;
  award(app, result.accuracy >= 0.8 ? XP_FOR.diktat[2] : result.accuracy >= 0.5 ? XP_FOR.diktat[1] : XP_FOR.diktat[0]);
}

function choose(app, choice) {
  const item = live.item;
  let correct;
  if (item.mode === 'laute') {
    correct = choice === item.target;
    app.store.update(state => L.recordContrast(state.listenTrainer, item.contrast, correct));
  } else {
    // Everyday forms list the standard sentence first; the order is shuffled on screen.
    correct = choice === (item.mode === 'alltag' ? 0 : item.item.answer);
  }
  record(app, { mode: item.mode, id: item.id, acc: correct ? 1 : 0, replays: live.replays, rate: listening(app).rate });
  live.choice = choice;
  live.correct = correct;
  live.phase = 'checked';
  live.right += correct ? 1 : 0;
  award(app, correct ? XP_FOR.choice : 0);
}

function checkTyped(app) {
  const item = live.item;
  const typed = document.querySelector('#lis-answer')?.value || '';
  const correct = item.mode === 'zahlen' ? L.checkNumber(item.number, typed) : L.sameText(item.text, typed);
  if (item.mode === 'zahlen') record(app, { mode: 'zahlen', id: item.number.kind, acc: correct ? 1 : 0, replays: live.replays, rate: listening(app).rate, ...(correct ? {} : { err: { number: 1 } }) });
  else {
    app.store.update(state => L.gradeCard(state.listenTrainer, item.text, correct, app.day()));
    record(app, { mode: 'karten', id: item.text.slice(0, 80), acc: correct ? 1 : 0, replays: live.replays, rate: listening(app).rate });
  }
  live.typed = typed;
  live.correct = correct;
  live.phase = 'checked';
  live.right += correct ? 1 : 0;
  award(app, correct ? XP_FOR.card : 0);
}

// One item is finished: count it, move the session on, pick the next one.
function next(app) {
  stopAudio();
  const item = live.item;
  if (item) live.used.push(item.id);
  live.done += 1;
  live.item = null;
  if (live.session) {
    const finished = app.store.update(state => L.advanceSession(state.listenTrainer));
    if (finished) finishSession(app);
  }
  app.rerender({ keepScroll: false });
  focusMain();
}

function finishSession(app) {
  app.store.update(state => {
    const own = state.listenTrainer;
    if (own.session?.kind !== 'einstufung') return;
    own.placed = app.day();
    const dictations = own.attempts.filter(entry => entry.mode === 'diktat' && entry.day === app.day()).slice(-6);
    const average = dictations.reduce((sum, entry) => sum + entry.acc, 0) / Math.max(1, dictations.length);
    // Hard at normal speed: start with slightly slower audio as support.
    own.rate = average < 0.55 ? 0.85 : 1;
  });
}

function focusMain() {
  globalThis.requestAnimationFrame?.(() => (document.querySelector('[data-lis-autofocus]') || document.querySelector('#content h1'))?.focus({ preventScroll: false }));
}

// ── Drill screens ───────────────────────────────────────────────────────

function renderDiktat(app) {
  const item = live.item;
  if (live.phase === 'listen') {
    return `<section class="panel lis-task">
      <p class="lis-instruction">${t('lisDictationHow')}</p>
      ${playButtons()}
      <label class="lis-label" for="lis-answer">${t('lisWhatHeard')}</label>
      <textarea id="lis-answer" class="lis-answer" rows="3" lang="de" dir="ltr" spellcheck="false" autocomplete="off" autocapitalize="off" data-lis-autofocus>${esc(live.draft || '')}</textarea>
      ${umlautKeys()}
      <p class="lis-hint">${t('lisKeysHint')}</p>
      <div class="actions">${button('lis-check', t('lisCheck'), 'primary')}${button('lis-giveup', t('lisShowText'), 'quiet')}</div>
    </section>`;
  }
  const result = live.result;
  const kinds = L.ERROR_KINDS.filter(kind => result.errors[kind] > 0);
  const diff = result.parts.map(part => {
    if (part.kind === 'ok') return `<span class="lis-tok ok">${esc(part.expected)}</span>`;
    if (part.kind === 'minor') return `<span class="lis-tok minor" title="${esc(t('lisMinor'))}">${esc(part.expected)}</span>`;
    if (part.kind === 'extra') return `<span class="lis-tok extra"><s>${esc(part.heard)}</s></span>`;
    if (part.kind === 'missed' || !part.heard) return `<span class="lis-tok bad missed"><b>${esc(part.expected)}</b><small>${t('lisKinds').missed}</small></span>`;
    return `<span class="lis-tok bad k-${part.kind}"><s>${esc(part.heard)}</s> <b>${esc(part.expected)}</b><small>${t('lisKinds')[part.kind]}</small></span>`;
  }).join(' ');
  let offset = 0;
  const words = item.clip.de.split(/(\s+)/).map(piece => {
    const at = offset;
    offset += piece.length;
    return /\s/.test(piece) ? piece : `<span data-at="${at}" data-end="${offset}">${esc(piece)}</span>`;
  }).join('');
  const steps = live.test ? '' : `<section class="lis-steps" aria-label="${esc(t('lisStepsLabel'))}">
      <h3>${t('lisStepsTitle')}</h3>
      <ol>
        <li><span>${t('lisStepRead')}</span>${button('lis-with-text', `${icons.play}<span>${t('lisPlayWithText')}</span>`, 'secondary')}</li>
        <li><span>${t('lisStepBlind')}</span>${button('lis-blind', `${icons.play}<span>${t('lisPlayBlind')}</span>`, 'secondary')}</li>
      </ol>
    </section>`;
  return `<section class="panel lis-task lis-result">
    <h2 id="lis-score" tabindex="-1" data-lis-autofocus>${t('lisWordsRight', percent(result.accuracy))}</h2>
    <p class="lis-meta">${t('lisReplays', num(live.replays))}${result.sps ? ` · ${t('lisSps', num(Math.round(result.sps * 10) / 10))}` : ''}</p>
    <div class="lis-diff" lang="de" dir="ltr">${diff}</div>
    <div class="lis-transcript" data-lis-transcript lang="de" dir="ltr"${live.blind ? ' hidden' : ''}><p>${words}</p>
      <p class="lis-translation" lang="ar" dir="rtl">${esc(item.clip.ar)}</p></div>
    ${kinds.length ? `<ul class="lis-kinds">${kinds.map(kind => `<li class="k-${kind}"><strong>${t('lisKinds')[kind]} · ${num(result.errors[kind])}</strong><span>${prose(t('lisKindTips')[kind])}</span></li>`).join('')}</ul>` : `<p class="lis-good">${t('lisPerfect')}</p>`}
    ${result.missed.length ? `<p class="lis-cards-note">${icons.cards}<span>${t('lisAddedCards')} ${result.missed.map(de).join(' · ')}</span></p>` : ''}
    ${steps}
    ${nextButton()}
  </section>`;
}

function contrastPicker(app) {
  const contrasts = app.ctx.listenTrainer.contrasts;
  const lang = getLang();
  return `<label class="lis-filter"><span>${t('lisContrast')}</span><select data-lis-contrast>
    <option value="">${t('lisWeakFirst')}</option>
    ${contrasts.map(contrast => `<option value="${contrast.id}" ${live.contrast === contrast.id ? 'selected' : ''}>${esc(contrast[lang].title)}</option>`).join('')}</select></label>`;
}

function renderLaute(app) {
  const item = live.item;
  const contrast = app.ctx.listenTrainer.contrasts.find(entry => entry.id === item.contrast);
  const lang = getLang();
  const answered = live.phase === 'checked';
  const options = item.pair.map((word, i) => {
    const state = answered ? (i === item.target ? 'right' : i === live.choice ? 'wrong' : '') : '';
    return `<button type="button" class="lis-option ${state}" data-action="lis-choose" data-choice="${i}" lang="de" dir="ltr" ${answered ? 'disabled' : ''}>${esc(word)}</button>`;
  }).join('');
  return `<section class="panel lis-task">
    ${live.session ? '' : contrastPicker(app)}
    <p class="lis-instruction">${t('lisSoundHow')}</p>
    ${playButtons(t('lisPlay'), { slow: false })}
    <div class="lis-options two">${options}</div>
    ${answered ? `<div class="lis-feedback ${live.correct ? 'good' : 'bad'}" role="status">
        <h2 tabindex="-1" data-lis-autofocus>${live.correct ? t('lisRight') : t('lisWrongHeard', item.pair[item.target])}</h2>
        <p><strong>${esc(contrast[lang].title)}</strong> · ${prose(contrast[lang].tip)}</p>
        <div class="actions">${item.pair.map(word => button('lis-say', `${icons.play}<span lang="de" dir="ltr">${esc(word)}</span>`, 'secondary', `data-say="${esc(word)}"`)).join('')}</div>
      </div>${nextButton()}` : ''}
  </section>`;
}

function renderZahlen(app) {
  const item = live.item;
  const kinds = ['mix', ...L.NUMBER_KINDS];
  const picker = live.session ? '' : `<label class="lis-filter"><span>${t('lisNumberKind')}</span><select data-lis-numkind>${kinds.map(kind =>
    `<option value="${kind}" ${live.numberKind === kind ? 'selected' : ''}>${t('lisNumberKinds')[kind]}</option>`).join('')}</select></label>`;
  if (live.phase === 'listen') {
    return `<section class="panel lis-task">${picker}
      <p class="lis-instruction">${t('lisNumberHow')[item.number.kind]}</p>
      ${playButtons()}
      <label class="lis-label" for="lis-answer">${t('lisYourAnswer')}</label>
      <input id="lis-answer" class="lis-answer short" lang="de" dir="ltr" inputmode="${['zahl', 'jahr', 'telefon'].includes(item.number.kind) ? 'numeric' : 'text'}" autocomplete="off" placeholder="${esc(t('lisNumberPlaceholder')[item.number.kind])}" data-lis-autofocus>
      <div class="actions">${button('lis-check', t('lisCheck'), 'primary')}</div>
    </section>`;
  }
  return `<section class="panel lis-task">${picker}
    <div class="lis-feedback ${live.correct ? 'good' : 'bad'}" role="status">
      <h2 tabindex="-1" data-lis-autofocus>${live.correct ? t('lisRight') : t('lisNotQuite')}</h2>
      <p>${t('lisSolution')} <strong>${de(item.number.shown)}</strong>${live.correct ? '' : ` · ${t('yourAnswer')} ${de(live.typed || '—')}`}</p>
      <p>${t('lisSpokenAs')} <q lang="de" dir="ltr">${esc(item.number.say)}</q></p>
      <p class="lis-hint">${prose(t('lisNumberTips')[item.number.kind])}</p>
      ${playButtons(t('lisPlayAgain'), { slow: true, count: false })}
    </div>${nextButton()}</section>`;
}

function renderChoice(app) {
  const item = live.item;
  const source = item.item;
  const lang = getLang();
  const answered = live.phase === 'checked';
  const correctIndex = item.mode === 'alltag' ? 0 : source.answer;
  const options = item.order.map(i => {
    const state = answered ? (i === correctIndex ? 'right' : i === live.choice ? 'wrong' : '') : '';
    return `<button type="button" class="lis-option ${state}" data-action="lis-choose" data-choice="${i}" lang="de" dir="ltr" ${answered ? 'disabled' : ''}>${esc(source.options[i])}</button>`;
  }).join('');
  const how = item.mode === 'satzende' ? t('lisPredictHow') : t('lisCasualHow');
  const explanation = item.mode === 'satzende'
    ? `<p class="lis-full" lang="de" dir="ltr">${esc(source.start)} <mark>${esc(source.options[source.answer])}</mark>.</p><p>${prose(source[lang])}</p>`
    : `<p class="lis-pair"><span>${t('lisHeard')}</span> ${de(source.spoken)}</p><p class="lis-pair"><span>${t('lisStandard')}</span> ${de(source.options[0])}</p>
       <p>${prose(app.ctx.listenTrainer.rules[source.rule]?.[lang] || '')}</p>`;
  return `<section class="panel lis-task">
    <p class="lis-instruction">${how}</p>
    ${playButtons(item.mode === 'satzende' && answered ? t('lisPlayFull') : t('lisPlay'), { slow: true, count: !answered })}
    <div class="lis-options">${options}</div>
    ${answered ? `<div class="lis-feedback ${live.correct ? 'good' : 'bad'}" role="status">
      <h2 tabindex="-1" data-lis-autofocus>${live.correct ? t('lisRight') : t('lisNotQuite')}</h2>${explanation}</div>${nextButton()}` : ''}
  </section>`;
}

function renderKarten(app) {
  const item = live.item;
  if (!item) {
    const ls = listening(app);
    const upcoming = L.nextDueDay(ls, app.day());
    const words = wordList(app.state).length;
    return `<section class="panel lis-task lis-empty">
      <span class="empty-icon" aria-hidden="true">${icons.cards}</span>
      <div><h2>${t('lisCardsNone')}</h2><p>${t('lisCardsHow')}</p>
      ${upcoming ? `<p class="lis-meta">${t('lisCardsNext', formatDay(upcoming, { day: 'numeric', month: 'long' }))}</p>` : ''}
      <div class="actions">${words ? button('lis-add-words', t('lisAddMyWords', num(words)), 'secondary') : ''}${link('hoertraining/diktat', t('lisModes').diktat, 'primary')}</div></div>
    </section>`;
  }
  if (live.phase === 'listen') {
    return `<section class="panel lis-task">
      <p class="lis-instruction">${t('lisCardHow')}</p>
      ${playButtons()}
      <label class="lis-label" for="lis-answer">${t('lisWhatHeard')}</label>
      <input id="lis-answer" class="lis-answer short" lang="de" dir="ltr" autocomplete="off" autocapitalize="off" spellcheck="false" data-lis-autofocus>
      ${umlautKeys()}
      <div class="actions">${button('lis-check', t('lisCheck'), 'primary')}</div>
    </section>`;
  }
  return `<section class="panel lis-task">
    <div class="lis-feedback ${live.correct ? 'good' : 'bad'}" role="status">
      <h2 tabindex="-1" data-lis-autofocus>${live.correct ? t('lisRight') : t('lisNotQuite')}</h2>
      <p>${t('lisSolution')} <strong>${de(item.text)}</strong>${live.correct ? '' : ` · ${t('yourAnswer')} ${de(live.typed || '—')}`}</p>
      ${item.from ? `<p class="lis-hint">${t('lisFrom')} ${de(item.from)}</p>` : ''}
      <p class="lis-hint">${t(live.correct ? 'lisCardLater' : 'lisCardTomorrow')}</p>
    </div>${nextButton()}</section>`;
}

function renderReflection(app) {
  const chosen = live.tags || [];
  return `<section class="panel lis-task">
    <h2 tabindex="-1" data-lis-autofocus>${t('lisReflectTitle')}</h2>
    <p class="lis-instruction">${t('lisReflectHow')}</p>
    <div class="lis-chips">${L.REFLECT_TAGS.map(tag => `<button type="button" class="lis-chip" data-action="lis-tag" data-tag="${tag}" aria-pressed="${chosen.includes(tag)}">${t('lisReflectTags')[tag]}</button>`).join('')}</div>
    <div class="actions">${button('lis-reflect-save', chosen.length ? t('lisReflectSave') : t('lisReflectNothing'), 'primary')}</div>
  </section>`;
}

// ── Listening texts ─────────────────────────────────────────────────────

const PHASES = ['pre', 'gist', 'detail', 'transcript', 'reflect', 'done'];

function renderText(app, text, inSession) {
  const lang = getLang();
  const phase = live.textPhase;
  const steps = (inSession ? PHASES.slice(0, 4) : PHASES.slice(0, 5)).map(name => `<li class="${name === phase ? 'now' : PHASES.indexOf(name) < PHASES.indexOf(phase) ? 'done' : ''}">${t('lisTextSteps')[name]}</li>`).join('');
  const glossary = `<details class="lis-glossary"><summary>${t('lisKeyWords')}</summary><dl>${Object.entries(text.words || {}).map(([word, meaning]) =>
    `<div><dt lang="de" dir="ltr">${esc(word)}</dt><dd lang="ar" dir="rtl">${esc(meaning)}</dd></div>`).join('')}</dl></details>`;
  const head = `<ol class="lis-text-steps">${steps}</ol>`;
  const player = label => `<div class="lis-player">${button('lis-text-play', `${icons.play}<span>${label}</span>`, 'primary lis-play-btn')}${button('lis-stop', t('lisStop'), 'quiet')}</div>`;
  let body = '';
  if (phase === 'pre') {
    body = `<p class="lis-situation">${esc(text.situation[lang])}</p>
      ${text.recording ? `<p class="lis-badge">${t('lisRecording')}</p>` : `<p class="lis-hint">${t('lisTtsNote')}</p>`}
      <label class="lis-label" for="lis-predict">${t('lisPredict')}</label>
      <input id="lis-predict" class="lis-answer short" lang="de" dir="ltr" autocomplete="off" value="${esc(live.prediction || '')}" data-lis-autofocus>
      ${glossary}
      <div class="actions">${button('lis-text-phase', t('lisStartGist'), 'primary', 'data-phase="gist" data-play="1"')}</div>`;
  } else if (phase === 'gist') {
    const answered = live.gist !== undefined;
    const order = live.gistOrder ||= shuffle(text.gist.options.map((_, i) => i));
    body = `<p class="lis-instruction">${t('lisGistHow')}</p>${player(t('lisPlay'))}
      <h3>${t('lisGistQuestion')}</h3>
      <div class="lis-options">${order.map(i => `<button type="button" class="lis-option ${answered ? (i === text.gist.answer ? 'right' : i === live.gist ? 'wrong' : '') : ''}" data-action="lis-gist" data-choice="${i}" lang="de" dir="ltr" ${answered ? 'disabled' : ''}>${esc(text.gist.options[i])}</button>`).join('')}</div>
      ${answered ? `<p class="lis-feedback ${live.gist === text.gist.answer ? 'good' : 'bad'}" role="status" tabindex="-1" data-lis-autofocus>${live.gist === text.gist.answer ? t('lisRight') : t('lisGistWrong')}</p>
        <div class="actions">${button('lis-text-phase', t('lisStartDetail'), 'primary', 'data-phase="detail" data-play="1"')}</div>` : ''}`;
  } else if (phase === 'detail') {
    const checked = live.detailChecked;
    const answers = live.detail || {};
    body = `<p class="lis-instruction">${t('lisDetailHow')}</p>${player(t('lisPlay'))}
      <div class="lis-rf">${text.items.map((item, i) => {
        const value = answers[i];
        const right = value === item.answer;
        return `<fieldset class="lis-rf-item ${checked ? (right ? 'good' : 'bad') : ''}"><legend lang="de" dir="ltr">${esc(item.prompt)}</legend>
          <div class="lis-rf-choices">${[['true', 'correctWord'], ['false', 'incorrectWord']].map(([key, label]) =>
            `<label><input type="radio" name="lis-rf-${i}" value="${key}" data-lis-rf="${i}" ${value === key ? 'checked' : ''} ${checked ? 'disabled' : ''}> ${t(label)}</label>`).join('')}</div>
          ${checked ? `<p class="lis-quote">${right ? t('lisRight') : `${t('examCorrectAnswer')} · ${t(item.answer === 'true' ? 'correctWord' : 'incorrectWord')}`} · ${de(item.quote)}</p>` : ''}</fieldset>`;
      }).join('')}</div>
      ${checked ? `<p class="lis-score" tabindex="-1" data-lis-autofocus>${t('examScore', num(live.score), num(text.items.length))}</p>
        <div class="actions">${button('lis-text-phase', t('lisShowTranscript'), 'primary', 'data-phase="transcript"')}</div>`
        : `<div class="actions">${button('lis-text-check', t('lisCheck'), 'primary')}</div>`}`;
  } else if (phase === 'transcript') {
    const quotes = text.items.map(item => item.quote);
    const marked = line => {
      let html = esc(line);
      for (const quote of quotes) html = html.replace(esc(quote), `<mark>${esc(quote)}</mark>`);
      return html;
    };
    body = `<p class="lis-instruction">${t('lisTranscriptHow')}</p>
      <ol class="lis-lines" lang="de" dir="ltr" data-lis-lines${live.blind ? ' hidden' : ''}>${text.lines.map(([speaker, line], i) => `<li data-lis-line="${i}">
        ${new Set(text.lines.map(([s]) => s)).size > 1 ? `<span class="lis-speaker">${esc(speaker)}</span>` : ''}
        <span class="lis-line-text">${marked(line)}</span>
        ${text.recording ? '' : `<button type="button" class="icon-btn lis-line-play" data-action="lis-line" data-line="${i}" aria-label="${esc(t('lisPlayLine', num(i + 1)))}">${icons.play}</button>`}</li>`).join('')}</ol>
      ${glossary}
      <div class="actions">${button('lis-text-play', `${icons.play}<span>${t('lisPlayWithTextAll')}</span>`, 'secondary')}
        ${button('lis-text-blind', `${icons.play}<span>${t('lisPlayBlind')}</span>`, 'secondary')}
        ${inSession ? button('lis-next', t('lisNext'), 'primary', 'data-lis-focus') : button('lis-text-phase', t('lisToReflect'), 'primary', 'data-phase="reflect"')}</div>`;
  } else if (phase === 'reflect') {
    const chosen = live.tags || [];
    body = `<h3 tabindex="-1" data-lis-autofocus>${t('lisReflectTitle')}</h3><p class="lis-instruction">${t('lisReflectHow')}</p>
      <div class="lis-chips">${L.REFLECT_TAGS.map(tag => `<button type="button" class="lis-chip" data-action="lis-tag" data-tag="${tag}" aria-pressed="${chosen.includes(tag)}">${t('lisReflectTags')[tag]}</button>`).join('')}</div>
      <div class="actions">${button('lis-text-done', t('lisReflectSave'), 'primary')}</div>`;
  } else {
    const nextOne = app.ctx.listenTrainer.texts.find(entry => !listening(app).texts[entry.id] && entry.id !== text.id);
    body = `<div class="lis-feedback good"><h3 tabindex="-1" data-lis-autofocus>${t('lisTextDone')}</h3><p>${t('examScore', num(live.score || 0), num(text.items.length))}</p></div>
      <div class="actions">${nextOne ? link(`hoertraining/text-${nextOne.id}`, t('lisNextText'), 'primary') : ''}${link('hoertraining/texte', t('lisAllTexts'), 'secondary')}</div>`;
  }
  return `<section class="panel lis-task lis-text">${head}${body}</section>`;
}

// ── Pages ───────────────────────────────────────────────────────────────

function drillPage(app, route) {
  const { mode } = ensureLive(app, route);
  const header = `${crumbs([['hoeren', t('navListening')], ['hoertraining', t('lisTrainer')], [null, modeName(mode)]])}
    <section class="simple-banner practice-head lis-head"><h1>${modeName(mode)}</h1><p>${t('lisWhy')[mode]}</p></section>
    ${voiceNotice()}<div class="lis-toolbar">${rateSelect(app)}<span class="lis-tally">${t('lisTally', num(live.done), num(live.right))}</span></div>`;
  const body = !live.item && mode !== 'karten' ? `<section class="panel"><p>${t('lisNothing')}</p></section>` : drillBody(app, mode);
  return header + body;
}

function drillBody(app, mode) {
  if (mode === 'diktat') return renderDiktat(app);
  if (mode === 'laute') return renderLaute(app);
  if (mode === 'zahlen') return renderZahlen(app);
  if (mode === 'satzende' || mode === 'alltag') return renderChoice(app);
  if (mode === 'karten') return renderKarten(app);
  return '';
}

function taskLabel(app, task) {
  if (task.mode === 'text') return `${t('lisModes').text} · ${textOf(app, task.target)?.title[getLang()] || ''}`;
  return `${modeName(task.mode)}${task.n > 1 ? ` · ${num(task.n)}` : ''}`;
}

function sessionPage(app, route) {
  const kind = route.key;
  const ls = listening(app);
  const session = sessionOf(app, route);
  const heading = kind === 'runde' ? t('lisRound') : t('lisPlacement');
  const top = `${crumbs([['hoeren', t('navListening')], ['hoertraining', t('lisTrainer')], [null, heading]])}${voiceNotice()}`;
  if (!session) {
    const plan = kind === 'runde' ? L.planRound(app.ctx, ls, level(app), app.day()) : L.planPlacement(app.day());
    return `${top}<section class="panel lis-intro">
      <h1>${heading}</h1><p>${t(kind === 'runde' ? 'lisRoundIntro' : 'lisPlacementIntro')}</p>
      <p class="lis-meta">${t('lisAbout', num(L.sessionMinutes(plan)))}</p>
      <ol class="lis-plan">${plan.tasks.map(task => `<li><strong>${taskLabel(app, task)}</strong><small>${t('lisWhy')[task.mode] || ''}</small></li>`).join('')}</ol>
      <div class="actions">${button(kind === 'runde' ? 'lis-start-round' : 'lis-start-placement', t('lisStart'), 'primary')}${link('hoertraining', t('lisBack'), 'secondary')}</div>
    </section>`;
  }
  if (session.at >= session.tasks.length) return top + sessionDone(app, session);
  const { task } = ensureLive(app, route);
  const stepper = `<ol class="lis-stepper" aria-label="${esc(heading)}">${session.tasks.map((entry, i) => `<li class="${i < session.at ? 'done' : i === session.at ? 'now' : ''}"><span>${num(i + 1)}</span><small>${esc(modeName(entry.mode))}</small></li>`).join('')}</ol>`;
  const intro = `<section class="simple-banner practice-head lis-head"><h1>${heading}</h1><p>${t('lisStepOf', num(session.at + 1), num(session.tasks.length))} · ${taskLabel(app, task)}</p></section>`;
  let body;
  if (task.mode === 'text') {
    const text = textOf(app, task.target);
    body = text ? renderText(app, text, true) : nextButton();
  } else if (task.mode === 'reflexion') {
    body = renderReflection(app);
  } else {
    body = `${task.n > 1 ? counter(task.done, task.n) : ''}<p class="lis-why">${t('lisWhy')[task.mode]}</p>${live.item ? drillBody(app, task.mode) : nextButton(t('lisSkip'))}`;
  }
  return `${top}${intro}${stepper}<div class="lis-toolbar">${rateSelect(app)}</div>${body}`;
}

function sessionDone(app, session) {
  const ls = listening(app);
  const today = ls.attempts.filter(entry => entry.day === app.day());
  const dictations = today.filter(entry => entry.mode === 'diktat');
  const average = dictations.length ? dictations.reduce((sum, entry) => sum + entry.acc, 0) / dictations.length : null;
  if (session.kind === 'einstufung') {
    const info = L.profile(app.ctx, ls, level(app), app.day());
    return `<section class="panel lis-intro lis-done">
      <h1 tabindex="-1" data-lis-autofocus>${t('lisPlacementDone')}</h1>
      <p class="lis-level-big"><span class="level-code" lang="de" dir="ltr">${info.level}</span>${t('lisEstimated')}</p>
      <ul class="lis-facts">
        <li>${t('lisFactAccuracy')} <strong>${average === null ? '—' : percent(average)}</strong></li>
        <li>${t('lisFactNumbers')} <strong>${info.numbers === null ? '—' : percent(info.numbers)}</strong></li>
        <li>${t('lisFactSpeed')} <strong>${rateLabel(ls.rate)}</strong></li>
        ${info.weak.length ? `<li>${t('lisFactWeak')} <strong>${info.weak.map(entry => esc(entry.contrast[getLang()].title)).join(' · ')}</strong></li>` : ''}
      </ul>
      <p class="lis-hint">${t('lisPlacementNote')}</p>
      <div class="actions">${link('hoertraining/runde', t('lisRoundStart'), 'primary')}${link('hoertraining', t('lisToProfile'), 'secondary')}</div>
    </section>`;
  }
  return `<section class="panel lis-intro lis-done">
    <h1 tabindex="-1" data-lis-autofocus>${t('lisRoundDone')}</h1>
    <p>${t('lisRoundSummary', num(today.length), average === null ? '—' : percent(average))}</p>
    <p class="lis-hint">${t('lisRoundTomorrow')}</p>
    <div class="actions">${link('hoertraining', t('lisToProfile'), 'primary')}${link('hoertraining/texte', t('lisTexts'), 'secondary')}</div>
  </section>`;
}

function textsPage(app) {
  const lang = getLang();
  const ls = listening(app);
  const recommended = L.nextText(app.ctx, ls, level(app));
  return `${crumbs([['hoeren', t('navListening')], ['hoertraining', t('lisTrainer')], [null, t('lisTexts')]])}
    <section class="simple-banner practice-head lis-head"><h1>${t('lisTexts')}</h1><p>${t('lisTextsIntro')}</p></section>
    ${voiceNotice()}
    <ul class="lis-text-list">${app.ctx.listenTrainer.texts.map(text => {
      const done = ls.texts[text.id];
      return `<li class="panel lis-text-card ${text.id === recommended?.id ? 'recommended' : ''}">
        <div><p class="lis-meta"><span class="level-chip" lang="de" dir="ltr">${text.level}</span> ${t('lisTextKinds')[text.kind]}${text.recording ? ` · ${t('lisRecording')}` : ''}</p>
          <h2>${esc(text.title[lang])}</h2><p>${esc(text.situation[lang])}</p>
          ${done ? `<p class="lis-meta">${icons.check} ${t('lisHeardOn', formatDay(done.day, { day: 'numeric', month: 'long' }), percent(done.score))}</p>` : ''}</div>
        ${link(`hoertraining/text-${text.id}`, done ? t('lisListenAgain') : t('lisListen'), text.id === recommended?.id && !done ? 'primary' : 'secondary')}
      </li>`;
    }).join('')}</ul>`;
}

function textPage(app, route) {
  const text = textOf(app, route.key.slice(5));
  ensureLive(app, route);
  return `${crumbs([['hoeren', t('navListening')], ['hoertraining', t('lisTrainer')], ['hoertraining/texte', t('lisTexts')], [null, esc(text.title[getLang()])]])}
    <section class="simple-banner practice-head lis-head"><h1>${esc(text.title[getLang()])}</h1>
      <p><span class="level-chip" lang="de" dir="ltr">${text.level}</span> ${t('lisTextKinds')[text.kind]}</p></section>
    ${voiceNotice()}<div class="lis-toolbar">${rateSelect(app)}</div>
    ${renderText(app, text, false)}`;
}

function methodPage() {
  const rows = t('lisMethodRows');
  return `${crumbs([['hoeren', t('navListening')], ['hoertraining', t('lisTrainer')], [null, t('lisMethod')]])}
    <section class="page-head"><h1>${t('lisMethod')}</h1><p>${t('lisMethodIntro')}</p></section>
    <section class="panel lis-method">
      <h2>${t('lisMethodBottleneck')}</h2><p>${prose(t('lisMethodBottleneckText'))}</p>
      <div class="lis-table-wrap"><table class="lis-table"><thead><tr><th>${t('lisMethodCols')[0]}</th><th>${t('lisMethodCols')[1]}</th><th>${t('lisMethodCols')[2]}</th></tr></thead>
        <tbody>${rows.map(([idea, source, here]) => `<tr><td>${prose(idea)}</td><td>${prose(source)}</td><td>${prose(here)}</td></tr>`).join('')}</tbody></table></div>
      <h2>${t('lisMethodGerman')}</h2><ul>${t('lisMethodGermanList').map(item => `<li>${prose(item)}</li>`).join('')}</ul>
      <h2>${t('lisMethodLimits')}</h2><ul>${t('lisMethodLimitsList').map(item => `<li>${prose(item)}</li>`).join('')}</ul>
    </section>`;
}

function profilePanel(app) {
  const ls = listening(app);
  const info = L.profile(app.ctx, ls, level(app), app.day());
  const lang = getLang();
  const maxError = Math.max(1, ...Object.values(info.errors));
  const advice = L.speedAdvice(ls);
  const tile = (label, value, note = '') => `<li class="lis-tile"><small>${label}</small><strong><bdi dir="ltr">${value}</bdi></strong>${note ? `<span>${note}</span>` : ''}</li>`;
  const errorRows = L.ERROR_KINDS.filter(kind => info.errors[kind] > 0);
  return `<section class="panel lis-profile" aria-labelledby="lis-profile-title">
    <div class="section-row"><h2 id="lis-profile-title">${t('lisProfile')}</h2>${link('hoertraining/methode', t('lisMethodLink'), 'quiet')}</div>
    <ul class="lis-tiles">
      ${tile(t('lisEstimated'), info.level, info.measured ? t('lisFromDictation', num(info.dictations)) : t('lisFromSetting'))}
      ${tile(t('lisFactAccuracy'), info.accuracy === null ? '—' : percent(info.accuracy), t('lisLastN', num(info.dictations)))}
      ${tile(t('lisFactReplays'), info.replays === null ? '—' : num(Math.round(info.replays * 10) / 10), t('lisReplaysNote'))}
      ${tile(t('lisFactSpeed'), rateLabel(ls.rate), info.sps ? t('lisSps', num(Math.round(info.sps * 10) / 10)) : '')}
      ${tile(t('lisFactCards'), num(info.due), t('lisCardsTotal', num(info.cards)))}
      ${tile(t('lisFactMinutes'), num(info.minutes), t('lisMinutesNote'))}
    </ul>
    ${advice ? `<p class="lis-advice">${t('lisAdvice')[advice.change](rateLabel(advice.rate))} ${button('lis-rate-accept', t('lisAdviceAccept'), 'quiet', `data-rate="${advice.rate}"`)}</p>` : ''}
    <div class="lis-profile-grid">
      <div><h3>${t('lisErrorKinds')}</h3>${errorRows.length ? `<ul class="lis-bars">${errorRows.map(kind => `<li><span>${t('lisKinds')[kind]}</span><span class="bar" aria-hidden="true"><i class="k-${kind}" style="inline-size:${Math.round(info.errors[kind] / maxError * 100)}%"></i></span><b>${num(info.errors[kind])}</b></li>`).join('')}</ul>` : `<p class="muted">${t('lisNoErrors')}</p>`}</div>
      <div><h3>${t('lisWeakSounds')}</h3>${info.weak.length ? `<ul class="lis-weak">${info.weak.map(entry => `<li><span>${esc(entry.contrast[lang].title)}</span><b>${num(entry.right)}/${num(entry.total)}</b></li>`).join('')}</ul>` : `<p class="muted">${t('lisNoSounds')}</p>`}</div>
    </div>
  </section>`;
}

function settingsPanel(app) {
  const ls = listening(app);
  const voices = germanVoices();
  return `<details class="panel lis-settings"><summary>${t('lisAudioSettings')}</summary>
    <div class="lis-settings-body">
      <label class="lis-filter"><span>${t('lisVoice')}</span><select data-lis-voice>
        <option value="">${t('lisVoicesVary')}</option>
        ${voices.map(voice => `<option value="${esc(voice.voiceURI)}" ${ls.voice === voice.voiceURI ? 'selected' : ''}>${esc(voice.name)} (${esc(voice.lang)})</option>`).join('')}
      </select></label>
      ${rateSelect(app)}
      ${button('lis-test-voice', `${icons.play}<span>${t('lisTestVoice')}</span>`, 'secondary')}
      <p class="lis-hint">${t('lisVoicesFound', num(voices.length))} ${prose(t('lisVoiceHelp'))}</p>
    </div></details>`;
}

function homePage(app) {
  const ls = listening(app);
  const day = app.day();
  const session = ls.session?.day === day ? ls.session : null;
  const roundDone = session?.kind === 'runde' && session.at >= session.tasks.length;
  const plan = session?.kind === 'runde' && !roundDone ? session : L.planRound(app.ctx, ls, level(app), day);
  const roundState = roundDone ? t('lisRoundDoneShort') : session?.kind === 'runde' ? t('lisStepOf', num(session.at + 1), num(session.tasks.length)) : t('lisAbout', num(L.sessionMinutes(plan)));
  const tiles = [...DRILLS, 'texte'].map(mode => {
    const href = `hoertraining/${mode}`;
    const extra = mode === 'karten' ? ` · ${t('lisDue', num(L.dueCards(ls, day).length))}` : '';
    return `<a class="panel lis-drill" href="#${href}"><span class="lis-drill-icon" aria-hidden="true">${icons[{ diktat: 'writing', laute: 'ear', zahlen: 'hash', satzende: 'arrow', alltag: 'chat', karten: 'cards', texte: 'read' }[mode]]}</span>
      <span><strong>${mode === 'texte' ? t('lisTexts') : modeName(mode)}${extra}</strong><small>${t('lisWhy')[mode === 'texte' ? 'text' : mode]}</small></span></a>`;
  }).join('');
  const stop = stopFor(app, 'listening');
  return `${crumbs([['hoeren', t('navListening')], [null, t('lisTrainer')]])}
    <section class="area-hero mint lis-hero">
      <span class="area-icon" aria-hidden="true">${icons.listen}</span>
      <div><h1>${t('lisTrainer')}</h1><p>${t('lisIntro')}</p></div>
    </section>
    ${voiceNotice()}
    ${ls.placed ? (stop ? resumeCard({ stop }) : '') : resumeCard({ stop: null, eyebrow: t('lisFirstStep'), empty: { title: t('lisPlacement'), detail: t('lisPlacementTeaser'), action: link('hoertraining/einstufung', t('lisStart'), 'primary') } })}
    <section class="panel lis-round-card">
      <div><p class="eyebrow-line">${t('lisToday')}</p><h2>${t('lisRound')}</h2><p class="lis-meta">${roundState}</p>
        <ol class="lis-plan compact">${plan.tasks.map(task => `<li>${taskLabel(app, task)}</li>`).join('')}</ol></div>
      <div class="actions">${roundDone ? link('hoertraining/texte', t('lisTexts'), 'secondary') : link('hoertraining/runde', session?.kind === 'runde' ? t('continueHere') : t('lisRoundStart'), 'primary')}</div>
    </section>
    ${profilePanel(app)}
    <h2 class="lis-section-title">${t('lisTraining')}</h2>
    <div class="lis-drills">${tiles}</div>
    ${settingsPanel(app)}
    ${ls.placed ? `<p class="study-followup">${link('hoertraining/einstufung', t('lisPlacementAgain'), 'quiet')}</p>` : ''}`;
}

export function render(app, route) {
  if (!route.key) return homePage(app);
  if (route.key === 'methode') return methodPage();
  if (route.key === 'texte') return textsPage(app);
  if (route.key.startsWith('text-')) return textPage(app, route);
  if (route.key === 'runde' || route.key === 'einstufung') return sessionPage(app, route);
  return drillPage(app, route);
}

// ── Events ──────────────────────────────────────────────────────────────

function redraw(app) {
  app.rerender();
  focusMain();
}

export const actions = {
  'lis-play': app => playItem(app),
  'lis-slow': app => playItem(app, { slow: true }),
  'lis-say': (app, target) => speak(target.dataset.say, { rate: listening(app).rate, voice: voiceFor(app, live?.item?.seed ?? Math.random()) }),
  'lis-stop': () => stopAudio(),
  'lis-char'(app, target) {
    const input = document.querySelector('#lis-answer');
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = input.value.slice(0, start) + target.dataset.char + input.value.slice(end);
    input.focus();
    input.setSelectionRange(start + 1, start + 1);
    if (live) live.draft = input.value;
  },
  'lis-check'(app) {
    if (!live?.item) return;
    stopAudio();
    if (live.item.mode === 'diktat') checkDictation(app);
    else checkTyped(app);
    redraw(app);
  },
  'lis-giveup'(app) {
    if (!live?.item) return;
    stopAudio();
    checkDictation(app);
    redraw(app);
  },
  'lis-with-text'(app) {
    live.blind = false;
    const box = document.querySelector('[data-lis-transcript]');
    if (box) box.hidden = false;
    playWithText(app);
  },
  'lis-blind'(app) {
    live.blind = true;
    const box = document.querySelector('[data-lis-transcript]');
    if (box) box.hidden = true;
    speak(live.item.clip.de, { rate: listening(app).rate, voice: voiceFor(app, live.item.seed) }).then(() => {
      live.blind = false;
      if (box) box.hidden = false;
    });
  },
  'lis-choose'(app, target) {
    if (!live?.item || live.phase !== 'listen') return;
    stopAudio();
    choose(app, Number(target.dataset.choice));
    redraw(app);
    if (live.item.mode === 'satzende') playItem(app);
  },
  'lis-next': app => next(app),
  'lis-start-round'(app) {
    app.store.update(state => { state.listenTrainer.session = L.planRound(app.ctx, state.listenTrainer, level(app), app.day()); });
    live = null;
    app.rerender({ keepScroll: false });
    focusMain();
  },
  'lis-start-placement'(app) {
    app.store.update(state => { state.listenTrainer.session = L.planPlacement(app.day()); });
    live = null;
    app.rerender({ keepScroll: false });
    focusMain();
  },
  'lis-rate-accept'(app, target) {
    const rate = Number(target.dataset.rate);
    if (!L.RATES.includes(rate)) return;
    app.store.update(state => { state.listenTrainer.rate = rate; });
    app.rerender();
  },
  'lis-test-voice': app => speak('Guten Tag! So klingt diese Stimme auf Deutsch.', { rate: listening(app).rate, voice: voiceFor(app, Math.random()) }),
  'lis-add-words'(app) {
    let added = 0;
    app.store.update(state => {
      for (const [word] of wordList(state)) if (L.addCard(state.listenTrainer, word, app.day())) added += 1;
    });
    app.notify(t('lisWordsAdded', num(added)));
    if (live) live.item = null;
    redraw(app);
  },
  'lis-tag'(app, target) {
    live.tags ||= [];
    const tag = target.dataset.tag;
    live.tags = live.tags.includes(tag) ? live.tags.filter(entry => entry !== tag) : [...live.tags, tag];
    target.setAttribute('aria-pressed', String(live.tags.includes(tag)));
    const save = document.querySelector('[data-action="lis-reflect-save"]');
    if (save) save.textContent = live.tags.length ? t('lisReflectSave') : t('lisReflectNothing');
  },
  'lis-reflect-save'(app) {
    const tags = live?.tags || [];
    app.store.update(state => {
      if (tags.length) state.listenTrainer.reflections.push({ day: app.day(), tags });
      state.listenTrainer.reflections.splice(0, Math.max(0, state.listenTrainer.reflections.length - 60));
    });
    live.tags = [];
    next(app);
  },
  // Listening texts
  'lis-text-play'(app) {
    const text = currentText(app);
    if (!text) return;
    const lines = document.querySelector('[data-lis-lines]');
    if (lines) lines.hidden = false;
    live.blind = false;
    playText(app, text);
  },
  'lis-text-blind'(app) {
    const text = currentText(app);
    const lines = document.querySelector('[data-lis-lines]');
    if (lines) lines.hidden = true;
    live.blind = true;
    playText(app, text).then(() => {
      live.blind = false;
      if (lines) lines.hidden = false;
    });
  },
  'lis-line': (app, target) => playText(app, currentText(app), Number(target.dataset.line)),
  'lis-text-phase'(app, target) {
    stopAudio();
    const phase = target.dataset.phase;
    if (!PHASES.includes(phase)) return;
    if (live.textPhase === 'pre') live.prediction = document.querySelector('#lis-predict')?.value || '';
    live.textPhase = phase;
    redraw(app);
    if (target.dataset.play) playText(app, currentText(app));
  },
  'lis-gist'(app, target) {
    live.gist = Number(target.dataset.choice);
    redraw(app);
  },
  'lis-text-check'(app) {
    const text = currentText(app);
    live.detail = {};
    text.items.forEach((item, i) => {
      const value = document.querySelector(`[name="lis-rf-${i}"]:checked`)?.value;
      if (value) live.detail[i] = value;
    });
    live.score = text.items.filter((item, i) => live.detail[i] === item.answer).length;
    live.detailChecked = true;
    stopAudio();
    const score = live.score / text.items.length;
    app.store.update(state => {
      state.listenTrainer.texts[text.id] = { day: app.day(), score: Math.round(score * 100) / 100 };
      L.recordAttempt(state.listenTrainer, { day: app.day(), mode: 'text', id: text.id, acc: Math.round(score * 100) / 100, rate: state.listenTrainer.rate });
    });
    award(app, XP_FOR.text);
    redraw(app);
  },
  'lis-text-done'(app) {
    const tags = live?.tags || [];
    if (tags.length) app.store.update(state => { state.listenTrainer.reflections.push({ day: app.day(), tags }); });
    live.tags = [];
    live.textPhase = 'done';
    redraw(app);
  }
};

function currentText(app) {
  const route = app.route;
  if (route.key?.startsWith('text-')) return textOf(app, route.key.slice(5));
  const session = sessionOf(app, route);
  const task = session?.tasks[session.at];
  return task?.mode === 'text' ? textOf(app, task.target) : null;
}

export function onChange(app, event) {
  const target = event.target;
  if (target.matches('[data-lis-rate]')) {
    const rate = Number(target.value);
    if (L.RATES.includes(rate)) app.store.update(state => { state.listenTrainer.rate = rate; });
    for (const select of document.querySelectorAll('[data-lis-rate]')) select.value = String(rate);
  } else if (target.matches('[data-lis-voice]')) {
    app.store.update(state => { state.listenTrainer.voice = target.value; });
  } else if (target.matches('[data-lis-contrast]')) {
    live.contrast = target.value;
    live.item = null;
    redraw(app);
  } else if (target.matches('[data-lis-numkind]')) {
    live.numberKind = target.value;
    live.item = null;
    redraw(app);
  } else if (target.matches('[data-lis-rf]')) {
    (live.detail ||= {})[target.dataset.lisRf] = target.value;
  }
}

export function onInput(app, event) {
  if (event.target.id === 'lis-answer' && live) live.draft = event.target.value;
}

// Ctrl+Enter checks the answer, Ctrl+Space plays the audio again.
export function onKey(app, event) {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key === 'Enter' && document.querySelector('[data-action="lis-check"]')) {
    event.preventDefault();
    actions['lis-check'](app);
  } else if (event.code === 'Space' && document.querySelector('[data-action="lis-play"]')) {
    event.preventDefault();
    playItem(app);
  }
}

export function mount(app) {
  // Voices load after the page in some browsers: redraw once they arrive.
  const known = germanVoices().length;
  const off = onVoicesChanged(() => {
    if (germanVoices().length !== known && !document.body.classList.contains('lis-playing')) app.rerender();
  });
  return () => {
    off();
    stopAudio();
  };
}

// For tests: forget the drill in memory.
export function resetLive() {
  live = null;
}
