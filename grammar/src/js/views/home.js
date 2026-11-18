// Dashboard: one suggested study action, a searchable index, and the optional map.
import { t, num, getLang } from '../i18n/index.js';
import { inFilter, lessonTitle, islandName } from '../content.js';
import { islandProgress, nextLesson, overall, pendingErrors } from '../engine/progress.js';
import { dailyReview, recommendedLesson, resumableRun } from '../engine/study.js';
import { mountMap } from '../components/map.js';
import { searchKey } from '../components/sidebar.js';
import { runTitle } from './quiz.js';
import { esc, prose, link, button, levelChip } from '../components/html.js';

export const title = () => t('home');

function recommendation(app, review) {
  const { ctx, state } = app;
  const resume = resumableRun(state);
  if (resume) {
    return {
      title: t('resumeRun'), detail: prose(runTitle(app, resume)),
      action: button('run', t('resumeSession'), 'primary', `data-key="${resume.key}"`)
    };
  }
  if (review.ids.length) {
    return {
      title: t('reviewToday'), detail: t('dailyLength', num(review.ids.length), num(Math.ceil(review.ids.length * 0.6))),
      action: button('run', t('startReview'), 'primary', 'data-key="daily"')
    };
  }
  const next = recommendedLesson(ctx, state);
  if (next) {
    const outcome = ctx.learning.outcomes?.[next.id]?.[getLang()];
    return {
      title: state.lastLesson || Object.keys(state.completed).length ? t('continueLesson') : t('startLearning'),
      detail: `<strong>${prose(lessonTitle(next, getLang()))}</strong> ${levelChip(next.level)}`,
      outcome,
      action: state.completed[next.id]
        ? button('run', t('practiceMore'), 'primary', `data-key="${next.id}"`)
        : link(`lesson/${next.id}`, t(state.lastLesson === next.id ? 'resumeLesson' : 'openLesson'), 'primary')
    };
  }
  return { title: t('studyCaughtUp'), detail: t('studyCaughtUpDetail'), action: link('practice', t('choosePractice'), 'primary') };
}

export function reviewSummary(review) {
  return t('dailyCounts', num(review.questions), num(review.cards), num(review.fresh), num(review.transfers));
}

function directory(app, island) {
  const { ctx, state } = app;
  const lang = getLang();
  const filter = state.settings.levelFilter;
  const lessons = ctx.islandLessons(island.id).filter(lesson => inFilter(lesson, filter));
  if (!lessons.length) return '';
  const progress = islandProgress(ctx, state, island.id, filter);
  const words = esc(searchKey([island.name.ar, island.name.de].join(' ')));
  return `<details class="directory-island" data-topic="${words}">
    <summary><span class="sum-emoji ${island.palette}" aria-hidden="true">${island.emoji}</span>
      <strong>${esc(islandName(island, lang))}</strong>
      <small dir="ltr">${num(progress.learned)}/${num(progress.total)}</small></summary>
    <ul>${lessons.map(lesson => `<li data-rule="${esc(searchKey([lessonTitle(lesson, 'ar'), lessonTitle(lesson, 'de'), lesson.german].join(' ')))}">
      <a href="#lesson/${lesson.id}">${prose(lessonTitle(lesson, lang))}${levelChip(lesson.level)}</a></li>`).join('')}</ul>
    <a class="directory-link" href="#island/${island.id}">${t('openIsland')}</a>
  </details>`;
}

export function render(app) {
  const { ctx, state } = app;
  const filter = state.settings.levelFilter;
  const review = dailyReview(ctx, state, app.day());
  const selected = recommendation(app, review);
  const resume = resumableRun(state);
  const stats = overall(ctx, state, filter);
  const mistakes = pendingErrors(ctx, state, filter).length;
  const recommended = recommendedLesson(ctx, state);
  const started = Boolean(state.lastLesson || state.lastRun || stats.learned || state.xp.total);
  const filters = ['all', ...ctx.levels.map(level => level.id)].map(id =>
    `<button type="button" class="filter-chip" data-action="filter" data-level="${id}" aria-pressed="${filter === id}">${id === 'all' ? t('filterAll') : esc(id)}</button>`).join('');
  const starts = ctx.levels.filter(level => level.id !== recommended?.level).map(level =>
    button('start-level', t('startLevel', level.id), 'secondary', `data-level="${level.id}"`)).join('');
  const action = !started && recommended
    ? button('start-level', t('startLevel', recommended.level), 'primary', `data-level="${recommended.level}"`)
    : selected.action;
  return `<div class="study-dashboard">
    <section class="dash-hero panel">
      <div class="dash-hero-copy">
        <p class="dash-course">${t('docTitle')}</p>
        <h1>${selected.title}</h1>
        <p class="dash-detail">${selected.detail}</p>
        ${selected.outcome ? `<p class="dash-outcome">${prose(selected.outcome)}</p>` : ''}
        <div class="dash-action">${action}</div>
      </div>
      <div class="dash-illustration" aria-hidden="true"><span></span><i></i><b>⛵</b></div>
    </section>
    ${!started ? `<div class="dash-starts" aria-label="${t('filterLabel')}">${starts}${button('find-rule', t('findRule'), 'quiet')}</div>` : ''}
    <section class="dash-tools" aria-label="${t('studyTools')}">
      <div class="dash-tool panel"><h2>${t('reviewToday')}</h2>
        <p>${review.ids.length ? reviewSummary(review) : t('reviewReadyLater')}</p>
        ${resume && resume.kind !== 'daily' && review.ids.length ? button('run', t('startReview'), 'secondary', 'data-key="daily"')
          : mistakes ? button('run', t('practiceMistakes'), 'secondary', 'data-key="mistakes"') : link('practice', t('choosePractice'), 'secondary')}</div>
      <div class="dash-tool panel"><h2>${t('examTrainerNav')}</h2>
        <p>${t('examToolDesc')}</p>${link('model-exams', t('openExamPrep'), 'secondary')}</div>
    </section>
    <section class="panel dash-directory" aria-labelledby="directory-title">
      <div class="panel-head"><h2 id="directory-title">${t('allTopics')}</h2>
        <div class="filter-group" role="group" aria-label="${esc(t('filterLabel'))}">${filters}</div></div>
      <label class="search-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" id="rule-search" dir="auto" aria-label="${esc(t('searchLabel'))}" placeholder="${esc(t('searchPh'))}"></label>
      <details class="directory" id="topic-list"><summary>${t('browseDirectory', num(stats.lessons))}</summary>
        <div class="directory-grid">${ctx.islands.map(island => directory(app, island)).join('')}</div>
        <p id="directory-empty" class="notice" role="status" hidden>${t('noMatch')}</p>
      </details>
    </section>
    <details class="panel map-panel"><summary><strong>${t('mapTitle')}</strong></summary>
      <p class="muted">${t('mapHelp')}</p>
      ${recommended ? `<p class="muted"><strong>${t('recommendedIsland')}</strong> · ${esc(islandName(ctx.islandById.get(recommended.island), getLang()))}</p>` : ''}
      <div class="map-host" id="map-host"></div>
    </details>
  </div>`;
}

export function mount(app, root) {
  const host = root.querySelector('#map-host');
  const map = host.closest('details');
  let dispose;
  const openMap = () => { if (map.open && !dispose) dispose = mountMap(host, app); };
  map.addEventListener('toggle', openMap);
  openMap();
  return () => { map.removeEventListener('toggle', openMap); dispose?.(); };
}

export function onInput(app, event) {
  const input = event.target;
  if (input.id !== 'rule-search') return;
  const query = searchKey(input.value.trim());
  const directory = document.querySelector('#topic-list');
  directory.open ||= Boolean(query);
  let found = false;
  for (const section of directory.querySelectorAll('[data-topic]')) {
    const matchTopic = section.dataset.topic.includes(query);
    let match = false;
    for (const rule of section.querySelectorAll('[data-rule]')) {
      rule.hidden = !(matchTopic || rule.dataset.rule.includes(query));
      match ||= !rule.hidden;
    }
    section.hidden = !match;
    section.open = Boolean(query) && match;
    found ||= match;
  }
  document.querySelector('#directory-empty').hidden = found;
}

export const actions = {
  filter(app, target) {
    app.store.update(state => { state.settings.levelFilter = target.dataset.level; });
    app.rerender();
    document.querySelector('#topic-list').open = true;
    document.querySelector(`#content [data-action="filter"][aria-pressed="true"]`)?.focus({ preventScroll: true });
  },
  'start-level'(app, target) {
    app.store.update(state => { state.settings.levelFilter = target.dataset.level; });
    const next = nextLesson(app.ctx, app.state);
    if (next) app.navigate(`lesson/${next.id}`);
  },
  'find-rule'() { document.querySelector('#rule-search').focus(); }
};
