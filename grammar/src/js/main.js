// Boot: theme and language → content → state → chrome → router.
import { indexContent } from './content.js';
import { createStore, safeGet, safeSet, LANG_KEY, THEME_KEY } from './state.js';
import { parse } from './router.js';
import { now, today } from './dates.js';
import { expireWritingDrafts } from './engine/writing.js';
import { t, setLang, getLang } from './i18n/index.js';
import { award } from './engine/gamification.js';
import { renderHud } from './components/hud.js';
import { icons, logo } from './components/icons.js';
import { mountWordPicker } from './components/wordpick.js';
import { addWord } from './engine/words.js';
import { areaOf, currentLevel, levelHasContent, recordVisit } from './engine/areas.js';
import { levelSoonCard } from './components/widgets.js';
import { createToaster, describeNotes } from './components/toast.js';
import { esc, plainText, prose } from './components/html.js';
import * as home from './views/home.js';
import * as grammar from './views/grammar.js';
import * as island from './views/island.js';
import * as topics from './views/topics.js';
import { vocab, writing, level } from './views/sections.js';
import * as lesson from './views/lesson.js';
import * as practice from './views/practice.js';
import * as listening from './views/listening.js';
import * as quiz from './views/quiz.js';
import * as progress from './views/progress.js';
import * as settings from './views/settings.js';
import * as readings from './views/readings.js';
import * as sprachbausteine from './views/sprachbausteine.js';
import * as cards from './views/cards.js';
import * as modelExams from './views/model-exams.js';
import { goToRun } from './views/practice.js';

const views = { home, grammar, island, topics, level, vocab, writing, listening, lesson, practice, quiz, progress, settings, readings, sprachbausteine, cards, 'model-exams': modelExams };
// Main navigation: [hash, tab, label key, icon]. The bottom bar on phones
// leaves out the exam trainer, which the practice page links to.
const NAV = [
  ['home', 'home', 'tabHome', 'learn'],
  ['vokabeln', 'vocab', 'navVocab', 'vocab'],
  ['schreiben', 'writing', 'navWriting', 'writing'],
  ['hoeren', 'listening', 'navListening', 'listen'],
  ['practice', 'practice', 'tabPractice', 'practice'],
  ['model-exams', 'model-exams', 'navExam', 'exam'],
  ['progress', 'progress', 'navProfile', 'profile']
];
// Lessons and practice runs open as a focused player without the app navigation.
const PLAYER_VIEWS = new Set(['lesson', 'quiz']);
const COURSE_VIEWS = new Set(['island', 'topics', 'lesson', 'listening', 'practice', 'quiz', 'readings', 'sprachbausteine', 'cards']);
const unavailableCourse = {
  title: app => t('levelSoonTitle', currentLevel(app.state)),
  render: app => levelSoonCard(currentLevel(app.state), 'h1')
};
// Actions available on every page.
const globalActions = {
  run: (app, target) => goToRun(app, target.dataset.key),
  'save-word'(app, target) {
    app.saveWord(target.dataset.word);
    target.disabled = true;
    target.textContent = t('wordSaved');
  }
};
const root = document.documentElement;
const $ = selector => document.querySelector(selector);
const content = $('#content');
const main = $('#main');
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
  $('meta[name="theme-color"]').content = dark ? '#10141c' : '#f3f5f9';
}

function drawNav() {
  const item = ([hash, tab, label, icon], cls) => `<a href="#${hash}" class="${cls}" data-tab="${tab}"><span class="nav-ico" aria-hidden="true">${icons[icon]}</span><span class="nav-label" data-t="${label}"></span></a>`;
  $('#rail-nav').innerHTML = NAV.map(entry => item(entry, 'rail-link')).join('');
  $('#bottom-nav').innerHTML = NAV.filter(([hash]) => hash !== 'model-exams').map(entry => item(entry, 'tab-link')).join('');
  for (const el of document.querySelectorAll('[data-logo]')) el.innerHTML = logo;
  for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icons[el.dataset.icon];
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
  applyTheme();
}

async function boot() {
  drawNav();
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
  let route = null;
  let picker = null;
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
      // In the player, XP is summed up on the completion screen instead.
      const shown = document.body.classList.contains('player-mode') ? notes.filter(note => note.type !== 'xp') : notes;
      const messages = describeNotes(ctx, shown);
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

  function drawChrome() {
    $('#hud').innerHTML = renderHud(store.state, today());
  }

  function render(initial = false) {
    cleanup?.();
    cleanup = null;
    if (expireWritingDrafts(ctx.writingExercises, store.state.writingCourse, now())) {
      store.save();
      store.flush();
    }
    route = parse(location.hash, ctx);
    const needsCourse = COURSE_VIEWS.has(route.view) || (['model-exams', 'writing'].includes(route.view) && route.key);
    const blocked = needsCourse && !levelHasContent(currentLevel(store.state));
    view = blocked ? unavailableCourse : views[route.view];
    document.body.classList.toggle('player-mode', !blocked && PLAYER_VIEWS.has(route.view));
    document.body.dataset.view = route.view;
    picker?.hide();
    // Remember where the learner stopped in grammar, writing and exams.
    const task = route.view === 'writing' && route.task ? ctx.writingExercises.get(route.key) : null;
    const unopened = task?.heldOut && !store.state.writingCourse[task.id];
    const area = blocked || unopened ? null : areaOf(route);
    const last = area && store.state.last[area];
    if (area && !app.redrawing && (last?.hash !== route.hash || last?.day !== today())) store.update(state => recordVisit(state, route, today()));
    for (const anchor of document.querySelectorAll('[data-tab]')) {
      if (anchor.dataset.tab === route.tab) anchor.setAttribute('aria-current', 'page');
      else anchor.removeAttribute('aria-current');
    }
    for (const anchor of document.querySelectorAll('[data-settings-link]')) {
      if (route.tab === 'settings') anchor.setAttribute('aria-current', 'page');
      else anchor.removeAttribute('aria-current');
    }
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

  // Word list: any German word on the platform can be saved.
  app.notify = (text, icon = '✓') => toaster([{ icon, text, kind: 'goal' }]);
  app.saveWord = word => {
    const saved = store.update(state => addWord(state, word, today()));
    if (saved) toaster([{ icon: '📒', text: t('wordAddedToast', saved), kind: 'word' }]);
    if (route?.view === 'vocab') app.rerender();
    return saved;
  };
  picker = mountWordPicker({
    isSaved: word => Boolean(store.state.words[word]),
    save: word => app.saveWord(word),
    // No lookups while a question is still open.
    blocked: el => Boolean(el.closest('.lesson-quiz') && document.querySelector('[data-check]'))
  });

  const notice = [];
  if (!store.available) notice.push(t('storageOff'));
  if (store.migrated) notice.push(t('migrated'));
  if (notice.length) {
    $('#notice-slot').innerHTML = notice.map(text => `<p class="notice dismissible">${prose(text)} <button type="button" class="btn quiet" data-dismiss>${esc(t('dismiss'))}</button></p>`).join('');
    $('#notice-slot').addEventListener('click', event => event.target.closest('[data-dismiss]')?.parentElement.remove());
  }

  function updateTopicSetting(target, key, value, focusSelector) {
    if (store.state.settings[key] === value) return;
    store.update(state => { state.settings[key] = value; });
    if (['grammar', 'island', 'topics'].includes(route.view) || (route.view === 'lesson' && key === 'roadmap')) app.rerender();
    (content.querySelector(focusSelector) || content.querySelector('[data-topic-search]'))?.focus({ preventScroll: true });
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
    // Escape leaves a lesson or practice run, like the close button.
    if (event.key === 'Escape' && document.body.classList.contains('player-mode') && !event.target.closest('details[open], textarea')) {
      document.querySelector('[data-player-close]')?.click();
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
  render(true);
}

boot();
