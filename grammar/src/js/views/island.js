// One island: banner, lesson trail and the island exam.
import { t, num, getLang } from '../i18n/index.js';
import { inFilter, islandName } from '../content.js';
import { islandProgress } from '../engine/progress.js';
import { renderTrail, mountTrail } from '../components/trail.js';
import { esc, link, button, meter, crumbs, prose } from '../components/html.js';

export function title(app, route) {
  return islandName(app.ctx.islandById.get(route.key), getLang());
}

export function render(app, route) {
  const { ctx, state } = app;
  const lang = getLang();
  const island = ctx.islandById.get(route.key);
  const p = islandProgress(ctx, state, island.id);
  const other = lang === 'de' ? island.nickname.ar : island.nickname.de;
  const lessons = ctx.islandLessons(island.id);
  const filtered = lessons.filter(lesson => inFilter(lesson, state.settings.levelFilter));
  const available = filtered.length ? filtered : lessons;
  const next = available.find(lesson => !state.completed[lesson.id]) || available[0];
  const runKey = `island-${island.id}`;
  const run = state.runs[runKey];
  const size = run && !run.finished ? run.ids.length : available.reduce((sum, lesson) => sum + lesson.questions.length, 0);
  const task = ctx.learning.islands?.[island.id];
  return `${crumbs([['home', t('home')], [null, esc(islandName(island, lang))]])}
    <section class="lesson-banner island-banner ${island.palette}">
      <div class="unit-head"><span class="lesson-emoji" aria-hidden="true">${island.emoji}</span>
        <div><span class="lesson-count">${t('islandCount', num(island.order), num(ctx.islands.length))}</span>
          <h1>${esc(islandName(island, lang))} ${p.conquered ? '<span class="flag-inline" aria-hidden="true">🚩</span>' : ''}</h1>
          <div class="lesson-sub"><span ${lang === 'de' ? 'lang="ar" dir="rtl"' : 'lang="de" dir="ltr"'}>${esc(other)}</span> · <span>${esc(island.nickname[lang])}</span></div></div></div>
      <p class="lead">${esc(island.blurb[lang])}</p>
      <div class="island-meter">${meter(p.learnedAll, p.totalAll, islandName(island, lang))}<span>${t('learnedOf', num(p.learnedAll), num(p.totalAll))}</span><span class="star-sum">★ ${num(p.stars)} / ${num(p.maxStars)}</span>
        ${p.conquered ? `<span class="conquered-chip">${t('conquered')}</span>` : ''}</div>
      <div class="actions">${link(`lesson/${next.id}`, t('nextIslandLesson'), 'primary')}${button('run', t('islandPracticeSize', num(size)), 'secondary', `data-key="${runKey}"`)}${link('home', t('home'))}</div>
    </section>
    ${task ? `<section class="panel lesson-depth"><div><h2>${t('realLifeTask')}</h2><p>${prose(task[lang])}</p></div>
      <div class="actions study-actions">${button('run', t('startShortWriting'), 'secondary', `data-key="write-${task.lesson}"`)}
      ${task.reading ? link(`readings/${task.reading}`, t('connectedReading')) : ''}${link('model-exams/petra/schreiben', t('examWritingTask'))}</div></section>` : ''}
    ${renderTrail(app, island)}`;
}

export function mount(app, root, route) {
  return mountTrail(root, app, app.ctx.islandById.get(route.key));
}
