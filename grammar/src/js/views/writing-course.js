import { t, getLang, num } from '../i18n/index.js';
import { w } from '../i18n/writing.js';
import { now } from '../dates.js';
import { button, crumbs, esc, formatDay, link, meter, prose } from '../components/html.js';
import { icons } from '../components/icons.js';
import { resumeCard } from '../components/widgets.js';
import { stopFor } from '../components/stops.js';
import { courseProgress, frequentWritingErrors, hasWritingResponse, isClosedWriting, newWritingAttempt, nextReadinessTask,
  readinessProgress, taskFinished, writingDeadline, writingHash, writingScore } from '../engine/writing.js';
import * as workspace from './writing-workspace.js';

const chapterHash = chapter => `schreiben/${chapter.id}`;
const courseChapter = (course, task) => course.chapters.find(chapter => chapter.tasks.includes(task));
const taskLabel = task => task.minutes ? w('mock') : isClosedWriting(task) ? w('quick') : w('free');
const l = value => prose(value[getLang()]);
const overview = 'schreiben';
const ready = 'schreiben/bereit';

export function cover(progress) {
  return `<header class="writing-cover">
    <div class="writing-cover-copy">
      <h1>${esc(t('navWriting'))}</h1>
      <p>${esc(w('intro'))}</p>
      ${progress ? `<div class="writing-cover-progress">${meter(progress.done, progress.total, w('chapters'))}<span>${num(progress.done)} / ${num(progress.total)} ${esc(w('doneCount'))}</span></div>` : ''}
    </div>
    <div class="writing-cover-art" aria-hidden="true"><div class="writing-paper"><i></i><i></i><i></i><span>${icons.writing}</span></div></div>
  </header>`;
}

export function landing(app, library) {
  const { ctx, state } = app;
  const course = ctx.writingCourse;
  if (!course) return library;
  const progress = courseProgress(course, state);
  const tasks = course.chapters.flatMap(chapter => chapter.tasks);
  const firstOpen = tasks.find(task => !taskFinished(state.writingCourse[task.id]));
  const stop = stopFor(app, 'writing');
  const activeTask = ctx.writingExercises.get(app.state.last.writing?.hash.split('/')[1]);
  const next = activeTask && activeTask === firstOpen ? stop : firstOpen && {
    title: l(firstOpen.title),
    action: link(writingHash(firstOpen), esc(w(progress.done ? 'nextTask' : 'startCourse')), 'primary')
  };
  const tags = frequentWritingErrors(state);
  const followUps = tags.flatMap(tag => {
    const exercises = tasks.filter(task => task.skill === tag);
    const task = exercises.find(task => !state.writingCourse[task.id]?.done) ?? exercises[0];
    return task ? [`<div>${link(writingHash(task), l(task.title), 'secondary')}<small>${esc(w(tag))}</small></div>`] : [];
  });
  return `<div class="writing-course">
    ${cover(progress)}
    ${resumeCard({ stop: activeTask && !taskFinished(state.writingCourse[activeTask.id]) ? stop : stop && !activeTask ? stop : null,
      empty: next || { title: w('ready'), action: link(ready, esc(w('ready')), 'primary') } })}
    ${followUps.length ? `<section class="panel writing-follow-ups"><h2>${esc(w('errorPractice'))}</h2><div>${followUps.join('')}</div></section>` : ''}
    <section aria-labelledby="writing-chapters-title" class="writing-chapters">
      <h2 id="writing-chapters-title">${esc(w('chapters'))}</h2>
      <ol class="writing-chapter-grid">${course.chapters.map((chapter, i) => {
        const finished = chapter.tasks.filter(task => taskFinished(state.writingCourse[task.id])).length;
        return `<li><a href="#${chapterHash(chapter)}" class="writing-chapter-tile">
          <div class="writing-chapter-status"><span class="writing-chapter-number">${num(i + 1)}</span>
            <span>${finished === chapter.tasks.length ? `${icons.check} ${esc(w('doneCount'))}` : `${num(finished)} / ${num(chapter.tasks.length)}`}</span></div>
          <div><h3>${l(chapter.title)}</h3><p>${l(chapter.description)}</p></div>
          <span class="writing-tile-link">${esc(w('openChapter'))} <span aria-hidden="true">↗</span></span>
        </a></li>`;
      }).join('')}</ol>
    </section>
    <section class="writing-ready-callout">
      <div><h2>${esc(w('ready'))}</h2><p>${esc(w('readyIntro'))}</p></div>
      ${link(ready, esc(w('ready')), 'primary')}
    </section>
    <details class="panel writing-library"><summary>${esc(w('extra'))}</summary>${library}</details>
  </div>`;
}

function renderChapter(app, chapter) {
  const { ctx, state } = app;
  const course = ctx.writingCourse;
  const index = course.chapters.indexOf(chapter);
  const next = course.chapters[index + 1];
  const amount = chapter.tasks.filter(task => taskFinished(state.writingCourse[task.id])).length;
  return `${crumbs([[overview, t('navWriting')], [null, l(chapter.title)]])}
    <div class="writing-course writing-chapter-page">
      <header class="writing-page-head">
        <h1>${l(chapter.title)}</h1><p>${l(chapter.description)}</p>
        ${meter(amount, chapter.tasks.length, w('doneCount'))}
      </header>
      <section class="writing-coach panel"><h2>${esc(w('tip'))}</h2><p>${l(chapter.tip)}</p>
        ${chapter.phrases.length ? `<h3>${esc(w('phrases'))}</h3><ul class="writing-phrases" lang="de" dir="ltr">${chapter.phrases.map(phrase => `<li>${esc(phrase)}</li>`).join('')}</ul>` : ''}
      </section>
      <ol class="writing-task-list">${chapter.tasks.map(task => {
        const attempt = state.writingCourse[task.id];
        const label = attempt?.done ? w('doneCount') : attempt ? t('continueHere') : w('start');
        return `<li class="panel"><div><small>${esc(taskLabel(task))}${task.minutes ? ` · ${num(task.minutes)} ${esc(w('minutes'))}` : ''}</small>
          <h2>${l(task.title)}</h2></div>${link(writingHash(task), esc(label), attempt?.done ? 'quiet' : 'secondary')}</li>`;
      }).join('')}</ol>
      <div class="actions">${link(next ? chapterHash(next) : ready, next ? l(next.title) : esc(w('ready')))}</div>
    </div>`;
}

function renderReadiness(app) {
  const { ctx, state } = app;
  const course = ctx.writingCourse;
  const next = nextReadinessTask(course, state);
  const { attempts, streak, achieved } = readinessProgress(course, state);
  return `${crumbs([[overview, t('navWriting')], [null, w('ready')]])}
    <div class="writing-course writing-chapter-page">
      <header class="writing-page-head"><h1>${esc(w('ready'))}</h1><p>${esc(w('readyIntro'))}</p></header>
      <section class="panel writing-milestone">
        <div class="writing-milestone-score"><strong>${num(Math.min(streak, 3))} / ${num(3)}</strong><span>${esc(w('readyStreak'))}</span></div>
        <div><p>${esc(w('readyGoal'))}</p>${achieved ? `<p class="writing-success">${icons.check} ${esc(w('readyAchieved'))}</p>` : ''}</div>
      </section>
      <section class="panel writing-coach">
        <p>${esc(w(next ? 'readyUnaided' : 'readyUsed'))}</p>
        ${next ? state.writingCourse[next.id] ? link(writingHash(next), esc(w('readyDraft')), 'primary')
          : button('writing-start-readiness', esc(w('readyNew')), 'primary') : ''}
      </section>
      <section><h2>${esc(w('readyAttempts'))}</h2>
        ${attempts.length ? `<ol class="writing-task-list">${attempts.map(task => {
          const attempt = state.writingCourse[task.id];
          const score = writingScore(attempt.secondReview ?? attempt.review);
          return `<li class="panel"><div><small>${formatDay(attempt.day)} · ${esc(w(task.register))}</small><h3>${l(task.title)}</h3>
            <span>${!hasWritingResponse(attempt) ? esc(w('blankAttempt')) : score === null ? esc(w('awaiting')) : `${num(score)} / ${num(45)}`}</span></div>
            ${link(writingHash(task), esc(t('continueHere')))}</li>`;
        }).join('')}</ol>` : `<p class="muted">${esc(w('readyNone'))}</p>`}
      </section>
    </div>`;
}

export function renderPage(app, route) {
  if (route.key === 'bereit') return renderReadiness(app);
  const { ctx, state } = app;
  const task = ctx.writingExercises.get(route.key);
  if (!task) return renderChapter(app, ctx.writingChapters.get(route.key));
  const attempt = state.writingCourse[task.id];
  const chapter = courseChapter(ctx.writingCourse, task);
  const parent = chapter ? [chapterHash(chapter), l(chapter.title)] : [ready, w('ready')];
  if (task.heldOut && !attempt) return `${crumbs([[overview, t('navWriting')], parent])}
    <section class="panel"><h1>${esc(w('readyPrompt'))}</h1><p>${esc(w('readyHidden'))}</p>${link(ready, esc(w('ready')), 'primary')}</section>`;
  const nextChapter = chapter && ctx.writingCourse.chapters[ctx.writingCourse.chapters.indexOf(chapter) + 1];
  const next = chapter?.tasks[chapter.tasks.indexOf(task) + 1] ?? nextChapter?.tasks[0];
  return `${crumbs([[overview, t('navWriting')], parent, [null, l(task.title)]])}
    ${workspace.renderWorkspace(task, attempt, chapter, next ? writingHash(next) : ready)}`;
}

export const actions = {
  ...workspace.actions,
  'writing-start-readiness'(app) {
    const task = nextReadinessTask(app.ctx.writingCourse, app.state);
    if (!task) return;
    if (!app.state.writingCourse[task.id]) {
      app.store.update(state => { state.writingCourse[task.id] = newWritingAttempt(task, now()); });
      app.store.flush();
    }
    app.navigate(writingHash(task));
  }
};
export function mount(app, root, route) {
  if (route.key !== 'bereit' || !app.ctx.writingCourse) return workspace.mount(app, root, route);
  const next = nextReadinessTask(app.ctx.writingCourse, app.state);
  const deadline = next && writingDeadline(next, app.state.writingCourse[next.id]);
  if (!deadline) return;
  const delay = Math.min(2147483647, Math.max(1, deadline - now()));
  const timer = setTimeout(() => app.rerender(), delay);
  return () => clearTimeout(timer);
}
export const onInput = workspace.onInput;
export const onChange = workspace.onChange;
