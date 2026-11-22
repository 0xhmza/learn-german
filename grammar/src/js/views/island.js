// One module (grammar island): header, the real-life task and its path.
import { t, num, getLang } from '../i18n/index.js';
import { inFilter, islandName } from '../content.js';
import { islandProgress, nextLesson } from '../engine/progress.js';
import { renderModule } from '../components/path.js';
import { icons } from '../components/icons.js';
import { link, button, crumbs, prose, esc } from '../components/html.js';

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
  const current = nextLesson(ctx, state)?.id;
  const percent = Math.round((p.learnedAll / Math.max(1, p.totalAll)) * 100);
  return `${crumbs([['home', t('tabHome')], ['grammatik', t('courseGrammar')], [null, `${t('moduleN', num(island.order))} · ${esc(islandName(island, lang))}`]])}
    <section class="module-hero ${island.palette}">
      <span class="module-hero-badge" aria-hidden="true">${p.conquered ? icons.trophy : island.emoji}</span>
      <div class="module-hero-copy">
        <small>${t('moduleN', num(island.order))} · ${t('islandCount', num(island.order), num(ctx.islands.length))}</small>
        <h1>${esc(islandName(island, lang))}</h1>
        <p class="module-hero-sub"><span ${lang === 'de' ? 'lang="ar" dir="rtl"' : 'lang="de" dir="ltr"'}>${esc(other)}</span> · <span>${esc(island.nickname[lang])}</span></p>
        <p>${esc(island.blurb[lang])}</p>
        <div class="module-hero-stats"><span class="bar" aria-hidden="true"><i style="inline-size:${percent}%"></i></span>
          <span>${t('learnedOf', num(p.learnedAll), num(p.totalAll))}</span><span>★ ${num(p.stars)} / ${num(p.maxStars)}</span>
          ${p.conquered ? `<span class="conquered-chip">${t('conquered')}</span>` : ''}</div>
        <div class="actions">${link(`lesson/${next.id}`, t('nextIslandLesson'), 'primary')}${button('run', t('islandPracticeSize', num(size)), 'secondary', `data-key="${runKey}"`)}</div>
      </div>
    </section>
    <div class="module-page">
      ${renderModule(app, island, { current, collapsible: false, heading: 'h2' })}
      ${task ? `<section class="panel task-card"><h2>${t('realLifeTask')}</h2><p>${prose(task[lang])}</p>
        <div class="actions">${button('run', t('startShortWriting'), 'secondary', `data-key="write-${task.lesson}"`)}
        ${task.reading ? link(`readings/${task.reading}`, t('connectedReading'), 'quiet') : ''}${link('model-exams/petra/schreiben', t('examWritingTask'), 'quiet')}</div></section>` : ''}
    </div>`;
}
