// Lesson index in the sidebar, grouped by island.
import { t, num, getLang } from '../i18n/index.js';
import { inFilter, lessonTitle, islandName } from '../content.js';
import { lessonStars } from '../engine/progress.js';
import { esc, prose } from './html.js';

// Search ignores accents, Arabic short vowels, letter variants and the
// article: «المجهول» also finds «للمجهول».
export const searchKey = value => String(value).normalize('NFD').replace(/[\p{M}`]/gu, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ـ/g, '').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/(^|[\s·،,(])(?:وال|بال|كال|فال|لل|ال)(?=\p{Script=Arabic}{2})/gu, '$1')
  .toLowerCase();

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
      <summary title="${esc(island.name[lang === 'de' ? 'ar' : 'de'])}">
        <svg class="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>
        <span class="sum-emoji ${island.palette}" aria-hidden="true">${island.emoji}</span>
        <span class="sum-name">${prose(islandName(island, lang))}</span><bdi class="sum-count" dir="ltr" aria-label="${t('of', num(learned), num(lessons.length))}">${num(learned)}/${num(lessons.length)}</bdi></summary>
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
