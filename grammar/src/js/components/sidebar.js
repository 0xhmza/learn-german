// Shared topic browser for the dashboard and the navigation sidebar.
import { t, num, getLang } from '../i18n/index.js';
import { inFilter, lessonTitle, islandName } from '../content.js';
import { lessonStatus, lessonStars } from '../engine/progress.js';
import { esc, prose, de, meter, stars, levelChip } from './html.js';

const chevron = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
export const disclosureIcon = `<span class="topic-chevron">${chevron}</span>`;
const treeIcon = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 4v12m0-10H7m-3.5 8H7M10 6h6m-6 8h6"/></svg>';
const searchIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const check = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 8 2.5 2.5L12 5"/></svg>';

// Search tolerates accents, Arabic short vowels, letter variants and articles.
export const searchKey = value => String(value).normalize('NFD').replace(/[\p{M}`]/gu, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ـ/g, '').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/(^|[\s·،,(])(?:وال|بال|كال|فال|لل|ال)(?=\p{Script=Arabic}{2})/gu, '$1')
  .toLowerCase();

export function topicTitle(value, lang = getLang()) {
  return lang === 'de' ? de(value.replaceAll('`', '')) : `<span lang="ar" dir="rtl">${prose(value)}</span>`;
}

function topicLabel(title, german, lang) {
  const secondary = lang === 'ar' && !searchKey(title).includes(searchKey(german));
  return topicTitle(title, lang) + (secondary ? `<span class="topic-secondary">${topicTitle(german, 'de')}</span>` : '');
}

export function topicStatus(state, lesson) {
  const status = lessonStatus(state, lesson);
  const label = { done: 'topicDone', started: 'topicStarted', new: 'topicNew' }[status];
  return `<span class="topic-status ${status}">${status === 'done' ? check : ''}${t(label)}</span>`;
}

export function hideCompletedControl(state) {
  return `<label class="hide-completed"><input type="checkbox" data-hide-completed ${state.settings.hideCompleted ? 'checked' : ''}>
    <span>${t('hideCompleted')}</span></label>`;
}

function collections(ctx, mode, lang) {
  if (mode === 'telc') return ctx.levels.map(level => ({
    book: level.book,
    groups: ctx.chapters.filter(chapter => chapter.level === level.id).map(chapter => ({
      id: `chapter-${chapter.chapter}`,
      title: chapter.title,
      keywords: [chapter.title, `Lektion ${chapter.chapter}`, t('roadmapChapter', num(chapter.chapter)), level.id],
      label: `<small>${t('roadmapChapter', num(chapter.chapter))}</small>${topicTitle(chapter.title, 'de')}`,
      lessons: chapter.lessons
    }))
  }));
  return [{ groups: ctx.islands.map(island => ({
    id: island.id,
    title: islandName(island, lang),
    keywords: [island.name.ar, island.name.de, island.nickname.de, island.nickname.ar],
    label: topicLabel(islandName(island, lang), islandName(island, 'de'), lang),
    icon: `<span class="sum-emoji ${island.palette}" aria-hidden="true">${island.emoji}</span>`,
    href: `#island/${island.id}`,
    lessons: ctx.islandLessons(island.id)
  })) }];
}

export function renderIndex({ ctx, state, query = '', current, open = new Map(), compact = false, defaultTopic }) {
  const lang = getLang();
  const needle = searchKey(query.trim());
  const { levelFilter, hideCompleted, roadmap } = state.settings;
  let count = 0;
  let hidden = 0;
  const html = collections(ctx, roadmap, lang).map(({ book, groups }) => {
    const available = groups.flatMap(group => group.lessons).filter(lesson => inFilter(lesson, levelFilter));
    const cards = groups.map(group => {
      const lessons = group.lessons.filter(lesson => inFilter(lesson, levelFilter));
      const matchGroup = !needle || searchKey(group.keywords.join(' ')).includes(needle);
      const matches = lessons.filter(lesson => matchGroup || searchKey([
        lessonTitle(lesson, 'ar'), lessonTitle(lesson, 'de'), lesson.german, lesson.level
      ].join(' ')).includes(needle));
      const visible = hideCompleted ? matches.filter(lesson => !state.completed[lesson.id]) : matches;
      count += visible.length;
      hidden += matches.length - visible.length;
      if (!visible.length) return '';
      const done = lessons.filter(lesson => state.completed[lesson.id]).length;
      const active = visible.some(lesson => lesson.id === current);
      const expanded = open.get(group.id) ?? (Boolean(needle) || visible.some(lesson => lesson.id === (current || defaultTopic)));
      return `<details class="topic-group" data-topic-group="${group.id}" ${expanded ? 'open' : ''} ${active ? 'data-current-group' : ''}>
        <summary>
          ${group.icon || ''}
          <span class="topic-group-title">${group.label}</span>
          <span class="topic-group-progress ${done === lessons.length ? 'done' : ''}">
            <span aria-hidden="true">${done === lessons.length ? check : ''}<bdi dir="ltr">${num(done)} / ${num(lessons.length)}</bdi></span>
            <span class="sr-only">${t('topicsDone', num(done), num(lessons.length))}${active ? ` · ${t('currentTopicGroup')}` : ''}</span>
            ${done === lessons.length ? '' : meter(done, lessons.length, group.title)}
          </span>
          ${disclosureIcon}
        </summary>
        <ul class="topic-links">${visible.map(lesson => {
          const earned = lessonStars(state, lesson.id);
          return `<li><a class="topic-link" href="#lesson/${lesson.id}" ${current === lesson.id ? 'aria-current="page"' : ''}>
            <span class="topic-link-title">${topicLabel(lessonTitle(lesson, lang), lessonTitle(lesson, 'de'), lang)}</span>
            <span class="topic-link-progress">${!compact && group.href && levelFilter === 'all' ? levelChip(lesson.level) : ''}
              ${topicStatus(state, lesson)}${!compact && earned > 1 ? stars(earned, 12) : ''}</span>
          </a></li>`;
        }).join('')}</ul>
        ${group.href ? `<a class="topic-island-link" href="${group.href}">${t('openIsland')}</a>` : ''}
      </details>`;
    }).join('');
    if (!cards) return '';
    return book ? `<section class="topic-book">
      <h3>${de(book)}</h3><p>${t('topicsDone', num(available.filter(lesson => state.completed[lesson.id]).length), num(available.length))}</p>
      <div class="topic-groups">${cards}</div>
    </section>` : `<div class="topic-groups">${cards}</div>`;
  }).join('');
  return {
    html: html || `<div class="topic-empty"><p>${t(hidden ? (needle ? 'noOpenMatches' : 'noOpenTopics') : 'noMatch')}</p>
      ${hidden ? `<button type="button" class="btn secondary" data-show-completed>${t('showCompleted')}</button>` : ''}</div>`,
    count,
    hidden
  };
}

export const createTopicBrowser = () => ({ query: '', open: new Map(), searchOpen: new Map() });

export function renderTopicBrowser(options) {
  const { state, id, browser, compact, overview = '' } = options;
  const tree = renderIndex({ ...options, query: browser.query, open: browser.query.trim() ? browser.searchOpen : browser.open });
  return `<div class="topic-browser ${compact ? 'compact' : ''}">
    <div class="topic-modes seg" role="group" aria-label="${esc(t('roadmapLabel'))}">
      ${['islands', 'telc'].map(mode => `<button type="button" data-roadmap-mode="${mode}" aria-pressed="${state.settings.roadmap === mode}">${t(mode === 'telc' ? 'roadmapTelc' : 'roadmapIslands')}</button>`).join('')}
    </div>
    ${overview}
    <div class="topic-tools">
      <label class="search-label">${searchIcon}<input type="search" data-topic-search dir="auto" value="${esc(browser.query)}"
        aria-label="${esc(t('searchLabel'))}" placeholder="${esc(t('searchPh'))}"></label>
      ${hideCompletedControl(state)}
    </div>
    <div class="topic-tree-tools">
      <button type="button" class="topic-bulk" data-topic-bulk aria-controls="${id}">${treeIcon}<span>${t('expandTopics')}</span></button>
      <span class="topic-count" data-topic-count role="status">${countLabel(tree)}</span>
    </div>
    <div class="topic-tree" id="${id}" role="group" aria-label="${esc(t('indexLabel'))}">${tree.html}</div>
  </div>`;
}

function countLabel({ count, hidden }) {
  return t('topicsN', count) + (hidden ? ` · ${t('topicsHidden', num(hidden))}` : '');
}

export function bindTopicBrowser(root, getOptions) {
  const wrapper = root.querySelector('.topic-browser');
  const search = wrapper.querySelector('[data-topic-search]');
  const list = wrapper.querySelector('.topic-tree');
  const bulk = wrapper.querySelector('[data-topic-bulk]');
  const count = wrapper.querySelector('[data-topic-count]');
  let mode = getOptions().state.settings.roadmap;
  const getGroups = () => [...list.querySelectorAll('details[data-topic-group]')];
  const isExpanded = groups => groups.length > 0 && groups.every(group => group.open);
  function syncBulk() {
    const groups = getGroups();
    bulk.disabled = groups.length === 0;
    const label = t(isExpanded(groups) ? 'collapseTopics' : 'expandTopics');
    if (bulk.lastElementChild.textContent !== label) bulk.lastElementChild.textContent = label;
  }
  const overrides = browser => browser.query.trim() ? browser.searchOpen : browser.open;
  function refresh() {
    const options = getOptions();
    const { state, browser } = options;
    const previous = list.scrollTop;
    const tree = renderIndex({ ...options, query: browser.query, open: overrides(browser) });
    list.innerHTML = tree.html;
    list.scrollTop = mode === state.settings.roadmap ? previous : 0;
    mode = state.settings.roadmap;
    const label = countLabel(tree);
    if (count.textContent !== label) count.textContent = label;
    for (const button of wrapper.querySelectorAll('[data-roadmap-mode]')) {
      button.setAttribute('aria-pressed', String(state.settings.roadmap === button.dataset.roadmapMode));
    }
    wrapper.querySelector('[data-hide-completed]').checked = state.settings.hideCompleted;
    syncBulk();
  }
  search.addEventListener('input', () => {
    const { browser } = getOptions();
    browser.query = search.value;
    browser.searchOpen.clear();
    refresh();
    list.scrollTop = 0;
  });
  bulk.addEventListener('click', () => {
    const groups = getGroups();
    const open = !isExpanded(groups);
    const choices = overrides(getOptions().browser);
    for (const group of groups) {
      group.open = open;
      choices.set(group.dataset.topicGroup, open);
    }
    syncBulk();
  });
  list.addEventListener('toggle', event => {
    const group = event.target;
    if (!group.dataset.topicGroup) return;
    syncBulk();
  }, true);
  list.addEventListener('click', event => {
    const group = event.target.closest('summary')?.parentElement;
    if (group?.dataset.topicGroup) overrides(getOptions().browser).set(group.dataset.topicGroup, !group.open);
  });
  syncBulk();
  return { refresh, search };
}
