// The level picker and the Vokabeln and Schreiben pages. Only B1 has
// content so far: grammar, writing tasks and the telc exam trainer.
import { t, num, getLang } from '../i18n/index.js';
import { CEFR } from '../cefr.js';
import { islandName, lessonTitle } from '../content.js';
import { currentLevel, levelHasContent, writingTasks, writingProgress, vocabProgress } from '../engine/areas.js';
import { resetLesson } from '../engine/progress.js';
import { resumeCard, levelSoonCard } from '../components/widgets.js';
import { stopFor } from '../components/stops.js';
import { icons } from '../components/icons.js';
import { esc, prose, link, button, crumbs, formatDay, plainText } from '../components/html.js';
import { wordList, removeWord } from '../engine/words.js';
import * as writingCourse from './writing-course.js';

// The learner's saved words, newest first.
function myWords(app) {
  const words = wordList(app.state);
  const list = words.length
    ? `<ul class="my-words" lang="de" dir="ltr">${words.map(([word, day]) => `<li>
        <span class="my-word">${esc(word)}</span><small lang="${getLang()}" dir="auto">${esc(formatDay(day, { day: 'numeric', month: 'short' }))}</small>
        <button type="button" class="icon-btn word-remove" data-action="word-remove" data-word="${esc(word)}" aria-label="${esc(t('wordRemove', word))}" title="${esc(t('wordRemove', word))}">${icons.close}</button>
      </li>`).join('')}</ul>`
    : `<p class="muted">${t('myWordsEmpty')}</p>`;
  return `<section class="panel my-words-panel" aria-labelledby="my-words-title">
      <div class="section-row"><h2 id="my-words-title">${t('myWords')} <span class="count-chip">${num(words.length)}</span></h2>
        ${words.length ? button('words-copy', t('wordsCopy'), 'quiet') : ''}</div>
      <p class="muted my-words-how">${t('myWordsHow')}</p>
      ${list}
    </section>`;
}

export const vocab = {
  title: () => t('navVocab'),
  render(app) {
    const { last, words } = vocabProgress(app.state);
    const resume = last ? resumeCard({ eyebrow: t('lastWordSaved'), stop: {
      title: `<bdi lang="de" dir="ltr">${esc(last.word)}</bdi>`,
      meta: `${t('lastOn', formatDay(last.day, { day: 'numeric', month: 'long' }))} · ${t('wordsSavedCount', num(words))}`,
      action: ''
    } }) : '';
    return `<section class="area-hero sky">
      <span class="area-icon" aria-hidden="true">${icons.vocab}</span><div><h1>${t('navVocab')}</h1></div>
    </section>
    ${resume}${myWords(app)}
    <p class="actions">${link('karten', t('fcTitle'), 'primary')}${levelHasContent(currentLevel(app.state)) ? link('cards', t('vocabBridge'), 'secondary') : ''}</p>`;
  },
  actions: {
    'word-remove'(app, target) {
      const word = target.dataset.word;
      app.store.update(state => removeWord(state, word));
      app.rerender();
      document.querySelector('.word-remove')?.focus({ preventScroll: true });
    },
    async 'words-copy'(app, target) {
      const text = wordList(app.state).map(([word]) => word).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        target.textContent = t('wordsCopied');
      } catch {
        target.textContent = t('wordsCopyFailed');
      }
    }
  }
};

// Schreiben: where the learner stopped, then every writing task with its
// status: the everyday task of each grammar island and the writing part of
// each mock exam.
function writingPage(app, route) {
  const { ctx, state } = app;
  const lang = getLang();
  const level = currentLevel(state);
  if (!levelHasContent(level)) return `<div class="writing-course">${writingCourse.cover()}${levelSoonCard()}</div>`;
  if (route?.key && ctx.writingCourse) return writingCourse.renderPage(app, route);
  const { exams, everyday } = writingTasks(ctx, state);
  const progress = writingProgress(ctx, state);
  const percent = Math.round((progress.done / Math.max(1, progress.total)) * 100);
  const islandOf = task => ctx.islandById.get(task.id);
  const open = everyday.find(task => !task.done) || exams.find(task => !task.done);
  const startOpen = open && (open.kind === 'exam'
    ? { title: esc(`${t('examModel', num(open.model.number))} · ${open.model.title[lang]}`), action: link(open.hash, t('startHere'), 'primary') }
    : { title: prose(open.task[lang]), action: button('run', t('startHere'), 'primary', `data-key="${open.key}"`) });
  const status = task => task.draft ? `<span class="task-status draft">${t('taskDraft')}</span>`
    : `<span class="task-status ${task.done ? 'done' : ''}">${task.done ? `${icons.check}${t('taskDone')}` : t('topicNew')}</span>`;
  const library = `<section class="panel task-panel" aria-labelledby="everyday-tasks">
      <h2 id="everyday-tasks">${t('writingEverydayTasks')}</h2>
      <ul class="task-list">${everyday.map(task => `<li class="task-row">
        <span class="sum-emoji ${islandOf(task).palette}" aria-hidden="true">${islandOf(task).emoji}</span>
        <span class="task-main"><strong>${esc(islandName(islandOf(task), lang))}</strong><small>${prose(task.task[lang])}</small></span>
        ${status(task)}${button('run', t(task.draft ? 'resumeWriting' : task.done ? 'writeAgain' : 'startHere'), task.done && !task.draft ? 'quiet' : 'secondary', `data-key="${task.key}"`)}
      </li>`).join('')}</ul>
    </section>
    <section class="panel task-panel" aria-labelledby="exam-tasks">
      <h2 id="exam-tasks">${t('writingExamTasks')}</h2>
      <ul class="task-list">${exams.map(task => `<li class="task-row">
        <span class="task-number" aria-hidden="true">${num(task.model.number)}</span>
        <span class="task-main"><strong>${esc(task.model.title[lang])}</strong><small>${esc(t('examModel', num(task.model.number)))}</small></span>
        <span class="task-status ${task.done ? 'draft' : ''}">${task.done ? t('taskDraft') : t('topicNew')}</span>
        ${link(task.hash, t(task.done ? 'resumeWriting' : 'startHere'), task.done ? 'quiet' : 'secondary')}
      </li>`).join('')}</ul>
    </section>`;
  if (ctx.writingCourse) return writingCourse.landing(app, library);
  return `<div class="writing-course">${writingCourse.cover()}
    ${resumeCard({ stop: stopFor(app, 'writing'), empty: startOpen ?? { title: t('studyCaughtUp') } })}
    <div class="area-progress"><span>${t('writingDone', num(progress.done), num(progress.total))}</span><span class="bar" aria-hidden="true"><i style="inline-size:${percent}%"></i></span></div>${library}</div>`;
}

export const writing = {
  title: () => t('navWriting'),
  render: writingPage,
  actions: writingCourse.actions,
  mount: writingCourse.mount,
  onInput: writingCourse.onInput,
  onChange: writingCourse.onChange
};

const lessonLevel = lesson => lesson.level.split('.')[0];

function lessonResetPanel(ctx, current) {
  const lang = getLang();
  const groups = ctx.islands.map(island => {
    const lessons = ctx.islandLessons(island.id).filter(lesson => lessonLevel(lesson) === current);
    return lessons.length ? `<optgroup label="${esc(islandName(island, lang))}">${lessons.map(lesson =>
      `<option value="${esc(lesson.id)}">${esc(plainText(lessonTitle(lesson, lang)))}</option>`).join('')}</optgroup>` : '';
  }).join('');
  if (!groups) return '';
  return `<details class="panel level-reset">
    <summary>${t('resetLessonBtn')}</summary><p class="muted">${t('resetLessonText')}</p>
    <div class="form-row"><label for="reset-lesson">${t('chooseLesson')}
      <select id="reset-lesson"><option value="" selected disabled>${t('chooseLesson')}</option>${groups}</select></label>
      ${button('reset-lesson', t('resetLessonBtn'), 'secondary', 'disabled')}</div>
  </details>`;
}

export const level = {
  title: () => t('levelPickTitle'),
  render(app, route) {
    const current = currentLevel(app.state);
    const options = CEFR.map(info => {
      const ready = levelHasContent(info.id);
      const isCurrent = info.id === current;
      return `<li><button type="button" class="level-option ${isCurrent ? 'current' : ''} ${route.key === info.slug ? 'focus' : ''}" data-action="pick-level" data-level="${info.id}" aria-pressed="${isCurrent}">
        <span class="level-code level-option-code ${info.tone}" lang="de" dir="ltr">${info.id}</span>
        <span class="level-option-text"><strong>${esc(t('levelNames')[info.id])}</strong><small>${esc(t('levelCan')[info.id])}</small>
          <span class="level-option-state ${ready ? 'ready' : ''}">${ready ? t('levelAvailable') : t('comingSoon')}</span></span>
        ${isCurrent ? `<span class="level-option-check">${icons.check}<span>${t('currentLevel')}</span></span>` : ''}
      </button></li>`;
    }).join('');
    return `${crumbs([['home', t('tabHome')], [null, t('levelPickTitle')]])}
      <section class="page-head"><h1>${t('levelPickTitle')}</h1><p>${t('levelPickIntro')}</p></section>
      ${lessonResetPanel(app.ctx, current)}
      <ul class="level-options">${options}</ul>`;
  },
  onChange(app, event) {
    if (event.target.id === 'reset-lesson') {
      document.querySelector('[data-action="reset-lesson"]').disabled = !event.target.value;
    }
  },
  actions: {
    'pick-level'(app, target) {
      const chosen = target.dataset.level;
      if (app.setLevel(chosen, 'home')) app.notify(t('levelChosen', chosen));
    },
    'reset-lesson'(app, target) {
      const select = document.querySelector('#reset-lesson');
      const lesson = app.ctx.lessons.get(select.value);
      if (!lesson || lessonLevel(lesson) !== currentLevel(app.state)) return;
      const name = plainText(lessonTitle(lesson, getLang()));
      if (!window.confirm(t('resetLessonConfirm', name))) return;
      app.store.update(state => resetLesson(app.ctx, state, lesson.id));
      select.selectedIndex = 0;
      target.disabled = true;
      select.focus();
      app.notify(t('resetLessonDone'));
    }
  }
};
