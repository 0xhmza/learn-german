// Lesson index in the sidebar, grouped by island.
import { t, num, getLang } from '../i18n/index.js';
import { inFilter, lessonTitle, islandName } from '../content.js';
import { lessonStars } from '../engine/progress.js';
import { esc, prose } from './html.js';

export const searchKey = value => String(value).normalize('NFD').replace(/\p{M}/gu, '').replace(/[أإآٱ]/g, 'ا').replace(/ـ/g, '').toLowerCase();

export function renderIndex({ ctx, state, query, current, open }) {
  const lang = getLang();
  const needle = searchKey(query.trim());
  const filter = state.settings.levelFilter;
  let count = 0;
  const groups = ctx.islands.map(island => {
    const lessons = ctx.islandLessons(island.id).filter(lesson => inFilter(lesson, filter)).filter(lesson => !needle || searchKey([
      lesson.i18n.ar.title, lesson.i18n.de.title, lesson.german, island.name.ar, island.name.de, island.nickname.de
    ].join(' ')).includes(needle));
    if (!lessons.length) return '';
    count += lessons.length;
    const learned = lessons.filter(lesson => state.completed[lesson.id]).length;
    const isOpen = needle || open.has(island.id) || lessons.some(lesson => lesson.id === current);
    return `<details data-island="${island.id}" ${isOpen ? 'open' : ''}>
      <summary title="${esc(island.name[lang === 'de' ? 'ar' : 'de'])}"><span class="sum-emoji ${island.palette}" aria-hidden="true">${island.emoji}</span>
        <span>${esc(islandName(island, lang))}</span><span class="sum-count">${num(learned)}/${num(lessons.length)}</span><span class="chevron" aria-hidden="true">⌄</span></summary>
      <div class="index-links">${lessons.map(lesson => {
        const stars = lessonStars(state, lesson.id);
        return `<a href="#lesson/${lesson.id}" ${current === lesson.id ? 'aria-current="page"' : ''}>
          <span class="dot ${stars ? 'done' : ''}" aria-hidden="true">${stars ? '★'.repeat(stars) : '·'}</span><span>${prose(lessonTitle(lesson, lang))}</span></a>`;
      }).join('')}</div>
      <a class="index-island" href="#island/${island.id}">${t('openIsland')}</a>
    </details>`;
  }).join('');
  return { html: count ? groups : `<p class="notice">${t('noMatch')}</p>`, count };
}
