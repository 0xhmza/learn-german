import { getLang, num } from '../i18n/index.js';
import { h } from '../i18n/listening.js';
import { button, crumbs, esc, link, meter } from '../components/html.js';
import { icons } from '../components/icons.js';
import { mountListeningAudio } from '../components/listening-audio.js';
import { listeningPlayer, playListening, playerStatus } from '../components/listening-player.js';
import { listeningInput, sizeListeningGaps } from '../components/listening-gap.js';
import { checkListening, listeningAssessment, listeningDraft, makeListeningRun, MAX_PLAYS, scoreListening } from '../engine/listening.js';
import { libraryActions, libraryChange, libraryInput, libraryPause, libraryPlay, mountLibrary, renderLibrary } from './listening-library.js';

const base = 'hoeren';
const checkPath = 'hoeren/check';
const urlFor = item => `${base}/${item.id}`;
const label = item => esc(item.title[getLang()]);
const runFor = (app, scene) => app.state.listening.runs[scene.id];
const assessScenes = app => app.ctx.listeningAssessment;
const isLibrary = app => app.route.key === 'folgen' || (app.route.key === 'serien' && !app.ctx.listeningSeries.length);
const sections = app => [...app.ctx.listeningChapters, ...app.ctx.listeningSeries];
const currentScene = app => app.ctx.listeningScenes.get(app.route.key);
let audio = null;

export const title = () => h('overview');

function completion(app, scenes) {
  const done = scenes.filter(scene => runFor(app, scene)?.submitted).length;
  return `${num(done)} / ${num(scenes.length)} ${esc(h('finished'))}`;
}

function landing(app) {
  const scenes = app.ctx.listeningChapters.flatMap(chapter => chapter.scenes);
  const done = scenes.filter(scene => runFor(app, scene)?.submitted).length;
  const resume = scenes.find(scene => listeningDraft(scene, runFor(app, scene))) ?? scenes.find(scene => !runFor(app, scene)?.submitted);
  return `<div class="listening">
    <header class="listening-cover"><div>
      <h1>${esc(h('overview'))}</h1><p>${esc(h('intro'))}</p>
      <div class="listening-cover-progress">${meter(done, scenes.length, h('finished'))}<span>${completion(app, scenes)}</span></div>
      <div class="actions">
        ${resume ? link(urlFor(resume), esc(h(listeningDraft(resume, runFor(app, resume)) ? 'resume' : 'go')), 'primary') : ''}
        ${app.ctx.listeningSeries.length ? link('hoeren/serien', esc(h('tv')), 'secondary') : ''}
      </div>
    </div><div class="listening-cover-mark" aria-hidden="true">${icons.listen}</div></header>
    <section aria-labelledby="listening-chapters"><h2 id="listening-chapters">${esc(h('units'))}</h2>
      <ol class="listening-chapters">${app.ctx.listeningChapters.map(chapter => `<li><a class="panel" href="#${urlFor(chapter)}">
      <small>${completion(app, chapter.scenes)}</small><h3>${label(chapter)}</h3><p>${esc(chapter.description[getLang()])}</p>
      <span>${esc(h('openUnit'))} ${icons.chevron}</span></a></li>`).join('')}</ol>
    </section>
    <div class="listening-extras">
      <section class="panel"><h2>${esc(h('heard'))}</h2><p>${esc(h('heardIntro'))}</p>${link(checkPath, esc(h('heard')), 'primary')}</section>
      <section class="panel"><h2>${esc(h('tv'))}</h2><p>${esc(h('tvIntro'))}</p>${link('hoeren/serien', esc(h('tv')), 'primary')}</section>
    </div>
  </div>`;
}

function seriesPage(app) {
  return `${crumbs([[base, esc(h('nav'))], [null, esc(h('tv'))]])}<div class="listening">
    <header class="listening-cover"><div><h1>${esc(h('tv'))}</h1><p>${esc(h('seriesIntro'))}</p></div>
    <div class="listening-cover-mark" aria-hidden="true">${icons.listen}</div></header>
    <ol class="listening-chapters">${app.ctx.listeningSeries.map(chapter => `<li><a class="panel" href="#${urlFor(chapter)}">
      <small>${completion(app, chapter.scenes)}</small><h2>${label(chapter)}</h2><p>${esc(chapter.description[getLang()])}</p>
      <span>${esc(h('go'))} ${icons.chevron}</span></a></li>`).join('')}</ol>
    ${app.ctx.listeningEpisodeLibrary ? `<div class="actions">${link('hoeren/folgen', esc(h('tvMore')), 'secondary')}</div>` : ''}
    </div>`;
}

function chapterPage(app, chapter) {
  const parents = app.ctx.listeningSeries.includes(chapter) ? [[base, esc(h('nav'))], ['hoeren/serien', esc(h('tv'))]] : [[base, esc(h('nav'))]];
  return `${crumbs([...parents, [null, label(chapter)]])}
    <div class="listening"><header class="listening-heading"><h1>${label(chapter)}</h1><p>${esc(chapter.description[getLang()])}</p></header>
    <ol class="listening-scene-list">${chapter.scenes.map(scene => {
      const run = runFor(app, scene);
      const result = run?.submitted ? scoreListening(scene, run) : null;
      return `<li class="panel"><div><h2>${label(scene)}</h2><span>${scene.source ? `${esc(scene.source)} · ` : ''}${result ? `${num(result.correct)} / ${num(result.total)}` :
        `${num(scene.tasks.length)} ${esc(h('exercises'))}`}</span></div>
        ${link(urlFor(scene), esc(h(result ? 'results' : listeningDraft(scene, run) ? 'resume' : 'go')), result ? 'quiet' : 'secondary')}</li>`;
    }).join('')}</ol></div>`;
}

function checkPage(app) {
  const scenes = assessScenes(app);
  const next = scenes.find(scene => !runFor(app, scene)?.submitted);
  const result = listeningAssessment(app.ctx, app.state);
  return `${crumbs([[base, esc(h('nav'))], [null, esc(h('heard'))]])}<div class="listening">
    <header class="listening-heading"><h1>${esc(h('heard'))}</h1><p>${esc(h('heardIntro'))}</p></header>
    <section class="panel listening-check-page"><p>${completion(app, scenes)}</p>
      ${next ? link(urlFor(next), esc(h(listeningDraft(next, runFor(app, next)) ? 'resume' : 'startedCheck')), 'primary') : `<p>${esc(h('checkComplete'))}</p>`}</section>
    ${result.total ? `<section class="panel"><h2>${esc(h('checkResults'))} · ${num(result.correct)} / ${num(result.total)}</h2>
      <ul class="listening-result-list">${scenes.filter(scene => runFor(app, scene)?.submitted).map(scene => {
        const score = scoreListening(scene, runFor(app, scene));
        return `<li>${link(urlFor(scene), label(scene), 'quiet')}<strong>${num(score.correct)} / ${num(score.total)}</strong></li>`;
      }).join('')}</ul></section>` : ''}
    </div>`;
}

function gapSentence(scene, task, field) {
  const text = scene.lines[task.segment].text;
  const start = text.indexOf(task.answer);
  return `${esc(text.slice(0, start))}${field}${esc(text.slice(start + task.answer.length))}`;
}

function taskCard(scene, task, index, run) {
  const answer = run.answers[index];
  const result = run.submitted ? checkListening(task, answer) : null;
  const id = `listening-answer-${index}`;
  const field = task.options ? '' : listeningInput({ id, attributes: `data-listening-answer="${index}"`, value: answer,
    readOnly: run.submitted, target: task.kind === 'gap' ? task.answer : null });
  return `<fieldset class="panel listening-task${result ? result.correct ? ' yes' : ' no' : ''}">
    <legend>${num(index + 1)}. ${esc(h(task.kind))}</legend>
    ${task.options ? `<p lang="de" dir="ltr" id="listening-prompt-${index}">${esc(task.prompt)}</p>
      <div class="listening-choices" lang="de" dir="ltr" role="group" aria-labelledby="listening-prompt-${index}">${task.options.map((option, i) =>
        `<label><input type="radio" name="listening-answer-${index}" data-listening-answer="${index}" value="${i}" ${answer === String(i) ? 'checked' : ''}
          ${run.submitted ? 'disabled' : ''}> <span>${esc(option)}</span></label>`).join('')}</div>`
      : task.kind === 'gap' ? `<p class="listening-inline" lang="de" dir="ltr">${gapSentence(scene, task, field)}</p>`
        : `<label for="${id}"><span>${esc(h('dictationInstruction'))}</span>${field}</label>`}
    ${Number.isInteger(task.segment) && (!scene.assessment || run.submitted)
      ? button('listen-excerpt', esc(h('sentence')), 'quiet', `data-segment="${task.segment}"`) : ''}
    ${result ? `<div class="listening-feedback">
      <strong>${esc(h(result.correct ? result.spelling ? 'correct' : 'partialNote' : 'solution'))}</strong>
      <p lang="de" dir="ltr">${esc(task.options ? task.options[task.answer] : task.answer)}</p>
      <p lang="de" dir="ltr">${esc(task.note)}</p></div>` : ''}
    </fieldset>`;
}

function scenePage(app, scene) {
  const run = runFor(app, scene) ?? makeListeningRun(scene);
  const chapter = sections(app).find(unit => unit.scenes.includes(scene));
  const parent = scene.assessment ? [checkPath, esc(h('heard'))] : [urlFor(chapter), label(chapter)];
  const next = chapter?.scenes[chapter.scenes.indexOf(scene) + 1];
  const score = run.submitted ? scoreListening(scene, run) : null;
  const source = app.ctx.listeningAudio?.[scene.id] || `${scene.series ? 'listening-clips' : 'listening-audio'}/${scene.id}.mp3`;
  const parents = scene.series ? [[base, esc(h('nav'))], ['hoeren/serien', esc(h('tv'))]] : [[base, esc(h('nav'))]];
  return `${crumbs([...parents, parent, [null, label(scene)]])}
    <div class="listening listening-scene">
      <header class="listening-heading"><h1>${label(scene)}</h1>
        <p>${num(scene.tasks.length)} ${esc(h('exercises'))}${scene.assessment ? ` · ${esc(h('heard'))}` : ''}${scene.source ? ` · ${esc(scene.source)}` : ''}</p></header>
      ${listeningPlayer(source, { limit: scene.assessment && !run.submitted ? run.plays : null })}
      ${score ? `<section class="panel listening-score" id="listening-result" tabindex="-1"><h2>${esc(h('results'))} · ${num(score.correct)} / ${num(score.total)}</h2></section>` : ''}
      ${scene.tasks.map((task, i) => taskCard(scene, task, i, run)).join('')}
      ${score ? `<details class="panel"><summary>${esc(h('transcript'))}</summary>
        ${scene.lines.map(line => `<p lang="de" dir="ltr">${esc(line.text)}</p>`).join('')}</details>` : ''}
      <div class="actions">
        ${score ? `${link(next ? urlFor(next) : parent[0], esc(h(scene.assessment ? 'allResults' : 'next')), 'primary')}
          ${!scene.assessment ? button('listen-retry', esc(h('retry'))) : ''}`
          : button('listen-submit', esc(h('check')), 'primary', run.plays && run.answers.every(answer => answer.trim()) ? '' : 'disabled')}
      </div>
    </div>`;
}

export function render(app, route) {
  if (route.key === 'serien') return app.ctx.listeningSeries.length ? seriesPage(app) : renderLibrary(app);
  if (route.key === 'folgen') return renderLibrary(app, { more: true });
  if (route.key === 'check') return checkPage(app);
  const scene = app.ctx.listeningScenes.get(route.key);
  if (scene) return scenePage(app, scene);
  const unit = sections(app).find(chapter => chapter.id === route.key);
  return unit ? chapterPage(app, unit) : landing(app);
}

function updateRun(app, scene, callback) {
  app.store.update(state => callback(state.listening.runs[scene.id] ??= makeListeningRun(scene)));
}

function syncButtons(run, assessment) {
  const check = document.querySelector('[data-action="listen-submit"]');
  if (check) check.disabled = !(run.plays && run.answers.every(answer => answer.trim()));
  const left = document.querySelector('[data-listening-plays]');
  if (assessment && left) {
    left.textContent = playerStatus(run.plays);
    document.querySelector('[data-action="listen-play"]').disabled = run.plays >= MAX_PLAYS;
  }
}

async function playScene(app, segment = null) {
  const scene = currentScene(app);
  if (!scene) return;
  const run = runFor(app, scene) ?? makeListeningRun(scene);
  const limited = scene.assessment && !run.submitted;
  if (limited && (run.plays >= MAX_PLAYS || segment !== null)) return;
  const [start, end] = segment === null ? [0, null] : (scene.segments[segment] ?? [0, null]);
  if (!await playListening(audio, start, end) || currentScene(app) !== scene) return;
  if (run.submitted) return;
  updateRun(app, scene, record => {
    record.plays = Math.min(MAX_PLAYS, record.plays + 1);
    syncButtons(record, limited);
  });
  if (limited) app.store.flush();
}

export const actions = {
  ...libraryActions,
  'listen-play': app => isLibrary(app) ? libraryPlay() : playScene(app),
  'listen-stop': app => isLibrary(app) ? libraryPause() : audio?.pause(),
  'listen-excerpt': (app, target) => playScene(app, Number(target.dataset.segment)),
  'listen-submit'(app) {
    const scene = currentScene(app);
    const run = runFor(app, scene);
    if (!run || run.submitted || !run.plays || !run.answers.every(answer => answer.trim())) return;
    updateRun(app, scene, attempt => { attempt.submitted = true; });
    app.store.flush();
    app.rerender();
    const result = document.querySelector('#listening-result');
    result?.focus();
    result?.scrollIntoView({ block: 'center' });
  },
  'listen-retry'(app) {
    const scene = currentScene(app);
    if (!scene?.assessment) {
      app.store.update(state => { state.listening.runs[scene.id] = makeListeningRun(scene); });
      app.rerender();
      document.querySelector('[data-action="listen-play"]')?.focus();
    }
  }
};

export function onInput(app, event) {
  if (isLibrary(app)) { libraryInput(event); return; }
  const field = event.target;
  if (!field.hasAttribute('data-listening-answer')) return;
  const scene = currentScene(app);
  if (!scene) return;
  updateRun(app, scene, run => {
    if (run.submitted) return;
    run.answers[Number(field.dataset.listeningAnswer)] = field.value.slice(0, 350);
    syncButtons(run, scene.assessment);
  });
}

export function onChange(app, event) {
  if (isLibrary(app)) libraryChange(app, event);
  else if (event.target.hasAttribute('data-listening-speed')) audio?.speed(Number(event.target.value));
}

export function mount(app, root) {
  if (isLibrary(app)) return mountLibrary(app, root);
  const scene = currentScene(app);
  if (scene) sizeListeningGaps(root, scene.tasks.flatMap((task, i) => task.kind === 'gap' ? [[`listening-answer-${i}`, task.answer]] : []));
  audio = mountListeningAudio(root);
  return () => {
    audio?.dispose();
    audio = null;
  };
}
