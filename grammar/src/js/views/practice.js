// Practice launcher: by topic, today's review, timed test, mistakes and
// the island exams.
import { t, num, getLang } from '../i18n/index.js';
import { inFilter, lessonTitle, islandName } from '../content.js';
import { islandProgress, pendingErrors } from '../engine/progress.js';
import { newRun, examSize, TEST_MINUTES } from '../engine/runs.js';
import { dailyReview, resumableRun } from '../engine/study.js';
import { currentLevel, levelHasContent } from '../engine/areas.js';
import { esc, link, button, plainText, prose } from '../components/html.js';

export const title = () => t('practice');

// Opens a run, creating it when it is missing or already finished.
export function goToRun(app, key, reset = false) {
  if (!levelHasContent(currentLevel(app.state))) {
    app.navigate(`practice/${key}`);
    return;
  }
  app.store.update(state => {
    const existing = state.runs[key];
    if (reset || !existing || existing.finished) {
      const run = newRun(app.ctx, state, key, { day: app.day() });
      if (run) state.runs[key] = run;
      else delete state.runs[key];
    }
    state.lastRun = key;
  });
  app.navigate(`practice/${key}`);
}

export function render(app) {
  const { ctx, state } = app;
  const lang = getLang();
  const filter = state.settings.levelFilter;
  const day = app.day();
  const mistakes = pendingErrors(ctx, state, filter).length;
  const previous = resumableRun(state);
  const review = dailyReview(ctx, state, day);
  const options = ctx.islands.map(island => {
    const lessons = ctx.islandLessons(island.id).filter(lesson => inFilter(lesson, filter));
    if (!lessons.length) return '';
    const count = lessons.reduce((sum, lesson) => sum + lesson.questions.length, 0);
    return `<optgroup label="${esc(`${island.emoji} ${islandName(island, lang)}`)}">
      <option value="island-${island.id}">${esc(t('islandOpt', num(count)))}</option>
      ${lessons.map(lesson => `<option value="${lesson.id}">${esc(plainText(lessonTitle(lesson, lang)))} · ${num(lesson.questions.length)}</option>`).join('')}</optgroup>`;
  }).join('');
  const exams = ctx.islands.map(island => {
    const p = islandProgress(ctx, state, island.id);
    const size = examSize(p.totalAll);
    const status = p.conquered
      ? `<span class="exam-status done">${t('examRowDone', num(p.examBest), num(size))}</span>${button('run', t('examRepeat'), 'quiet', `data-key="exam-${island.id}"`)}`
      : p.examReady
        ? `<span class="exam-status">${t('examIntro', num(size), num(Math.ceil(size * 0.8)))}</span>${button('run', t('examStart'), 'primary', `data-key="exam-${island.id}"`)}`
        : `<span class="exam-status locked">${t('examLocked', num(p.learnedAll), num(p.totalAll))}</span>`;
    return `<li class="exam-row ${p.conquered ? 'done' : p.examReady ? 'ready' : 'locked'}">
      <span class="sum-emoji ${island.palette}" aria-hidden="true">${p.conquered ? '🚩' : island.emoji}</span>
      <a href="#island/${island.id}">${esc(islandName(island, lang))}</a>${status}</li>`;
  }).join('');
  return `
    <section class="simple-banner practice-head"><h1>${t('reviewAndTrain')}</h1>
      <p>${t('dailyCounts', num(review.questions), num(review.cards), num(review.fresh), num(review.transfers))}</p>
      <div class="actions study-actions">
        ${previous ? link(`practice/${previous.key}`, t('resumeSession'), 'primary') : ''}
        ${review.ids.length ? button('run', t('startReview'), previous ? 'secondary' : 'primary', 'data-key="daily"') : ''}
        ${mistakes ? button('run', t('practiceMistakes'), 'secondary', 'data-key="mistakes"') : ''}</div></section>
    <nav class="study-grid study-entry" aria-label="${t('studyTools')}">
      ${[['sprachbausteine', 'sprachTitle', 'sprachSummary'], ['readings', 'readingsTitle', 'readingsIntro'], ['hoeren', 'listeningTitle', 'listeningSummary'], ['karten', 'fcTitle', 'fcIntro'], ['model-exams', 'courseExam', 'examToolDesc']].map(([route, heading, description]) => `<a class="panel study-tile" href="#${route}"><h2>${prose(t(heading))}</h2><p>${prose(t(description))}</p></a>`).join('')}
    </nav>
    <details class="panel modes-panel"><summary>${t('otherModes')}</summary><div class="launcher">
      <section class="panel"><h2>${t('byTopic')}</h2>
        <p>${t('byTopicText')}</p>
        <div class="form-row">
          <label for="scope">${t('scope')}<select id="scope"><option value="mixed">${esc(t('mixedOpt', num(20)))}</option>${options}</select></label>
          ${button('launch', t('launch'), 'primary')}
        </div>
      </section>
      <section class="panel"><h2>${t('testTitle')}</h2><p>${t('testText', num(20), num(TEST_MINUTES))}</p>
        ${button('run', state.runs.test && !state.runs.test.finished ? t('resumeTest') : t('startTest'), 'secondary', 'data-key="test"')}
      </section>
      <section class="panel"><h2>${t('mistakes')}</h2><p>${mistakes ? t('mistakesN', num(mistakes)) : t('mistakesNone')}</p>
        ${mistakes ? button('run', t('practiceMistakes'), 'secondary', 'data-key="mistakes"') : ''}
      </section>
    </div>
    <div class="section-heading" id="practice-sets"><h2>${t('crossPractice')}</h2><p>${t('crossPracticeIntro')}</p></div>
    <div class="study-grid">${[...ctx.practiceSets.values()].map(set => `<article class="panel study-tile">
      <h3>${prose(set.title[lang])}</h3><p>${prose(set.summary[lang])}</p><p class="study-meta">${t('lessonsN', set.lessons.length)}</p>
      ${button('run', t(state.runs[set.id] && !state.runs[set.id].finished ? 'resumeRun' : 'launch'), 'secondary', `data-key="${set.id}"`)}</article>`).join('')}</div>
    <section class="panel exams-panel study-followup"><h2>${t('examsTitle')}</h2><p>${t('examsText')}</p><ul class="exam-list">${exams}</ul></section></details>`;
}

export const actions = {
  launch(app) {
    goToRun(app, document.querySelector('#scope').value);
  }
};
