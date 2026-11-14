// Quiz runner and results. Practice runs give feedback after every
// answer; timed tests and island exams are graded on submission.
import { t, num, getLang } from '../i18n/index.js';
import { localizeQuestion, lessonTitle, islandName } from '../content.js';
import { isCorrect, answered, blankCorrect, model } from '../engine/grading.js';
import { newRun, permutation, runScore, passMark, isRunValid } from '../engine/runs.js';
import { lessonStars } from '../engine/progress.js';
import { esc, de, prose, germanLine, link, button, stars, crumbs } from '../components/html.js';

let hintCount = 0;
let shownQuestion = '';
let timer = 0;

const xpOf = notes => notes.filter(note => note.type === 'xp' || note.type === 'goal').reduce((sum, note) => sum + note.amount, 0);

function runTitle(app, run) {
  const lang = getLang();
  const { ctx } = app;
  if (run.kind === 'test') return t('testName');
  if (run.kind === 'mixed') return t('mixedName');
  if (run.kind === 'mistakes') return t('mistakesName');
  if (run.kind === 'review') return t('reviewName');
  if (run.kind === 'island') return t('islandRunName', islandName(ctx.islandById.get(run.target), lang));
  if (run.kind === 'exam') return t('examName', islandName(ctx.islandById.get(run.target), lang));
  return lessonTitle(ctx.lessons.get(run.target), lang);
}

function getRun(app, key) {
  let run = app.state.runs[key];
  if (run && isRunValid(app.ctx, run)) return run;
  return app.store.update(state => {
    const created = newRun(app.ctx, state, key, { day: app.day() });
    if (created) {
      state.runs[key] = created;
      state.lastRun = key;
    } else delete state.runs[key];
    return created;
  });
}

const question = (app, run) => localizeQuestion(app.ctx.questions.get(run.ids[run.position]), getLang());
const save = app => app.store.save();

export function title(app, route) {
  const run = app.state.runs[route.key];
  return run ? runTitle(app, run) : t('practice');
}

export function render(app, route) {
  const run = getRun(app, route.key);
  if (!run) {
    return `${crumbs([['practice', t('practice')]])}<section class="panel"><h1>${t('noQuestions')}</h1><p>${t('noQuestionsText')}</p>
      <div class="actions" style="margin-top:12px">${link('practice', t('allPractice'))}</div></section>`;
  }
  if (!run.finished && run.mode === 'test' && Date.now() >= run.deadline) submit(app, run);
  if (run.finished) return renderResults(app, run);
  const q = question(app, run);
  if (shownQuestion !== q.id) {
    shownQuestion = q.id;
    hintCount = 0;
  }
  const grade = run.grades[q.id];
  const checked = typeof grade === 'boolean';
  const graded = run.mode !== 'practice';
  const lesson = app.ctx.lessons.get(q.lesson);
  const previous = run.position > 0;
  const last = run.position === run.ids.length - 1;
  const hintText = q.hints[hintCount - 1];
  const name = runTitle(app, run);
  return `${crumbs([['practice', t('practice')], [null, prose(name)]])}
    <section class="quiz-box" aria-labelledby="quiz-heading">
      <div class="quiz-meta"><strong id="quiz-heading">${prose(name)}</strong>
        <span>${t('questionOf', num(run.position + 1), num(run.ids.length))}</span>
        ${run.mode === 'test' ? `<span id="timer" class="timer" role="timer" dir="ltr" aria-label="${t('timeLeft')}"></span>` : ''}</div>
      <progress value="${run.position + 1}" max="${run.ids.length}" aria-label="${t('position')}"></progress>
      <div class="quiz-meta"><span class="quiz-type">${t('kindLabels')[q.type]} · ${t('difficulty')[q.difficulty]}</span>
      ${!graded ? `<a href="#lesson/${lesson.id}">${prose(lessonTitle(lesson, getLang()))} ↗</a>` : ''}</div>
      <h1 class="quiz-prompt" id="quiz-prompt" tabindex="-1">${prose(q.prompt)}</h1>
      ${q.context ? `<div class="example">${germanLine(q.context)}</div>` : ''}
      ${renderInput(run, q, run.answers[q.id], checked || grade === 'shown', checked)}
      <div id="quiz-status" class="sr-only" aria-live="polite"></div>
      ${hintText && !graded ? `<div class="quiz-help" tabindex="-1"><strong>💡 ${t('hint', num(hintCount))}</strong> · ${prose(hintText)}</div>` : ''}
      ${checked || grade === 'shown' ? renderFeedback(q, grade) : ''}
      <div class="quiz-controls">
        ${graded ? [
          previous ? button('q-prev', t('back')) : '',
          !last ? button('q-next', t('forward'), 'primary') : '',
          button('finish-test', t('submitTest'), last ? 'primary' : 'quiet')
        ].join('') : [
          !checked && grade !== 'shown' ? button('check', q.type === 'text' ? t('showModel') : t('check'), 'primary') : '',
          !checked && grade !== 'shown' && hintCount < q.hints.length ? button('hint', t('showHint'), 'quiet') : '',
          previous ? button('q-prev', t('back')) : '',
          grade !== 'shown' ? button('q-next', last ? t('showResult') : checked ? t('forward') : t('skipQ'), checked ? 'primary' : 'secondary') : ''
        ].join('')}
      </div>
      ${graded ? `<div id="test-confirm" class="notice" hidden><p id="test-summary"></p><div class="actions" style="margin-top:8px">${button('confirm-test', t('submitNow'), 'primary')}${button('cancel-finish', t('keepSolving'))}</div></div>` : ''}
    </section>`;
}

function renderInput(run, q, value, locked, showGrade) {
  const disabled = locked ? 'disabled' : '';
  if (q.type === 'mcq') {
    return `<fieldset class="choices"><legend class="sr-only">${t('chooseOne')}</legend>
      ${permutation(run, q, q.options.length).map(i => {
        const gradeClass = showGrade && i === q.answer ? 'good' : showGrade && i === value ? 'bad' : '';
        return `<label class="option ${gradeClass}"><input type="radio" name="choice" value="${i}" ${value === i ? 'checked' : ''} ${disabled}><span>${prose(q.options[i])}</span></label>`;
      }).join('')}</fieldset>`;
  }
  if (q.type === 'cloze') {
    return `<div class="cloze de" dir="ltr" lang="de" aria-describedby="quiz-prompt">${q.text.split(/(\{\{\d+\}\})/g).map(part => {
      const match = part.match(/^\{\{(\d+)\}\}$/);
      if (!match) return esc(part);
      const i = Number(match[1]) - 1;
      const state = showGrade ? (blankCorrect(q, value, i) ? 'good' : 'bad') : '';
      return `<input class="blank ${state}" data-blank="${i}" aria-label="${t('blank', num(i + 1))}" value="${esc(value?.[i] ?? '')}" lang="de" autocapitalize="off" autocomplete="off" spellcheck="false" ${disabled}>`;
    }).join('')}</div>`;
  }
  if (q.type === 'order') return `<div id="ordering">${orderMarkup(run, q, value || [], locked)}</div>`;
  return `<label class="answer-label" for="written">${t('writeLabel')}</label>
    <textarea id="written" dir="auto" lang="de" spellcheck="false" ${disabled}>${esc(value ?? '')}</textarea>`;
}

function orderMarkup(run, q, value, locked) {
  const token = (i, action) => `<button type="button" class="order-token" data-action="${action}" data-piece="${i}" lang="de" dir="ltr" ${locked ? 'disabled' : ''}>${esc(q.items[i])}</button>`;
  return `<span class="answer-label">${t('orderYours')}</span>
    <div class="order-line answer-order" dir="ltr" aria-label="${t('orderAria')}">${value.map(i => token(i, 'remove-piece')).join('')}</div>
    <span class="answer-label">${t('orderPick')}</span>
    <div class="order-line" dir="ltr" aria-label="${t('piecesAria')}">${permutation(run, q, q.items.length).filter(i => !value.includes(i)).map(i => token(i, 'add-piece')).join('')}</div>`;
}

function renderFeedback(q, grade) {
  const alternates = q.blanks?.flatMap((variants, i) => (variants.length > 1 ? [`${num(i + 1)} · ${variants.map(de).join(' / ')}`] : []));
  return `<div class="feedback ${grade === true ? 'correct' : grade === false ? 'incorrect' : ''}" id="feedback" tabindex="-1">
    <strong>${grade === true ? t('correct') : grade === false ? t('incorrect') : t('compare')}</strong>
    <p>${prose(model(q))}</p>${alternates?.length ? `<p>${t('alternates')} ${alternates.join(' · ')}</p>` : ''}<p>${prose(q.explain)}</p>
    ${grade === 'shown' ? `<div class="actions" style="margin-top:8px">${button('self-yes', t('selfYes'), 'primary')}${button('self-no', t('selfNo'))}</div>` : ''}
    </div>`;
}

const statusOf = grade => (grade === true ? t('statusRight') : grade === false ? t('statusReview') : t('statusNone'));

function renderResults(app, run) {
  const { ctx } = app;
  const lang = getLang();
  const { correct, total, counted } = runScore(run);
  const name = runTitle(app, run);
  const summary = run.summary || {};
  const islandId = run.kind === 'lesson' ? ctx.lessons.get(run.target).island : run.kind === 'island' || run.kind === 'exam' ? run.target : null;
  let outcome = '';
  if (run.kind === 'lesson') {
    const count = lessonStars(app.state, run.target);
    outcome = `<div class="run-outcome"><div>${stars(count, 22)}<strong>${t('starsEarned', num(count))}</strong></div><p>${t('runStarsHint')}</p></div>`;
  }
  if (run.kind === 'exam') {
    outcome = summary.passed
      ? `<div class="run-outcome passed"><span class="big" aria-hidden="true">🚩</span><strong>${t('examPassed')}</strong></div>`
      : `<div class="run-outcome failed"><span class="big" aria-hidden="true">🏰</span><strong>${t('examFailed', num(correct), num(passMark(total)))}</strong></div>`;
  }
  const rows = run.ids.map(id => {
    const q = localizeQuestion(ctx.questions.get(id), lang);
    const value = run.answers[id];
    const yours = q.type === 'mcq' ? q.options[value] : q.type === 'order' ? value?.map(i => q.items[i]).join(' ') : q.type === 'cloze' ? value?.filter(Boolean).join(' · ') : value;
    return `<details class="result-row"><summary>${statusOf(run.grades[id])} · ${prose(q.prompt)}</summary>
      ${q.context ? germanLine(q.context) : ''}${q.type === 'cloze' ? `<div class="review-model" lang="de" dir="ltr">${esc(q.text.replace(/\{\{\d+\}\}/g, '___'))}</div>` : ''}
      ${yours ? `<p><strong>${t('yourAnswer')}</strong> · ${prose(yours)}</p>` : ''}
      <p><strong>${t('solution')}</strong> · ${prose(model(q))}</p><p>${prose(q.explain)}</p><a href="#lesson/${q.lesson}">${t('openRule')}</a></details>`;
  }).join('');
  return `${crumbs([['practice', t('practice')], [null, prose(name)]])}
    <section class="quiz-box"><h1 class="quiz-prompt">${t('resultOf', prose(name))}</h1>
      ${run.timedOut ? `<p class="notice">${t('timeUp')}</p>` : ''}
      ${outcome}
      <div class="stats"><div class="stat"><strong>${num(correct)}</strong>${t('statRight')}</div>
      <div class="stat"><strong>${num(counted - correct)}</strong>${t('statNeeds')}</div>
      <div class="stat"><strong>${num(total - counted)}</strong>${t('statNone')}</div></div>
      ${run.xp ? `<p class="xp-line">✨ ${t('xpEarned', num(run.xp))}</p>` : ''}
      <div class="actions">${button('restart', t('newRun'), 'primary')}${islandId ? link(`island/${islandId}`, t('backToIsland')) : ''}${link('progress', t('progressLog'))}${link('practice', t('otherPractice'))}</div>
      <div class="section-heading"><h2>${t('answersTitle')}</h2></div>${rows}
    </section>`;
}

function addXp(run, notes) {
  run.xp = (run.xp || 0) + xpOf(notes);
}

// Practice run reached its end.
function finishPractice(app, run) {
  run.finished = true;
  if (run.kind === 'lesson') {
    const { correct, total } = runScore(run);
    addXp(run, app.apply([{ kind: 'lessonRun', lesson: run.target, correct, total }]));
  } else save(app);
}

// Timed test or exam submitted (or the time ran out).
function submit(app, run) {
  if (run.finished) return;
  clearInterval(timer);
  run.timedOut = run.mode === 'test' && Date.now() >= run.deadline;
  const events = [];
  for (const id of run.ids) {
    const q = app.ctx.questions.get(id);
    if (!answered(q, run.answers[id])) continue;
    const grade = isCorrect(localizeQuestion(q, getLang()), run.answers[id]);
    run.grades[id] = grade;
    events.push({ kind: 'answer', q, correct: grade });
  }
  const { correct, total } = runScore(run);
  if (run.mode === 'exam') {
    events.push({ kind: 'exam', island: run.target, correct, total });
    run.summary = { passed: correct >= passMark(total) };
  } else events.push({ kind: 'test', correct, total });
  run.finished = true;
  addXp(run, app.apply(events));
}

function startClock(app, run) {
  clearInterval(timer);
  const display = document.querySelector('#timer');
  if (!display) return;
  const tick = () => {
    const seconds = Math.max(0, Math.ceil((run.deadline - Date.now()) / 1000));
    display.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    display.classList.toggle('soon', seconds < 60);
    if (!seconds) {
      submit(app, run);
      app.rerender({ keepScroll: false });
    }
  };
  timer = setInterval(tick, 500);
  tick();
}

export function mount(app, root, route) {
  const run = app.state.runs[route.key];
  if (run && !run.finished && run.mode === 'test') startClock(app, run);
  return () => clearInterval(timer);
}

function moveQuestion(app, run, delta) {
  const position = run.position + delta;
  if (position < 0) return;
  if (position >= run.ids.length) {
    if (run.mode === 'practice') {
      finishPractice(app, run);
      app.rerender({ keepScroll: false });
      document.querySelector('#main').focus({ preventScroll: true });
    }
    return;
  }
  run.position = position;
  hintCount = 0;
  save(app);
  app.rerender({ keepScroll: false });
  document.querySelector('#quiz-prompt')?.focus({ preventScroll: true });
}

function changeAnswer(app, run, q, value) {
  if (run.grades[q.id] !== undefined) return;
  run.answers[q.id] = value;
  save(app);
}

const active = app => {
  const run = app.state.runs[app.route.key];
  return run && !run.finished ? run : null;
};

function grade(app, run, q, correct) {
  run.grades[q.id] = correct;
  const raw = app.ctx.questions.get(q.id);
  addXp(run, app.apply([{ kind: 'answer', q: raw, correct, hinted: Boolean(run.hinted[q.id]), review: run.kind === 'review' }]));
  app.rerender();
  document.querySelector('#feedback')?.focus({ preventScroll: false });
}

export const actions = {
  restart(app) {
    const key = app.route.key;
    app.store.update(state => {
      const run = newRun(app.ctx, state, key, { day: app.day() });
      if (run) state.runs[key] = run;
      else delete state.runs[key];
    });
    hintCount = 0;
    app.rerender({ keepScroll: false });
  },
  'q-prev': app => { const run = active(app); if (run) moveQuestion(app, run, -1); },
  'q-next': app => { const run = active(app); if (run) moveQuestion(app, run, 1); },
  hint(app) {
    const run = active(app);
    if (!run) return;
    hintCount++;
    run.hinted[run.ids[run.position]] = true;
    save(app);
    app.rerender();
    document.querySelector('.quiz-help')?.focus({ preventScroll: true });
  },
  'add-piece': (app, target) => movePiece(app, target, true),
  'remove-piece': (app, target) => movePiece(app, target, false),
  'finish-test'(app) {
    const run = active(app);
    if (!run) return;
    const remaining = run.ids.filter(id => !answered(app.ctx.questions.get(id), run.answers[id])).length;
    document.querySelector('#test-summary').textContent = remaining ? t('unanswered', num(remaining)) : t('allAnswered');
    const confirmation = document.querySelector('#test-confirm');
    confirmation.hidden = false;
    confirmation.querySelector('button').focus();
  },
  'cancel-finish'() {
    document.querySelector('#test-confirm').hidden = true;
    document.querySelector('[data-action="finish-test"]').focus();
  },
  'confirm-test'(app) {
    const run = active(app);
    if (!run) return;
    submit(app, run);
    app.rerender({ keepScroll: false });
    document.querySelector('#main').focus({ preventScroll: true });
  },
  check(app) {
    const run = active(app);
    if (!run) return;
    const q = question(app, run);
    const answer = run.answers[q.id];
    if (!answered(q, answer)) {
      const status = document.querySelector('#quiz-status');
      status.className = 'notice';
      status.textContent = t('finishFirst');
      return;
    }
    if (q.type === 'text') {
      run.grades[q.id] = 'shown';
      save(app);
      app.rerender();
      document.querySelector('#feedback')?.focus();
      return;
    }
    grade(app, run, q, isCorrect(q, answer));
  },
  'self-yes'(app) { const run = active(app); if (run) grade(app, run, question(app, run), true); },
  'self-no'(app) { const run = active(app); if (run) grade(app, run, question(app, run), false); }
};

function movePiece(app, target, add) {
  const run = active(app);
  if (!run) return;
  const q = question(app, run);
  const piece = Number(target.dataset.piece);
  const old = run.answers[q.id] || [];
  const value = add ? [...old, piece] : old.filter(i => i !== piece);
  changeAnswer(app, run, q, value);
  const ordering = document.querySelector('#ordering');
  ordering.innerHTML = orderMarkup(run, q, value, false);
  ordering.querySelector(`button[data-piece="${piece}"]`)?.focus({ preventScroll: true });
}

export function onInput(app, event) {
  const run = active(app);
  if (!run) return;
  const q = question(app, run);
  const target = event.target;
  if (target.name === 'choice') changeAnswer(app, run, q, Number(target.value));
  else if (target.id === 'written') changeAnswer(app, run, q, target.value);
  else if ('blank' in target.dataset) {
    const values = [...(run.answers[q.id] || [])];
    values[Number(target.dataset.blank)] = target.value;
    changeAnswer(app, run, q, values);
  }
  const status = document.querySelector('#quiz-status');
  if (status) {
    status.className = 'sr-only';
    status.textContent = '';
  }
}

export function onKey(app, event) {
  if (event.key !== 'Enter' || event.target.tagName !== 'INPUT' || !event.target.classList.contains('blank')) return;
  const check = document.querySelector('[data-action="check"]');
  if (check) {
    event.preventDefault();
    check.click();
  }
}
