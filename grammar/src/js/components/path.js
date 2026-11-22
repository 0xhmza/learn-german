// The course path: one module per grammar island, each a vertical line of
// lesson nodes that ends with the module exam.
import { t, num, getLang } from '../i18n/index.js';
import { inFilter, lessonTitle, islandName } from '../content.js';
import { lessonStars, lessonStatus, islandProgress } from '../engine/progress.js';
import { examSize, passMark } from '../engine/runs.js';
import { esc, stars, levelChip, button, meter } from './html.js';
import { topicTitle } from './sidebar.js';
import { icons } from './icons.js';

function node(app, lesson, current) {
  const { state } = app;
  const lang = getLang();
  const status = lessonStatus(state, lesson);
  const earned = lessonStars(state, lesson.id);
  const isCurrent = lesson.id === current;
  const stage = status === 'done' ? 'done' : isCurrent ? 'current' : status;
  const title = lessonTitle(lesson, lang);
  return `<li class="path-node ${stage}">
    <a class="path-link" href="#lesson/${lesson.id}" ${isCurrent ? 'aria-current="step"' : ''}>
      <span class="path-dot" aria-hidden="true">${status === 'done' ? icons.check : `<span>${lesson.emoji}</span>`}</span>
      <span class="path-text">
        <strong>${topicTitle(title, lang)}</strong>
        <span class="path-meta">${lang === 'ar' ? `<bdi class="de-name" lang="de" dir="ltr">${esc(lesson.german)}</bdi>` : ''}${levelChip(lesson.level)}${earned ? stars(earned, 13) : ''}</span>
      </span>
      ${isCurrent ? `<span class="path-tip">${t(status === 'new' ? 'nodeStart' : 'nodeContinue')}</span>` : ''}
    </a>
  </li>`;
}

function examNode(app, island) {
  const p = islandProgress(app.ctx, app.state, island.id);
  const size = examSize(p.totalAll);
  const stage = p.conquered ? 'conquered' : p.examReady ? 'ready' : 'locked';
  const text = p.conquered ? `${t('examBest', num(p.examBest), num(size))}`
    : p.examReady ? t('examIntro', num(size), num(passMark(size))) : t('examLocked', num(p.learnedAll), num(p.totalAll));
  const action = p.conquered ? button('run', t('examRepeat'), 'quiet', `data-key="exam-${island.id}"`)
    : p.examReady ? button('run', t('examStart'), 'primary', `data-key="exam-${island.id}"`) : '';
  return `<li class="path-node exam ${stage}">
    <div class="path-link">
      <span class="path-dot" aria-hidden="true">${p.examReady || p.conquered ? icons.trophy : icons.lock}</span>
      <span class="path-text"><strong>${t('islandExam')}</strong><span class="path-meta">${text}</span>${action ? `<span class="path-action">${action}</span>` : ''}</span>
    </div>
  </li>`;
}

// One module. `open` decides whether the lesson list starts expanded.
export function renderModule(app, island, { current, open = true, collapsible = true, heading = 'h3' } = {}) {
  const { ctx, state } = app;
  const lang = getLang();
  const lessons = ctx.islandLessons(island.id).filter(lesson => inFilter(lesson, state.settings.levelFilter));
  if (!lessons.length) return '';
  const p = islandProgress(ctx, state, island.id, state.settings.levelFilter);
  const done = p.learned === p.total;
  const head = `<span class="module-badge ${island.palette}" aria-hidden="true">${p.conquered ? icons.trophy : island.emoji}</span>
    <span class="module-text"><small>${t('moduleN', num(island.order))}</small>
      <${heading} class="module-title">${esc(islandName(island, lang))}</${heading}>
      <span class="module-meter">${meter(p.learned, p.total, islandName(island, lang))}<bdi dir="ltr">${num(p.learned)} / ${num(p.total)}</bdi></span></span>
    ${done ? `<span class="module-done" aria-hidden="true">${icons.check}</span>` : ''}`;
  const body = `<ol class="path" aria-label="${esc(t('trailLabel'))}">${lessons.map(lesson => node(app, lesson, current)).join('')}${examNode(app, island)}</ol>
    <a class="module-more" href="#island/${island.id}">${t('openIsland')} ${icons.chevron}</a>`;
  if (!collapsible) return `<section class="module ${done ? 'complete' : ''}" id="module-${island.id}"><div class="module-head">${head}</div>${body}</section>`;
  return `<details class="module ${done ? 'complete' : ''}" id="module-${island.id}" ${open ? 'open' : ''}>
    <summary class="module-head">${head}<span class="module-chevron" aria-hidden="true">${icons.chevron}</span></summary>${body}</details>`;
}

// The whole grammar course, opening the module of the current lesson.
export function renderCourse(app, current) {
  const { ctx } = app;
  const currentIsland = ctx.lessons.get(current)?.island;
  const anyOpen = ctx.islands.some(island => island.id === currentIsland);
  return ctx.islands.map((island, i) => renderModule(app, island, {
    current, open: island.id === currentIsland || (!anyOpen && i === 0)
  })).join('');
}

