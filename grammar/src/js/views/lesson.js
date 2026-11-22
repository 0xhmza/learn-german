// Lesson player. A lesson is a linear sequence of screens, as in mobile
// course apps: short explanation slides, a question right after the rule,
// after the examples and after the typical mistake, then the remaining
// questions and a completion screen. One action button sits in the bottom
// bar; answers get a coloured answer sheet with "Weiter".
import { t, num, getLang } from '../i18n/index.js';
import { localize, lessonTitle, islandName, routeFor } from '../content.js';
import { lessonStars, missingPrereqs, visitLesson, pendingErrors } from '../engine/progress.js';
import { displayStreak } from '../engine/gamification.js';
import { esc, prose, de, germanLine, link, button, stars, levelChip } from '../components/html.js';
import { icons, flame, bolt } from '../components/icons.js';
import { playerBar } from '../components/player.js';
import * as quiz from './quiz.js';

export const title = (app, route) => lessonTitle(app.ctx.lessons.get(route.key), getLang());

function renderGlance(lesson, lang) {
  const roles = t('roles');
  const pattern = `<div class="glance-formula"><h3 class="label">${t('formula')}</h3><div class="pattern" lang="de" dir="ltr">${lesson.pattern.map(token =>
    ['+', ',', '·', '…', '→'].includes(token) ? `<span class="op">${esc(token)}</span>` : `<span class="chip">${esc(token)}</span>`).join('')}</div></div>`;
  return `<div class="glance">${pattern}<div class="glance-structure">
    <h3 class="label">${t('structure')}</h3><div class="frames">${lesson.frames.map(frame => `
    <div class="frame"><span class="frame-kind">${t('kinds')[frame.k]}</span>
      <div class="slots" lang="de" dir="ltr">${frame.parts.map(([role, text]) => `<span class="slot ${role}"><b>${esc(text)}</b>${roles[role] ? `<i lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">${roles[role]}</i>` : ''}</span>`).join('')}</div></div>`).join('')}
    </div><p class="frames-hint">${t('framesHint')}</p></div></div>`;
}

function wrongRight(pair) {
  const [wrong, right] = pair.split(' → ');
  return `<div class="wr" lang="de" dir="ltr">
    <div class="no"><span class="mark" aria-hidden="true">✗</span><span class="sr-only" lang="${getLang()}">${t('wrong')}</span><span>${esc(wrong)}</span></div>
    <div class="yes"><span class="mark" aria-hidden="true">✓</span><span class="sr-only" lang="${getLang()}">${t('right')}</span><span>${esc(right)}</span></div></div>`;
}

function renderTable([headers, ...rows]) {
  return `<p class="table-help">${t('tableHelp')}</p><div class="table-wrap" tabindex="0" role="region" aria-label="${t('tableLabel')}">
    <table><thead><tr>${headers.map(cell => `<th scope="col">${prose(cell)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([label, ...cells]) => `<tr><th scope="row">${prose(label)}</th>${cells.map(cell => `<td>${prose(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function sources(ctx, lesson, view) {
  const book = ctx.levelById.get(lesson.level).book;
  return `<details class="sources"><summary>${t('sources')}</summary>
    <p><strong>${prose(t('sourceLine', '`' + book + '`', num(lesson.source.lektion)))}</strong></p>
    <p>${t(lesson.source.kind === 'sample' ? 'sourceSample' : 'sourceToc')} ${t('sourceOriginal')}</p>
    <ul>${view.links.map(([label, url]) => `<li><a href="${esc(url)}" target="_blank" rel="noopener">${prose(label)}</a></li>`).join('')}</ul>
  </details>`;
}

const practiceKey = id => `lesson-practice-${id}`;
const xpIn = notes => notes.filter(note => note.type === 'xp' || note.type === 'goal').reduce((sum, note) => sum + note.amount, 0);

// The screens of one lesson. Text slides keep their ids (`intro`, `rule`,
// `step-2`, …); `quiz-N` shows the next single question of the lesson's
// practice run and `practice` the questions that are left.
export function lessonFlow(app, lesson, view, lang = getLang()) {
  const { ctx, state } = app;
  const outcome = ctx.learning.outcomes?.[lesson.id]?.[lang];
  const study = ctx.lessonStudy.get(lesson.id);
  const missing = missingPrereqs(ctx, state, lesson);
  const text = (id, label, body) => ({ id, label, body, kind: 'text' });
  const check = n => ({ id: `quiz-${n}`, kind: 'quiz', single: true });
  const flow = [
    text('intro', t('guideIntro'), () => `
      ${outcome ? `<p class="slide-outcome">${prose(outcome)}</p>` : ''}
      <p>${prose(view.lead)}</p>
      <div class="example">${germanLine(lesson.example)}${lang === 'de' ? `<span class="tr-label">${t('inArabic')}</span>` : ''}
        <p lang="ar" dir="rtl">${esc(view.translation)}</p></div>
      ${missing.length ? `<p class="prereq-chip">${t('bestFirst')} ${missing.map(item => `<a href="#lesson/${item.id}">${prose(lessonTitle(item, lang))}</a>`).join(lang === 'ar' ? '، ' : ', ')}</p>` : ''}`),
    text('rule', t('glance'), () => renderGlance(lesson, lang)),
    check(1),
    ...view.steps.map((step, i) => text(`step-${i + 1}`, step.text, () => `
      <div class="example">${germanLine(step.example)}</div><p>${prose(step.why)}</p>`)),
    check(2),
    text('details', t('detail'), () => `${view.explain.map(p => `<p>${prose(p)}</p>`).join('')}
      <details class="slide-recap"><summary>${t('recall')}</summary><p>${prose(view.recall[0])}</p>
        <details><summary>${t('showAnswer')}</summary><p>${prose(view.recall[1])}</p></details></details>`),
    text('pitfall', t('pitfall'), () => wrongRight(lesson.pitfallPair) + `<p>${prose(view.pitfall)}</p>`),
    check(3)
  ];
  if (view.table) flow.push(text('table', t('tableTitle'), () => renderTable(view.table)));
  if (study) flow.push(text('example', t('lessonWorked'), () => `<div class="example">${germanLine(study.correct)}</div><p>${prose(study[lang])}</p>`));
  flow.push({ id: 'practice', kind: 'quiz', single: false }, { id: 'finish', kind: 'finish' });
  return flow;
}

const usedUp = run => !run || run.finished || run.position >= run.ids.length;

// Where the learner is: the flow, the practice run and the current screen.
function place(app, lesson, view) {
  const flow = lessonFlow(app, lesson, view);
  const run = quiz.getRun(app, practiceKey(lesson.id));
  let index = Math.max(0, flow.findIndex(item => item.id === app.state.lessonSlides[lesson.id]));
  while (flow[index].kind === 'quiz' && usedUp(run)) index++;
  return { flow, run, index, item: flow[index] };
}

// Moves one screen on. Returns the id of the new screen, or null when the
// current question has not been checked yet.
export function advance(app, lessonId) {
  const lesson = app.ctx.lessons.get(lessonId);
  const { flow, run, index, item } = place(app, lesson, localize(lesson, getLang()));
  if (item.kind === 'finish') return null;
  if (item.kind === 'quiz') {
    if (typeof run.grades[run.ids[run.position]] !== 'boolean') return null;
    if (run.position >= run.ids.length - 1) quiz.finishPractice(app, run);
    else {
      run.position += 1;
      if (!item.single) {
        app.store.save();
        return item.id;
      }
    }
  }
  let next = index + 1;
  while (flow[next].kind === 'quiz' && usedUp(run)) next++;
  if (flow[next].kind === 'finish' && run) {
    run.xp = (run.xp || 0) + xpIn(app.apply([{ kind: 'lessonLearned', lesson: lessonId }]));
  } else if (flow[next].kind === 'finish') app.apply([{ kind: 'lessonLearned', lesson: lessonId }]);
  app.store.update(state => { state.lessonSlides[lessonId] = flow[next].id; });
  return flow[next].id;
}

function restart(state, lessonId) {
  state.lessonSlides[lessonId] = 'intro';
  delete state.runs[practiceKey(lessonId)];
}

function completion(app, lesson, view, run) {
  const { ctx, state } = app;
  const path = routeFor(ctx, 'all', state.settings.roadmap);
  const next = path[path.indexOf(lesson) + 1];
  const ids = run?.ids || [];
  const correct = ids.filter(id => run.grades[id] === true).length;
  const missed = pendingErrors(ctx, state).some(id => ctx.questions.get(id)?.lesson === lesson.id);
  const body = `<div class="lesson-complete">
      <div class="complete-badge" aria-hidden="true">${icons.trophy}</div>
      <h2 id="slide-title" tabindex="-1">${t('lessonComplete')}</h2>
      <p class="complete-title">${prose(view.title)}</p>
      ${stars(lessonStars(state, lesson.id), 30)}
      <div class="complete-stats">
        <div class="complete-stat xp"><span aria-hidden="true">${bolt}</span><strong><bdi dir="ltr">+${num(run?.xp || 0)}</bdi></strong><small>${t('totalXp', '').trim()}</small></div>
        <div class="complete-stat score"><span aria-hidden="true">${icons.check}</span><strong><bdi dir="ltr">${num(correct)}/${num(ids.length)}</bdi></strong><small>${t('statRight')}</small></div>
        <div class="complete-stat streak"><span aria-hidden="true">${flame}</span><strong>${num(displayStreak(state, app.day()))}</strong><small>${t('streakTitle')}</small></div>
      </div>
      <div class="complete-links">${ctx.decks.has(lesson.id) ? link(`cards/${lesson.id}`, t('openDeck'), 'quiet') : ''}
        ${missed ? button('run', t('missedLesson'), 'quiet', `data-key="repair-${lesson.id}"`) : ''}
        ${button('lesson-restart', t('lessonRepeat'), 'quiet')}</div>
      ${sources(ctx, lesson, view)}
    </div>`;
  const bar = `<div class="action-bar"><div class="action-inner">
      ${link('home', t('backToCourse'), 'secondary')}
      ${next ? link(`lesson/${next.id}`, t('nextLessonShort'), 'primary', 'data-continue') : link('practice', t('toPractice'), 'primary', 'data-continue')}
    </div></div>`;
  return { body, bar };
}

export function render(app, route) {
  const { ctx, state } = app;
  const lang = getLang();
  const lesson = ctx.lessons.get(route.key);
  if (!app.redrawing && (state.lastLesson !== lesson.id || state.player.at !== lesson.id || state.lessonSlides[lesson.id] === 'finish')) {
    app.store.update(s => {
      visitLesson(s, lesson.id);
      // A finished lesson opens again from the start.
      if (s.lessonSlides[lesson.id] === 'finish') restart(s, lesson.id);
    });
  }
  const view = localize(lesson, lang);
  const island = ctx.islandById.get(lesson.island);
  const { flow, run, index, item } = place(app, lesson, view);
  const textCount = flow.filter(entry => entry.kind === 'text').length;
  const total = textCount + (run?.ids.length || 0) + 1;
  const done = item.kind === 'finish' ? total - 1
    : flow.slice(0, index).filter(entry => entry.kind === 'text').length + (usedUp(run) ? run?.ids.length || 0 : run.position);
  const closeHash = state.settings.roadmap === 'telc' ? 'home' : `island/${island.id}`;
  let body;
  let bar;
  if (item.kind === 'finish') ({ body, bar } = completion(app, lesson, view, run));
  else if (item.kind === 'quiz') {
    ({ body, bar } = quiz.playerQuestion(app, run, {
      onContinue: 'lesson-continue',
      eyebrow: `<p class="slide-eyebrow"><span>${t(item.single ? 'quickCheck' : 'tabPractice')}</span></p>`
    }));
  } else {
    body = `${index === 0 ? `<div class="lesson-intro-head">
        <p class="slide-eyebrow"><span>${t('moduleN', num(island.order))} · ${esc(islandName(island, lang))}</span>${levelChip(lesson.level)}</p>
        <h1 class="lesson-title">${prose(view.title)}</h1>
        ${lang === 'ar' ? `<p class="lesson-german" lang="de" dir="ltr">${esc(lesson.german)}</p>` : ''}
      </div>` : ''}
      <h2 id="slide-title" tabindex="-1">${prose(item.label)}</h2><div class="slide-body">${item.body()}</div>`;
    bar = `<div class="action-bar"><div class="action-inner"><span></span>${button('lesson-continue', t('guideNext'), 'primary', 'data-continue')}</div></div>`;
  }
  return `<div class="lesson-deck player">
      ${playerBar(closeHash, t('closeLesson'), done, total)}
      ${index === 0 && item.kind === 'text' ? '' : `<h1 class="sr-only">${prose(view.title)}</h1>`}
      <article class="deck-slide panel ${item.id === 'pitfall' ? 'pitfall' : ''} ${item.kind}" data-lesson-slide="${item.id}">${body}</article>
      ${bar}
    </div>`;
}

function redraw(app) {
  app.rerender({ keepScroll: false });
  window.scrollTo({ top: 0 });
  if (!app.reduceMotion()) document.querySelector('.deck-slide')?.classList.add('slide-enter');
  document.querySelector('#slide-title, #quiz-prompt')?.focus({ preventScroll: true });
}

export const actions = {
  ...quiz.actions,
  'lesson-continue'(app) {
    if (advance(app, app.route.key)) redraw(app);
  },
  'lesson-restart'(app) {
    app.store.update(state => restart(state, app.route.key));
    redraw(app);
  }
};

export const onInput = quiz.onInput;

// Enter or the forward arrow presses the bottom button, as on a phone.
export function onKey(app, event) {
  quiz.onKey(app, event);
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const forward = getLang() === 'ar' ? 'ArrowLeft' : 'ArrowRight';
  if (event.key !== 'Enter' && event.key !== forward) return;
  if (event.target.closest('a,button,textarea,select,summary,input:not([type="radio"])')) return;
  if (event.key === forward && event.target.closest('input')) return;
  const control = document.querySelector('[data-continue], [data-check]:not(:disabled)');
  if (control) {
    event.preventDefault();
    control.click();
  }
}
