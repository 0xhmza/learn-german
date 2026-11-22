// Learn tab: continue card, the five levels, the grammar course path and
// side cards for streak, daily goal, rank, review and the exam trainer.
import { t, num, getLang } from '../i18n/index.js';
import { lessonTitle, islandName } from '../content.js';
import { nextLesson, overall, pendingErrors } from '../engine/progress.js';
import { dailyReview, recommendedLesson, resumableRun } from '../engine/study.js';
import { renderCourse } from '../components/path.js';
import { streakCard, goalCard, rankCard, levelStrip, todayStrip } from '../components/widgets.js';
import { icons } from '../components/icons.js';
import { runTitle } from './quiz.js';
import { esc, prose, link, button, levelChip } from '../components/html.js';

export const title = () => t('tabHome');

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
      lesson: next,
      title: state.lastLesson || Object.keys(state.completed).length ? t('continueLearning') : t('startLearning'),
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
  const lang = getLang();
  const day = app.day();
  const filter = state.settings.levelFilter;
  const review = dailyReview(ctx, state, day);
  const selected = recommendation(app, review);
  const resume = resumableRun(state);
  const stats = overall(ctx, state, filter);
  const mistakes = pendingErrors(ctx, state, filter).length;
  const recommended = recommendedLesson(ctx, state);
  const current = nextLesson(ctx, state)?.id || recommended?.id;
  const started = Boolean(state.lastLesson || state.lastRun || stats.learned || state.xp.total);
  const percent = Math.round((stats.learned / Math.max(1, stats.lessons)) * 100);
  const island = selected.lesson && ctx.islandById.get(selected.lesson.island);
  const filters = ['all', ...ctx.levels.map(level => level.id)].map(id =>
    `<button type="button" class="filter-chip" data-action="filter" data-level="${id}" aria-pressed="${filter === id}">${id === 'all' ? t('filterAll') : esc(id)}</button>`).join('');
  const starts = ctx.levels.filter(level => level.id !== recommended?.level).map(level =>
    button('start-level', t('startLevel', level.id), 'secondary', `data-level="${level.id}"`)).join('');
  const action = !started && recommended
    ? button('start-level', t('startLevel', recommended.level), 'primary', `data-level="${recommended.level}"`)
    : selected.action;

  return `<div class="home-grid">
  <div class="home-main">
    <section class="continue-card">
      <div class="continue-copy">
        <p class="eyebrow-line">${island ? `${island.emoji} ${t('moduleN', num(island.order))} · ${esc(islandName(island, lang))}` : esc(t('grammarCourseName'))}</p>
        <h1>${selected.title}</h1>
        <p class="continue-detail">${selected.detail}</p>
        ${selected.outcome ? `<p class="continue-outcome">${prose(selected.outcome)}</p>` : ''}
        <div class="continue-actions">${action}${!started ? starts : ''}</div>
      </div>
      <div class="continue-ring" role="img" aria-label="${esc(t('topicsDone', num(stats.learned), num(stats.lessons)))}" style="--p:${percent}">
        <span><b>${num(percent)}</b><small>%</small></span>
      </div>
    </section>

    ${todayStrip(state, day, review)}

    <section class="home-section" aria-labelledby="levels-title">
      <div class="section-row"><h2 id="levels-title">${t('levelsTitle')}</h2></div>
      ${levelStrip(ctx, state)}
    </section>

    <section class="home-section course" aria-labelledby="course-title">
      <div class="course-head">
        <span class="course-icon" aria-hidden="true">${icons.learn}</span>
        <div class="course-copy"><small>${t('yourCourse')} · ${t('courseGrammar')} B1</small>
          <h2 id="course-title">${t('grammarCourseName')}</h2>
          <p>${t('grammarCourseSub', num(ctx.lessons.size), num(ctx.islands.length))}</p></div>
        <a class="btn secondary search-btn" href="#topics">${icons.search}<span>${t('findRule')}</span></a>
      </div>
      <div class="course-tools">
        <div class="course-meter"><span>${t('topicsDone', num(stats.learned), num(stats.lessons))}</span>
          <span class="bar" aria-hidden="true"><i style="inline-size:${percent}%"></i></span></div>
        <div class="filter-group" role="group" aria-label="${esc(t('filterLabel'))}">${filters}</div>
      </div>
      <div class="modules">${renderCourse(app, current)}</div>
    </section>
  </div>

  <aside class="home-rail" aria-label="${esc(t('studyTools'))}">
    ${streakCard(state, day)}
    ${goalCard(state, day)}
    ${rankCard(state)}
    <section class="widget">
      <div class="widget-head"><span class="widget-icon review" aria-hidden="true">${icons.cards}</span>
        <div><strong class="widget-title">${t('reviewToday')}</strong><span class="widget-label">${review.ids.length ? reviewSummary(review) : t('reviewReadyLater')}</span></div></div>
      ${review.ids.length && resume ? button('run', t('startReview'), 'secondary', 'data-key="daily"')
        : mistakes ? button('run', t('practiceMistakes'), 'secondary', 'data-key="mistakes"') : link('practice', t('choosePractice'), 'secondary')}
    </section>
    <a class="widget exam-widget" href="#model-exams">
      <div class="widget-head"><span class="widget-icon exam" aria-hidden="true">${icons.exam}</span>
        <div><strong class="widget-title">${t('courseExam')}</strong><span class="widget-label">${t('examToolDesc')}</span></div></div>
    </a>
  </aside>
</div>`;
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
  }
};
