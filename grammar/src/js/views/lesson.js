// Lesson page: rule at a glance, worked example, explanation, pitfall,
// recall, table, sources and the "lesson learned" step.
import { t, num, getLang } from '../i18n/index.js';
import { localize, lessonTitle, islandName, routeFor } from '../content.js';
import { lessonStars, missingPrereqs, visitLesson } from '../engine/progress.js';
import { esc, prose, de, germanLine, link, button, stars, levelChip, crumbs } from '../components/html.js';

let stepCount = 1;
let lastLesson = '';

export function title(app, route) {
  return lessonTitle(app.ctx.lessons.get(route.key), getLang());
}

function renderGlance(lesson) {
  const roles = t('roles');
  const pattern = `<div class="glance-formula"><h3 class="label">${t('formula')}</h3><div class="pattern" lang="de" dir="ltr">${lesson.pattern.map(token =>
    ['+', ',', '·', '…', '→'].includes(token) ? `<span class="op" aria-hidden="true">${esc(token)}</span>` : `<span class="chip">${esc(token)}</span>`).join('')}</div></div>`;
  const frames = `<div class="glance-structure"><h3 class="label">${t('structure')}</h3><div class="frames">${lesson.frames.map(frame => `
    <div class="frame"><span class="frame-kind">${t('kinds')[frame.k]}</span>
      <div class="slots" lang="de" dir="ltr">${frame.parts.map(([role, text]) => `<span class="slot ${role}"><b>${esc(text)}</b>${roles[role] ? `<i lang="${getLang()}" dir="${getLang() === 'ar' ? 'rtl' : 'ltr'}">${roles[role]}</i>` : ''}</span>`).join('')}</div></div>`).join('')}
    </div><p class="frames-hint">${t('framesHint')}</p></div>`;
  return `<section class="panel glance" aria-labelledby="glance-title">
    <h2 class="icon-heading" id="glance-title"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h3"/></svg>${t('glance')}</h2>
    ${pattern}${frames}</section>`;
}

function wrongRight(pair) {
  const [wrong, right] = String(pair).split(' → ');
  return `<div class="wr" lang="de" dir="ltr">
    <div class="no"><span class="mark" aria-hidden="true">✗</span><span class="sr-only" lang="${getLang()}">${t('wrong')}</span><span>${esc(wrong)}</span></div>
    <div class="yes"><span class="mark" aria-hidden="true">✓</span><span class="sr-only" lang="${getLang()}">${t('right')}</span><span>${esc(right)}</span></div></div>`;
}

function renderTable([headers, ...rows]) {
  return `<section class="panel table-panel"><h2>${t('tableTitle')}</h2><p class="table-help">${t('tableHelp')}</p><div class="table-wrap" tabindex="0" role="region" aria-label="${t('tableLabel')}">
    <table><thead><tr>${headers.map(cell => `<th scope="col">${prose(cell)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([label, ...cells]) => `<tr><th scope="row">${prose(label)}</th>${cells.map(cell => `<td>${prose(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </div></section>`;
}

function finishBar(app, lesson, total) {
  const viewed = Boolean(app.state.viewed[lesson.id]);
  const ready = stepCount >= total;
  return `<section class="finish-bar lesson-finish ${viewed ? 'done' : ''}" id="finish">
    ${viewed ? `<p><strong>${t('viewed')}</strong></p>` : `<p id="finish-hint" ${ready ? 'hidden' : ''}>${t('finishHint')}</p>`}
    <div class="actions">
      ${button('run', t('quickPractice'), 'primary', `data-key="quick-${lesson.id}"`)}
      ${viewed ? '' : button('finish', t('markViewed'), 'secondary', ready ? '' : 'disabled')}
    </div></section>`;
}

export function render(app, route) {
  const { ctx, state } = app;
  const lang = getLang();
  const lesson = ctx.lessons.get(route.key);
  if (lastLesson !== lesson.id) {
    stepCount = 1;
    lastLesson = lesson.id;
  }
  if (!app.redrawing && (state.lastLesson !== lesson.id || state.player.at !== lesson.id)) app.store.update(s => visitLesson(s, lesson.id));
  const view = localize(lesson, lang);
  const study = ctx.lessonStudy.get(lesson.id);
  const outcome = ctx.learning.outcomes?.[lesson.id]?.[lang];
  const island = ctx.islandById.get(lesson.island);
  const siblings = ctx.islandLessons(island.id);
  const chapter = state.settings.roadmap === 'telc' && ctx.chapters.find(item => item.chapter === lesson.source.lektion);
  const chapterLabel = chapter ? t('roadmapChapter', num(chapter.chapter)) : '';
  const path = routeFor(ctx, 'all', state.settings.roadmap);
  const position = path.indexOf(lesson);
  const prev = path[position - 1];
  const next = path[position + 1];
  const level = ctx.levelById.get(lesson.level);
  const missing = missingPrereqs(ctx, state, lesson);
  const sourceTitle = t('sourceLine', '`' + level.book + '`', num(lesson.source.lektion));
  const translation = lang === 'de'
    ? `<span class="tr-label">${t('inArabic')}</span><p lang="ar" dir="rtl">${esc(view.translation)}</p>`
    : `<p>${prose(view.translation)}</p>`;
  const total = view.steps.length;
  if (state.completed[lesson.id]) stepCount = Math.max(stepCount, total);

  const sectionCrumb = chapter
    ? [null, `${chapterLabel} · ${de(chapter.title)}`]
    : [`island/${island.id}`, esc(islandName(island, lang))];
  return `${crumbs([['home', t('home')], sectionCrumb, [null, prose(view.title)]])}
    <section class="lesson-banner ${island.palette}">
      <div class="unit-head"><span class="lesson-emoji" aria-hidden="true">${lesson.emoji}</span>
      <div><span class="lesson-count">${chapter ? chapterLabel : t('lessonOnIsland', num(lesson.order), num(siblings.length))}</span><h1>${prose(view.title)}</h1>
        ${lang === 'ar' ? `<p class="lesson-german" lang="de" dir="ltr">${esc(lesson.german)}</p>` : ''}
        <div class="lesson-sub">${levelChip(lesson.level)} ${stars(lessonStars(state, lesson.id))}</div></div></div>
      ${missing.length ? `<p class="prereq-chip">${t('bestFirst')} ${missing.map(item => `<a href="#lesson/${item.id}">${prose(lessonTitle(item, lang))}</a>`).join(lang === 'ar' ? '، ' : ', ')}</p>` : ''}
      ${outcome ? `<p class="lead lesson-outcome"><strong>${t('learningGoal')}</strong> ${prose(outcome)}</p>` : ''}
      <p class="lead">${prose(view.lead)}</p>
      <div class="actions">${button('run', t('lessonPractice', num(lesson.questions.length)), 'secondary', `data-key="${lesson.id}"`)}
        ${study ? link(`cards/${lesson.id}`, t('cardsTitle')) : ''}
        ${state.viewed[lesson.id] ? `<span class="learned-chip">${t('viewed')}</span>` : ''}</div>
    </section>
    ${renderGlance(lesson)}
    <div class="lesson-body">
      <section class="panel">
        <div class="panel-head"><h2>${t('stepByStep')}</h2><span class="step-count" id="step-count">${t('stepOf', num(Math.min(stepCount, total)), num(total))}</span></div>
        <div class="example">${germanLine(lesson.example)}${translation}</div>
        <ol class="steps" id="lesson-steps">${view.steps.map((step, i) => `
          <li class="step" ${i >= stepCount ? 'hidden' : ''}>
            <span class="step-num" aria-hidden="true">${num(i + 1)}</span>
            <div><h3>${prose(step.text)}</h3>${germanLine(step.example)}<p>${prose(step.why)}</p></div>
          </li>`).join('')}</ol>
        <div class="actions" id="step-controls" ${stepCount >= total ? 'hidden' : ''}>
          ${button('step', t('nextStep'), 'primary', `title="${t('keyHint')}"`)}${button('all-steps', t('allSteps'))}
        </div>
        <p class="sr-only" id="step-status" aria-live="polite"></p>
        ${finishBar(app, lesson, total)}
      </section>
      <div class="lesson-side">
        <section class="panel reading"><h2>${t('detail')}</h2>${view.explain.map(p => `<p>${prose(p)}</p>`).join('')}</section>
        <section class="panel pitfall"><h2>⚠ ${t('pitfall')}</h2>${wrongRight(lesson.pitfallPair)}<p>${prose(view.pitfall)}</p></section>
        <details class="panel recall"><summary>${t('recall')}</summary>
          <p>${prose(view.recall[0])}</p><details><summary>${t('showAnswer')}</summary><p>${prose(view.recall[1])}</p></details>
        </details>
      </div>
    </div>
    ${view.table ? renderTable(view.table) : ''}
    ${study ? `<section class="panel lesson-depth" aria-labelledby="depth-title">
      <div><h2 id="depth-title">${t('lessonDepth')}</h2><p>${prose(study[lang])}</p></div>
      <div><h3>${t('lessonWorked')}</h3>${germanLine(study.correct)}
        <div class="actions study-actions">${button('run', t('lessonApply'), 'secondary', `data-key="apply-${lesson.id}"`)}</div></div>
    </section>` : ''}
    <details class="panel sources"><summary>${t('sources')}</summary>
      <p><strong>${prose(sourceTitle)}</strong></p>
      <p>${lesson.source.kind === 'sample' ? t('sourceSample') : t('sourceToc')} ${t('sourceOriginal')}</p>
      <ul>${view.links.map(([label, url]) => `<li><a href="${esc(url)}" target="_blank" rel="noopener">${prose(label)} ↗</a></li>`).join('')}</ul>
    </details>
    <nav class="lesson-nav" aria-label="${t('lessonNav')}">${prev ? link(`lesson/${prev.id}`, t('prevLesson')) : link(`island/${island.id}`, t('backToIsland'))}
      ${next ? link(`lesson/${next.id}`, t('nextLesson'), 'primary') : link('practice', t('toPractice'), 'primary')}</nav>`;
}

function revealSteps(app, all, source) {
  const steps = [...document.querySelectorAll('.step')];
  const old = stepCount;
  stepCount = Math.min(steps.length, all ? steps.length : stepCount + 1);
  steps.slice(old, stepCount).forEach(element => {
    element.hidden = false;
    element.classList.add('enter');
  });
  const controls = document.querySelector('#step-controls');
  controls.hidden = stepCount >= steps.length;
  document.querySelector('#step-count').textContent = t('stepOf', num(stepCount), num(steps.length));
  document.querySelector('#step-status').textContent = t('stepsShown', num(stepCount), num(steps.length));
  if (stepCount >= steps.length) {
    const finish = document.querySelector('[data-action="finish"]');
    if (finish) finish.disabled = false;
    const hint = document.querySelector('#finish-hint');
    if (hint) hint.hidden = true;
  }
  if (!all) steps[stepCount - 1]?.scrollIntoView({ block: 'nearest', behavior: app.reduceMotion() ? 'auto' : 'smooth' });
  if (controls.hidden && source) {
    steps[old]?.setAttribute('tabindex', '-1');
    steps[old]?.focus({ preventScroll: true });
  }
}

export const actions = {
  step: (app, target) => revealSteps(app, false, target),
  'all-steps': (app, target) => revealSteps(app, true, target),
  finish(app) {
    const id = app.route.key;
    app.apply([{ kind: 'lessonLearned', lesson: id }]);
    app.rerender();
    document.querySelector('#finish')?.scrollIntoView({ block: 'nearest' });
    document.querySelector('#finish button')?.focus({ preventScroll: true });
  }
};

export function onKey(app, event) {
  const forward = getLang() === 'ar' ? 'ArrowLeft' : 'ArrowRight';
  if (![forward, ' '].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target.closest('a,button,input,textarea,select,summary,[tabindex="0"]')) return;
  if (stepCount < document.querySelectorAll('.step').length) {
    event.preventDefault();
    revealSteps(app, false);
  }
}
