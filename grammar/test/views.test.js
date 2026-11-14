// Renders every page in both languages without a browser and checks that
// no template hole leaks into the markup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../src/js/i18n/index.js';
import { parse } from '../src/js/router.js';
import { award } from '../src/js/engine/gamification.js';
import { renderMap } from '../src/js/components/map.js';
import { renderHud } from '../src/js/components/hud.js';
import { renderIndex } from '../src/js/components/sidebar.js';
import * as home from '../src/js/views/home.js';
import * as island from '../src/js/views/island.js';
import * as lesson from '../src/js/views/lesson.js';
import * as practice from '../src/js/views/practice.js';
import * as quiz from '../src/js/views/quiz.js';
import * as progress from '../src/js/views/progress.js';
import * as settings from '../src/js/views/settings.js';
import { context, freshState } from './support/context.js';

const day = '2026-11-14';
const views = { home, island, lesson, practice, quiz, progress, settings };

function fakeApp(ctx, state) {
  const store = {
    state,
    available: true,
    update(fn) { return fn(this.state); },
    save() {},
    replace(next) { this.state = next; }
  };
  return {
    ctx,
    store,
    get state() { return store.state; },
    day: () => day,
    reduceMotion: () => true,
    redrawing: false,
    themeMode: () => 'auto',
    route: null
  };
}

function check(html, where) {
  assert.equal(typeof html, 'string', where);
  assert.ok(html.length > 100, `${where}: suspiciously short`);
  for (const hole of ['undefined', '[object Object]', 'NaN', '${']) {
    assert.ok(!html.includes(hole), `${where}: contains ${hole}`);
  }
}

function busyState(ctx) {
  const state = freshState(ctx, day);
  state.settings.dailyGoal = 15;
  const passiv = ctx.islandLessons('passiv');
  for (const item of passiv) award(ctx, state, { kind: 'lessonLearned', lesson: item.id }, day);
  award(ctx, state, { kind: 'lessonRun', lesson: passiv[0].id, correct: 9, total: 9 }, day);
  award(ctx, state, { kind: 'exam', island: 'passiv', correct: 9, total: 10 }, day);
  award(ctx, state, { kind: 'answer', q: ctx.route[0].questions[0], correct: false }, day);
  return state;
}

for (const lang of ['ar', 'de']) {
  test(`every page renders in ${lang} for a new and an active learner`, () => {
    setLang(lang);
    const ctx = context();
    for (const [label, state] of [['new', freshState(ctx, day)], ['active', busyState(ctx)]]) {
      const app = fakeApp(ctx, state);
      const routes = ['#home', '#practice', '#progress', '#settings',
        ...ctx.islands.map(item => `#island/${item.id}`),
        ...[...ctx.lessons.keys()].map(id => `#lesson/${id}`),
        '#practice/passiv-perfekt', '#practice/exam-passiv', '#practice/mixed', '#practice/test', '#practice/mistakes'];
      for (const hash of routes) {
        const route = parse(hash, ctx);
        app.route = route;
        const html = views[route.view].render(app, route);
        check(html, `${label} ${lang} ${hash}`);
        if (views[route.view].title) assert.ok(views[route.view].title(app, route), `${hash} title`);
      }
      check(renderMap(app, 'wide'), `${label} map wide`);
      check(renderMap(app, 'tall'), `${label} map tall`);
      check(renderHud(app.state, day), `${label} hud`);
      check(renderIndex({ ctx, state: app.state, query: '', current: null, open: new Set() }).html, `${label} index`);
    }
  });
}

test('the dashboard lists every island and every lesson', () => {
  setLang('de');
  const ctx = context();
  const app = fakeApp(ctx, freshState(ctx, day));
  const html = home.render(app, parse('#home', ctx));
  for (const id of ctx.lessons.keys()) assert.ok(html.includes(`#lesson/${id}"`), id);
  for (const item of ctx.islands) assert.ok(html.includes(`#island/${item.id}"`), item.id);
});

test('the map marks conquered islands and places the boat', () => {
  setLang('ar');
  const ctx = context();
  const app = fakeApp(ctx, busyState(ctx));
  const svg = renderMap(app, 'wide');
  assert.match(svg, /class="isle conquered[^"]*" data-island="passiv"/);
  assert.match(svg, /class="token" transform="translate\([\d.]+ [\d.]+\)"/);
  assert.equal((svg.match(/class="route-seg"/g) || []).length, ctx.islands.length);
});

test('search in the index finds lessons in both scripts', () => {
  setLang('ar');
  const ctx = context();
  const state = freshState(ctx, day);
  assert.equal(renderIndex({ ctx, state, query: 'Plusquamperfekt', current: null, open: new Set() }).count, 1);
  assert.equal(renderIndex({ ctx, state, query: 'المجهول', current: null, open: new Set() }).count >= 3, true);
  assert.equal(renderIndex({ ctx, state, query: 'zzzz', current: null, open: new Set() }).count, 0);
});
