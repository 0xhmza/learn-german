// Grammar page: where the learner stopped, then the course path of the
// grammar islands (B1). Other levels show what is still missing.
import { t, num, getLang } from '../i18n/index.js';
import { lessonTitle } from '../content.js';
import { nextLesson, overall } from '../engine/progress.js';
import { currentLevel, levelHasContent } from '../engine/areas.js';
import { renderCourse } from '../components/path.js';
import { resumeCard, levelSoonCard } from '../components/widgets.js';
import { stopFor } from '../components/stops.js';
import { icons } from '../components/icons.js';
import { esc, prose, link, button, crumbs, levelChip } from '../components/html.js';

export const title = () => t('courseGrammar');

function resume(app) {
  const { ctx, state } = app;
  const lang = getLang();
  const stop = stopFor(app, 'grammar');
  const next = nextLesson(ctx, state);
  if (stop) {
    // A finished lesson: offer the next one as well.
    if (stop.done && next && next.id !== stop.lesson.id) {
      stop.action = `${link(`lesson/${next.id}`, `${t('nextLessonShort')}: ${prose(lessonTitle(next, lang))}`, 'primary')}${stop.action}`;
    }
    return resumeCard({ stop });
  }
  const first = next || ctx.route[0];
  return resumeCard({
    empty: {
      title: `${prose(lessonTitle(first, lang))} ${levelChip(first.level)}`,
      detail: ctx.learning.outcomes?.[first.id]?.[lang] ? prose(ctx.learning.outcomes[first.id][lang]) : '',
      action: ctx.levels.map((level, i) => button('start-level', t('startLevel', level.id), i ? 'secondary' : 'primary', `data-level="${level.id}"`)).join('')
    }
  });
}

export function render(app) {
  const { ctx, state } = app;
  const level = currentLevel(state);
  const heading = `${crumbs([['home', t('tabHome')], [null, t('courseGrammar')]])}
    <section class="page-head"><h1>${t('courseGrammar')}</h1></section>`;
  if (!levelHasContent(level)) return `${heading}${levelSoonCard()}`;
  const filter = state.settings.levelFilter;
  const stats = overall(ctx, state, filter);
  const percent = Math.round((stats.learned / Math.max(1, stats.lessons)) * 100);
  // The path marks the lesson the banner names, or the next open one.
  const stop = stopFor(app, 'grammar');
  const current = stop && !stop.done ? stop.lesson.id : nextLesson(ctx, state)?.id;
  const filters = ['all', ...ctx.levels.map(item => item.id)].map(id =>
    `<button type="button" class="filter-chip" data-action="filter" data-level="${id}" aria-pressed="${filter === id}">${id === 'all' ? t('filterAll') : esc(id)}</button>`).join('');
  return `${heading}
    ${resume(app)}
    <section class="home-section course" aria-labelledby="course-title">
      <div class="course-head">
        <span class="course-icon" aria-hidden="true">${icons.learn}</span>
        <div class="course-copy"><small>${t('yourCourse')}</small>
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
    </section>`;
}

export const actions = {
  filter(app, target) {
    app.store.update(state => { state.settings.levelFilter = target.dataset.level; });
    app.rerender();
    document.querySelector('#content [data-action="filter"][aria-pressed="true"]')?.focus({ preventScroll: true });
  },
  'start-level'(app, target) {
    app.store.update(state => { state.settings.levelFilter = target.dataset.level; });
    const next = nextLesson(app.ctx, app.state);
    if (next) app.navigate(`lesson/${next.id}`);
  }
};
