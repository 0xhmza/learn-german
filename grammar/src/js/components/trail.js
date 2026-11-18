// The lesson path of one island: zigzag nodes, a dashed connector and a
// walker that moves to the current lesson.
import { t, num, getLang } from '../i18n/index.js';
import { lessonTitle } from '../content.js';
import { lessonStars, islandProgress, missingPrereqs } from '../engine/progress.js';
import { examSize, passMark } from '../engine/runs.js';
import { esc, prose, stars, levelChip, button } from './html.js';

export function renderTrail({ ctx, state }, island) {
  const lang = getLang();
  const lessons = ctx.islandLessons(island.id);
  const progress = islandProgress(ctx, state, island.id);
  const nodes = lessons.map(lesson => {
    const count = lessonStars(state, lesson.id);
    const stage = count >= 3 ? 'mastered' : count === 2 ? 'practised' : count === 1 ? 'learned' : 'new';
    const missing = missingPrereqs(ctx, state, lesson);
    return `<li class="trail-node ${stage}" data-lesson="${lesson.id}">
      <a class="node-link" href="#lesson/${lesson.id}">
        <span class="node-dot" aria-hidden="true"><span>${lesson.emoji}</span>${count >= 2 ? '<i class="node-check">✓</i>' : ''}</span>
        <span class="node-text">
          <span class="node-num">${num(lesson.order)}</span>
          <strong>${prose(lessonTitle(lesson, lang))}</strong>
          <span class="node-meta"><span class="de-name" lang="de" dir="ltr">${esc(lesson.german)}</span>${levelChip(lesson.level)}</span>
          ${stars(count)}
          ${missing.length ? `<span class="prereq-chip">${t('bestFirst')} ${missing.map(item => prose(lessonTitle(item, lang))).join(lang === 'ar' ? '، ' : ', ')}</span>` : ''}
        </span>
      </a>
    </li>`;
  }).join('');
  const size = examSize(lessons.length);
  const missing = lessons.filter(lesson => !state.completed[lesson.id]);
  const exam = progress.conquered
    ? `<div class="exam-text"><strong>${t('conquered')}</strong><span>${t('examBest', num(progress.examBest), num(size))}</span>${button('run', t('examRepeat'), 'quiet', `data-key="exam-${island.id}"`)}</div>`
    : progress.examReady
      ? `<div class="exam-text"><strong>${t('islandExam')}</strong><span>${t('examIntro', num(size), num(passMark(size)))}</span>${progress.examTries ? `<span>${t('examBest', num(progress.examBest), num(size))}</span>` : ''}${button('run', t('examStart'), 'primary', `data-key="exam-${island.id}"`)}</div>`
      : `<div class="exam-text"><strong>${t('islandExam')}</strong><span>${t('examLocked', num(progress.learnedAll), num(progress.totalAll))}</span>
          <details><summary>${t('remainingLessons')}</summary><ul>${missing.map(lesson => `<li><a href="#lesson/${lesson.id}">${prose(lessonTitle(lesson, lang))} ${levelChip(lesson.level)}</a></li>`).join('')}</ul></details></div>`;
  return `<div class="trail-wrap" id="trail">
    <svg class="trail-line" aria-hidden="true"><path/></svg>
    <ol class="trail" aria-label="${esc(t('trailLabel'))}">${nodes}
      <li class="trail-node exam ${progress.conquered ? 'conquered' : progress.examReady ? 'ready' : 'locked'}">
        <div class="node-link"><span class="node-dot" aria-hidden="true"><span>${progress.conquered ? '🚩' : '🏰'}</span></span>${exam}</div>
      </li>
    </ol>
    <span class="walker" aria-hidden="true" hidden>🚶</span>
  </div>`;
}

function centerOf(element, origin) {
  const box = element.getBoundingClientRect();
  return [box.left + box.width / 2 - origin.left, box.top + box.height / 2 - origin.top];
}

function drawLine(wrap) {
  const origin = wrap.getBoundingClientRect();
  const points = [...wrap.querySelectorAll('.node-dot')].map(dot => centerOf(dot, origin));
  const svg = wrap.querySelector('.trail-line');
  svg.setAttribute('width', String(origin.width));
  svg.setAttribute('height', String(origin.height));
  svg.setAttribute('viewBox', `0 0 ${origin.width} ${origin.height}`);
  const d = points.map(([x, y], i) => {
    if (!i) return `M${x} ${y}`;
    const [px, py] = points[i - 1];
    const mid = (py + y) / 2;
    return `C${px} ${mid} ${x} ${mid} ${x} ${y}`;
  }).join('');
  svg.querySelector('path').setAttribute('d', d);
}

function walkerSpot(wrap, lessonId) {
  const dot = wrap.querySelector(`.trail-node[data-lesson="${CSS.escape(lessonId)}"] .node-dot`);
  if (!dot) return null;
  const [x, y] = centerOf(dot, wrap.getBoundingClientRect());
  const rtl = getComputedStyle(wrap).direction === 'rtl';
  return [x + (rtl ? -34 : 34) - 18, y - 52];
}

export function mountTrail(root, app, island) {
  const wrap = root.querySelector('#trail');
  if (!wrap) return () => {};
  const walker = wrap.querySelector('.walker');
  const { player } = app.state;
  const own = id => app.ctx.lessons.get(id)?.island === island.id;
  let from = null;
  if (player.animate && own(player.at)) {
    if (own(player.from) && !app.reduceMotion()) from = player.from;
    app.store.update(state => { state.player.animate = false; });
  }
  const place = animate => {
    drawLine(wrap);
    const spot = own(app.state.player.at) ? walkerSpot(wrap, app.state.player.at) : null;
    walker.hidden = !spot;
    if (!spot) return;
    if (animate && from) {
      const start = walkerSpot(wrap, from);
      if (start) {
        walker.style.transition = 'none';
        walker.style.transform = `translate(${start[0]}px, ${start[1]}px)`;
        walker.getBoundingClientRect();
        walker.style.transition = '';
      }
      from = null;
    } else walker.style.transition = 'none';
    requestAnimationFrame(() => {
      walker.style.transform = `translate(${spot[0]}px, ${spot[1]}px)`;
      if (!animate) requestAnimationFrame(() => { walker.style.transition = ''; });
    });
  };
  place(true);
  if (typeof ResizeObserver === 'undefined') return () => {};
  const observer = new ResizeObserver(() => place(false));
  observer.observe(wrap);
  return () => observer.disconnect();
}
