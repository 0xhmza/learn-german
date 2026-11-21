// Dashboard: one suggested study action, a searchable index, and the optional map.
import { t, num, getLang } from '../i18n/index.js';
import { lessonTitle } from '../content.js';
import { nextLesson, overall, pendingErrors } from '../engine/progress.js';
import { dailyReview, recommendedLesson, resumableRun } from '../engine/study.js';
import { mountMap } from '../components/map.js';
import { createTopicBrowser, bindTopicBrowser, renderTopicBrowser, disclosureIcon } from '../components/sidebar.js';
import { runTitle } from './quiz.js';
import { esc, prose, link, button, levelChip, meter } from '../components/html.js';

export const title = () => t('home');
const browser = createTopicBrowser();

const topicOptions = app => ({
  ctx: app.ctx, state: app.state, id: 'home-topics', browser,
  defaultTopic: nextLesson(app.ctx, app.state)?.id
});

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
    </section>
    ${!started ? `<div class="dash-starts" aria-label="${t('filterLabel')}">${starts}${button('find-rule', t('findRule'), 'quiet')}</div>` : ''}
    <section class="panel dash-directory" aria-labelledby="directory-title">
      <div class="panel-head"><h2 id="directory-title">${t('roadmapLabel')}</h2>
        <div class="filter-group" role="group" aria-label="${esc(t('filterLabel'))}">${filters}</div></div>
      <div class="roadmap-progress">
        <strong>${t('topicsDone', num(stats.learned), num(stats.lessons))}</strong>
        ${meter(stats.learned, stats.lessons, t('lessonsDone'))}
      </div>
      ${renderTopicBrowser({
        ...topicOptions(app),
        overview: state.settings.roadmap === 'islands' ? `<details class="map-panel"><summary>${disclosureIcon}${t('mapTitle')}</summary>
          <p class="muted">${t('mapHelp')}</p><div class="map-host" id="map-host"></div>
        </details>` : ''
      })}
    </section>
    <section class="dash-tools" aria-label="${t('studyTools')}">
      <div class="dash-tool panel"><h2>${t('reviewToday')}</h2>
        <p>${review.ids.length ? reviewSummary(review) : t('reviewReadyLater')}</p>
        ${resume && resume.kind !== 'daily' && review.ids.length ? button('run', t('startReview'), 'secondary', 'data-key="daily"')
          : mistakes ? button('run', t('practiceMistakes'), 'secondary', 'data-key="mistakes"') : link('practice', t('choosePractice'), 'secondary')}</div>
      <div class="dash-tool panel"><h2>${t('examTrainerNav')}</h2>
        <p>${t('examToolDesc')}</p>${link('model-exams', t('openExamPrep'), 'secondary')}</div>
    </section>
  </div>`;
}

export function mount(app, root) {
  bindTopicBrowser(root, () => topicOptions(app));
  const host = root.querySelector('#map-host');
  if (!host) return;
  const map = host.closest('details');
  let dispose;
  const openMap = () => { if (map.open && !dispose) dispose = mountMap(host, app); };
  map.addEventListener('toggle', openMap);
  openMap();
  return () => { map.removeEventListener('toggle', openMap); dispose?.(); };
}

export const actions = {
  filter(app, target) {
    app.store.update(state => { state.settings.levelFilter = target.dataset.level; });
    app.rerender();
    document.querySelector(`#content [data-action="filter"][aria-pressed="true"]`)?.focus({ preventScroll: true });
  },
  'start-level'(app, target) {
    app.store.update(state => { state.settings.levelFilter = target.dataset.level; });
    const next = nextLesson(app.ctx, app.state);
    if (next) app.navigate(`lesson/${next.id}`);
  },
  'find-rule'() { document.querySelector('#content [data-topic-search]').focus(); }
};
