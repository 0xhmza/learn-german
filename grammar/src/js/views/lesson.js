import { t, num, getLang } from '../i18n/index.js';
import { localize, lessonTitle, islandName, routeFor } from '../content.js';
import { lessonStars, missingPrereqs, visitLesson } from '../engine/progress.js';
import { lessonRunKey } from '../engine/runs.js';
import { esc, prose, de, germanLine, link, button, meter, stars, levelChip, crumbs } from '../components/html.js';
import * as quiz from './quiz.js';

export const title = (app, route) => lessonTitle(app.ctx.lessons.get(route.key), getLang());

function renderGlance(lesson, lang) {
  const roles = t('roles');
  const pattern = `<div class="glance-formula"><h3 class="label">${t('formula')}</h3><div class="pattern" lang="de" dir="ltr">${lesson.pattern.map(token =>
    ['+', ',', '·', '…', '→'].includes(token) ? `<span class="op">${esc(token)}</span>` : `<span class="chip">${esc(token)}</span>`).join('')}</div></div>`;
  return `<div class="glance">${pattern}<div class="glance-structure">
    <h3 class="label">${t('structure')}</h3><div class="frames">${lesson.frames.map(frame => `
    <div class="frame"><span class="frame-kind">${t('kinds')[frame.k]}</span>
      <div class="slots" lang="de" dir="ltr">${frame.parts.map(([role, text]) => `<span class="slot ${role}"><b>${esc(text)}</b>${roles[role] ? `<i lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">${roles[role]}</i>` : ''}</span>`).join('')}</div></div>`).join('')}
    </div><p class="frames-hint">${t('framesHint')}</p></div></div>`;
}

function wrongRight(pair) {
  const [wrong, right] = pair.split(' → ');
  return `<div class="wr" lang="de" dir="ltr">
    <div class="no"><span class="mark" aria-hidden="true">✗</span><span class="sr-only" lang="${getLang()}">${t('wrong')}</span><span>${esc(wrong)}</span></div>
    <div class="yes"><span class="mark" aria-hidden="true">✓</span><span class="sr-only" lang="${getLang()}">${t('right')}</span><span>${esc(right)}</span></div></div>`;
}

function renderTable([headers, ...rows]) {
  return `<p class="table-help">${t('tableHelp')}</p><div class="table-wrap" tabindex="0" role="region" aria-label="${t('tableLabel')}">
    <table><thead><tr>${headers.map(cell => `<th scope="col">${prose(cell)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([label, ...cells]) => `<tr><th scope="row">${prose(label)}</th>${cells.map(cell => `<td>${prose(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function sources(ctx, lesson, view) {
  const book = ctx.levelById.get(lesson.level).book;
  return `<details class="sources"><summary>${t('sources')}</summary>
    <p><strong>${prose(t('sourceLine', '`' + book + '`', num(lesson.source.lektion)))}</strong></p>
    <p>${t(lesson.source.kind === 'sample' ? 'sourceSample' : 'sourceToc')} ${t('sourceOriginal')}</p>
    <ul>${view.links.map(([label, url]) => `<li><a href="${esc(url)}" target="_blank" rel="noopener">${prose(label)}</a></li>`).join('')}</ul>
  </details>`;
}

function finish(app, lesson, view) {
  const { ctx, state } = app;
  const path = routeFor(ctx, 'all', state.settings.roadmap);
  const index = path.indexOf(lesson);
  const previous = path[index - 1];
  const next = path[index + 1];
  return `<p>${t(state.viewed[lesson.id] ? 'viewed' : 'guideFinishHint')}</p>
    ${state.viewed[lesson.id] ? '' : `<div class="actions">${button('finish', t('markViewed'), 'primary')}</div>`}
    <nav class="lesson-nav" aria-label="${t('lessonNav')}">
      ${previous ? link(`lesson/${previous.id}`, t('prevLesson')) : link(`island/${lesson.island}`, t('backToIsland'))}
      ${next ? link(`lesson/${next.id}`, t('nextLesson')) : link('practice', t('toPractice'))}
    </nav>${sources(ctx, lesson, view)}`;
}

function lessonSlides(app, lesson, view, lang) {
  const { ctx, state } = app;
  const outcome = ctx.learning.outcomes?.[lesson.id]?.[lang];
  const study = ctx.lessonStudy.get(lesson.id);
  const missing = missingPrereqs(ctx, state, lesson);
  const slides = [
    ['intro', t('guideIntro'), () => `
      ${outcome ? `<p class="slide-outcome">${prose(outcome)}</p>` : ''}
      <p>${prose(view.lead)}</p>
      <div class="example">${germanLine(lesson.example)}${lang === 'de' ? `<span class="tr-label">${t('inArabic')}</span>` : ''}
        <p lang="ar" dir="rtl">${esc(view.translation)}</p></div>
      ${missing.length ? `<p class="prereq-chip">${t('bestFirst')} ${missing.map(item => `<a href="#lesson/${item.id}">${prose(lessonTitle(item, lang))}</a>`).join(lang === 'ar' ? '، ' : ', ')}</p>` : ''}`],
    ['rule', t('glance'), () => renderGlance(lesson, lang)],
    ...view.steps.map((step, i) => [`step-${i + 1}`, step.text, () => `
      <div class="example">${germanLine(step.example)}</div><p>${prose(step.why)}</p>`]),
    ['details', t('detail'), () => `${view.explain.map(p => `<p>${prose(p)}</p>`).join('')}
      <details class="slide-recap"><summary>${t('recall')}</summary><p>${prose(view.recall[0])}</p>
        <details><summary>${t('showAnswer')}</summary><p>${prose(view.recall[1])}</p></details></details>`],
    ['pitfall', t('pitfall'), () => wrongRight(lesson.pitfallPair) + `<p>${prose(view.pitfall)}</p>`]
  ];
  if (view.table) slides.push(['table', t('tableTitle'), () => renderTable(view.table)]);
  if (study) slides.push(['example', t('lessonWorked'), () => `<div class="example">${germanLine(study.correct)}</div><p>${prose(study[lang])}</p>
    <div class="actions">${button('run', t('lessonApply'), 'secondary', `data-key="apply-${lesson.id}"`)}</div>`]);
  slides.push(['practice', t('tabPractice')]);
  if (ctx.decks.has(lesson.id)) slides.push(['cards', t('cardsTitle')]);
  slides.push(['finish', t('guideFinish'), () => finish(app, lesson, view)]);
  return slides;
}

const slideButton = (slide, label, style = 'secondary', attrs = '') =>
  button('lesson-slide', label, style, `data-slide="${slide}" ${attrs}`);

function slideNavigation(slides, index, phase, finished) {
  const previous = slides[index - 1];
  const next = slides[index + 1];
  return `<nav class="slide-footer" aria-label="${t('guideNav')}">
    ${previous ? slideButton(previous[0], phase ? prose(previous[1]) : t('guideBack'), 'secondary', 'data-deck-back') : '<span></span>'}
    ${next ? slideButton(next[0], phase || ['practice', 'cards', 'finish'].includes(next[0]) ? esc(next[1]) : t('guideNext'),
      phase && !finished ? 'secondary' : 'primary', 'data-deck-next') : ''}
  </nav>`;
}

export function render(app, route) {
  const { ctx, state } = app;
  const lang = getLang();
  const lesson = ctx.lessons.get(route.key);
  if (!app.redrawing && (state.lastLesson !== lesson.id || state.player.at !== lesson.id)) app.store.update(s => visitLesson(s, lesson.id));
  const view = localize(lesson, lang);
  const island = ctx.islandById.get(lesson.island);
  const slides = lessonSlides(app, lesson, view, lang);
  const index = Math.max(0, slides.findIndex(([id]) => id === state.lessonSlides[lesson.id]));
  const [id, label, body] = slides[index];
  const phase = lessonRunKey(lesson.id, id);
  const chapter = state.settings.roadmap === 'telc' && ctx.chapters.find(item => item.chapter === lesson.source.lektion);
  const section = chapter ? [null, `${t('roadmapChapter', num(chapter.chapter))} · ${de(chapter.title)}`]
    : [`island/${island.id}`, esc(islandName(island, lang))];
  const groups = [['intro', t('guideLearn')], ...slides.filter(([key]) => ['practice', 'cards', 'finish'].includes(key))];
  const currentGroup = phase || id === 'finish' ? id : 'intro';
  const position = t('guidePosition', num(index + 1), num(slides.length));

  return `${crumbs([['home', t('home')], section])}
    <div class="lesson-deck">
      <header class="deck-header ${island.palette}">
        <div><div class="deck-meta">${levelChip(lesson.level)} ${stars(lessonStars(state, lesson.id))}</div>
          <h1>${prose(view.title)}</h1>
          ${lang === 'ar' ? `<p class="lesson-german" lang="de" dir="ltr">${esc(lesson.german)}</p>` : ''}</div>
        <div class="deck-shortcuts" role="group" aria-label="${t('guideShortcuts')}">
          ${button('run', t('guideOpenPractice'), 'secondary', `data-key="${lesson.id}"`)}
          ${ctx.decks.has(lesson.id) ? link(`cards/${lesson.id}`, t('openDeck')) : ''}
        </div>
      </header>
      <nav class="deck-phases" aria-label="${t('guideNav')}">${groups.map(([key, text]) =>
        slideButton(key, esc(text), 'quiet', currentGroup === key ? 'aria-current="step"' : '')).join('')}</nav>
      <div class="deck-progress">
        <span>${position}</span>${meter(index + 1, slides.length, position)}
        <details class="deck-outline"><summary>${t('guideOutline')}</summary><ol>${slides.map(([key, text]) => `<li>
          ${slideButton(key, prose(text), 'quiet', key === id ? 'aria-current="step"' : '')}</li>`).join('')}</ol></details>
      </div>
      <article class="deck-slide panel ${id === 'pitfall' ? 'pitfall' : ''}" data-lesson-slide="${id}">
        ${phase ? quiz.render(app, { key: phase }, true) : `<h2 id="slide-title" tabindex="-1">${prose(label)}</h2><div class="slide-body">${body()}</div>`}
      </article>
      ${slideNavigation(slides, index, phase, state.runs[phase]?.finished)}
    </div>`;
}

function focusSlide() {
  document.querySelector('#slide-title, #quiz-prompt, #phase-result')?.focus();
}

export const actions = {
  ...quiz.actions,
  'lesson-slide'(app, target) {
    app.store.update(state => { state.lessonSlides[app.route.key] = target.dataset.slide; });
    app.rerender();
    if (!app.reduceMotion()) document.querySelector('.deck-slide')?.classList.add('slide-enter');
    focusSlide();
  },
  finish(app) {
    app.apply([{ kind: 'lessonLearned', lesson: app.route.key }]);
    app.rerender();
    focusSlide();
  }
};

export const onInput = quiz.onInput;

export function onKey(app, event) {
  quiz.onKey(app, event);
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey
    || event.target.closest('a,button,input,textarea,select,summary,[tabindex="0"],#sidebar')
    || lessonRunKey(app.route.key, app.state.lessonSlides[app.route.key])) return;
  const forward = getLang() === 'ar' ? 'ArrowLeft' : 'ArrowRight';
  const backward = forward === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
  const target = event.key === forward ? '[data-deck-next]' : event.key === backward ? '[data-deck-back]' : null;
  const control = target && document.querySelector(target);
  if (control) {
    event.preventDefault();
    control.click();
  }
}
