// Boot: theme and language → content → state → chrome → router.
import { indexContent } from './content.js';
import { createStore, safeGet, safeSet, LANG_KEY, THEME_KEY } from './state.js';
import { parse } from './router.js';
import { today } from './dates.js';
import { t, num, setLang, getLang } from './i18n/index.js';
import { award } from './engine/gamification.js';
import { overall } from './engine/progress.js';
import { renderHud } from './components/hud.js';
import { createTopicBrowser, bindTopicBrowser, renderTopicBrowser } from './components/sidebar.js';
import { createToaster, describeNotes } from './components/toast.js';
import { esc, plainText, prose } from './components/html.js';
import * as home from './views/home.js';
import * as island from './views/island.js';
import * as lesson from './views/lesson.js';
import * as practice from './views/practice.js';
import * as quiz from './views/quiz.js';
import * as progress from './views/progress.js';
import * as settings from './views/settings.js';
import * as readings from './views/readings.js';
import * as sprachbausteine from './views/sprachbausteine.js';
import * as cards from './views/cards.js';
import * as modelExams from './views/model-exams.js';
import { goToRun } from './views/practice.js';

const views = { home, island, lesson, practice, quiz, progress, settings, readings, sprachbausteine, cards, 'model-exams': modelExams };
// Actions available on every page.
const globalActions = {
  run: (app, target) => goToRun(app, target.dataset.key)
};
const root = document.documentElement;
const $ = selector => document.querySelector(selector);
const content = $('#content');
const main = $('#main');
const sidebarHost = $('#sidebar-browser');
const menu = $('#menu');
const sidebar = $('#sidebar');
const shade = $('#shade');
const themeButton = $('#theme');
const storage = (() => { try { return window.localStorage; } catch { return null; } })();

async function loadContent() {
  const inline = document.getElementById('content-data');
  if (inline) return JSON.parse(inline.textContent);
  const response = await fetch('content.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`content.json: ${response.status}`);
  return response.json();
}

function currentTheme() {
  return root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function applyTheme() {
  const dark = currentTheme() === 'dark';
  themeButton.setAttribute('aria-label', dark ? t('toLight') : t('toDark'));
  themeButton.title = themeButton.getAttribute('aria-label');
  $('meta[name="theme-color"]').content = dark ? '#111019' : '#f6f5fa';
}

function applyChrome() {
  const lang = getLang();
  root.lang = lang;
  root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of document.querySelectorAll('[data-t-prose]')) el.innerHTML = prose(t(el.dataset.tProse));
  for (const el of document.querySelectorAll('[data-t-aria]')) el.setAttribute('aria-label', t(el.dataset.tAria));
  for (const el of document.querySelectorAll('[data-t-ph]')) el.placeholder = t(el.dataset.tPh);
  for (const el of document.querySelectorAll('[data-t-title]')) el.title = t(el.dataset.tTitle);
  for (const el of document.querySelectorAll('[data-lang]')) el.setAttribute('aria-pressed', String(el.dataset.lang === lang));
  setDrawer(sidebar.classList.contains('open'));
  applyTheme();
}

function setDrawer(open) {
  sidebar.classList.toggle('open', open);
  shade.hidden = !open;
  menu.setAttribute('aria-expanded', String(open));
  menu.title = t(open ? 'menuClose' : 'menuOpen');
  menu.setAttribute('aria-label', menu.title);
}

async function boot() {
  const initialLang = safeGet(storage, LANG_KEY) || safeGet(storage, 'deutsch-b11-lang') || (root.lang === 'de' ? 'de' : 'ar');
  setLang(initialLang);
  let raw;
  try {
    raw = await loadContent();
  } catch (error) {
    applyChrome();
    content.innerHTML = `<section class="panel"><h1>${t('loadErrorTitle')}</h1><p>${prose(t('loadErrorHelp'))}</p><p><small dir="auto">${esc(error.message)}</small></p></section>`;
    return;
  }
  const ctx = indexContent(raw);
  const store = createStore(ctx, { storage, day: today() });
  const toaster = createToaster($('#toasts'));
  const browser = createTopicBrowser();
  let sidebarTree;
  let route = null;
  let view = null;
  let cleanup = null;

  const app = {
    ctx,
    store,
    get state() { return store.state; },
    get route() { return route; },
    // True while the current page is redrawn in place (not navigated to).
    redrawing: false,
    day: () => today(),
    reduceMotion: () => store.state.settings.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches,
    toast(notes) {
      const messages = describeNotes(ctx, notes);
      if (messages.length) toaster(messages);
    },
    // Applies learning events in one store update and shows their notes.
    apply(events) {
      const notes = store.update(state => events.flatMap(event => award(ctx, state, event, today())));
      this.toast(notes);
      return notes;
    },
    navigate(hash) {
      if (location.hash === `#${hash}`) render();
      else location.hash = hash;
    },
    rerender({ keepScroll = true } = {}) {
      const y = window.scrollY;
      this.redrawing = true;
      try { render(true); } finally { this.redrawing = false; }
      if (keepScroll) window.scrollTo({ top: y });
    },
    setLanguage(next) {
      if (next === getLang()) return;
      setLang(next);
      safeSet(storage, LANG_KEY, next);
      applyChrome();
      mountSidebar();
      this.rerender();
    },
    setTheme(mode) {
      if (mode === 'light' || mode === 'dark') {
        root.dataset.theme = mode;
        safeSet(storage, THEME_KEY, mode);
      } else {
        delete root.dataset.theme;
        try { storage?.removeItem(THEME_KEY); } catch { /* ignore */ }
      }
      applyTheme();
    },
    themeMode: () => root.dataset.theme || 'auto'
  };

  const sidebarOptions = () => ({
    ctx, state: store.state, compact: true, browser, id: 'sidebar-topics',
    current: route?.view === 'lesson' ? route.key : null
  });

  function mountSidebar() {
    sidebarHost.innerHTML = renderTopicBrowser(sidebarOptions());
    sidebarTree = bindTopicBrowser(sidebarHost, sidebarOptions);
  }

  function drawChrome() {
    $('#hud').innerHTML = renderHud(store.state, today());
    sidebarTree.refresh();
    const { levelFilter } = store.state.settings;
    const stats = overall(ctx, store.state, levelFilter);
    $('#side-progress').textContent = t('topicsDone', num(stats.learned), num(stats.lessons));
    const level = $('#side-level');
    level.hidden = levelFilter === 'all';
    level.textContent = levelFilter;
    level.title = t('filterLabel');
    const meter = $('#side-meter');
    meter.max = Math.max(1, stats.lessons);
    meter.value = stats.learned;
  }

  function render(initial = false) {
    cleanup?.();
    cleanup = null;
    const previous = route;
    route = parse(location.hash, ctx);
    view = views[route.view];
    if (!app.redrawing) setDrawer(false);
    if (route.view === 'lesson' && route.key !== previous?.key) {
      const current = ctx.lessons.get(route.key);
      browser.open.delete(current.island);
      browser.open.delete(`chapter-${current.source.lektion}`);
    }
    for (const anchor of document.querySelectorAll('[data-tab]')) {
      if (anchor.dataset.tab === route.tab) anchor.setAttribute('aria-current', 'page');
      else anchor.removeAttribute('aria-current');
    }
    if (route.tab === 'settings') $('#settings-link').setAttribute('aria-current', 'page');
    else $('#settings-link').removeAttribute('aria-current');
    content.innerHTML = view.render(app, route);
    document.title = view.title ? `${plainText(view.title(app, route))} · ${t('brand')}` : t('docTitle');
    cleanup = view.mount?.(app, content, route) || null;
    drawChrome();
    if (!initial) {
      main.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    }
  }

  store.subscribe(drawChrome);

  const notice = [];
  if (!store.available) notice.push(t('storageOff'));
  if (store.migrated) notice.push(t('migrated'));
  if (notice.length) {
    $('#notice-slot').innerHTML = notice.map(text => `<p class="notice dismissible">${prose(text)} <button type="button" class="btn quiet" data-dismiss>${esc(t('dismiss'))}</button></p>`).join('');
    $('#notice-slot').addEventListener('click', event => event.target.closest('[data-dismiss]')?.parentElement.remove());
  }

  function updateTopicSetting(target, key, value, focusSelector) {
    if (store.state.settings[key] === value) return;
    const area = target.closest('#sidebar') || content;
    store.update(state => { state.settings[key] = value; });
    if (route.view === 'home' || route.view === 'island' || (route.view === 'lesson' && key === 'roadmap')) app.rerender();
    (area.querySelector(focusSelector) || area.querySelector('[data-topic-search]'))?.focus({ preventScroll: true });
  }

  document.addEventListener('click', event => {
    const mode = event.target.closest('[data-roadmap-mode]');
    if (mode) updateTopicSetting(mode, 'roadmap', mode.dataset.roadmapMode, `[data-roadmap-mode="${mode.dataset.roadmapMode}"]`);
    const show = event.target.closest('[data-show-completed]');
    if (show) updateTopicSetting(show, 'hideCompleted', false, '[data-hide-completed]');
  });
  document.addEventListener('change', event => {
    if (!event.target.matches('[data-hide-completed]')) return;
    updateTopicSetting(event.target, 'hideCompleted', event.target.checked, '[data-hide-completed]');
  });
  sidebarHost.addEventListener('click', event => {
    if (event.target.closest('a') && sidebar.classList.contains('open')) {
      setDrawer(false);
      if (event.target.closest('a').hash === location.hash) main.focus({ preventScroll: true });
    }
  });
  menu.addEventListener('click', () => {
    const open = !sidebar.classList.contains('open');
    setDrawer(open);
    if (open) sidebarTree.search.focus();
  });
  shade.addEventListener('click', () => {
    setDrawer(false);
    menu.focus();
  });
  for (const el of document.querySelectorAll('[data-lang]')) el.addEventListener('click', () => app.setLanguage(el.dataset.lang));
  themeButton.addEventListener('click', () => app.setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  $('.skip').addEventListener('click', event => {
    event.preventDefault();
    main.focus();
  });
  window.addEventListener('hashchange', () => render());
  window.addEventListener('pagehide', () => store.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.flush();
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sidebar.classList.contains('open')) {
      setDrawer(false);
      menu.focus();
      return;
    }
    view?.onKey?.(app, event);
  });
  content.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    const handler = view?.actions?.[target.dataset.action] || globalActions[target.dataset.action];
    if (handler) {
      event.preventDefault();
      handler(app, target, event);
    }
  });
  content.addEventListener('input', event => view?.onInput?.(app, event));
  content.addEventListener('change', event => view?.onChange?.(app, event));

  applyChrome();
  mountSidebar();
  render(true);
}

boot();
