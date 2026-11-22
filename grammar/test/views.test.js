// Renders every page in both languages without a browser and checks that
// no template hole leaks into the markup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../src/js/i18n/index.js';
import { parse } from '../src/js/router.js';
import { award } from '../src/js/engine/gamification.js';
import { LAYOUTS, renderMap, routePoints } from '../src/js/components/map.js';
import { renderHud } from '../src/js/components/hud.js';
import { renderIndex } from '../src/js/components/sidebar.js';
import * as home from '../src/js/views/home.js';
import * as grammar from '../src/js/views/grammar.js';
import * as island from '../src/js/views/island.js';
import * as topics from '../src/js/views/topics.js';
import { vocab, writing, level } from '../src/js/views/sections.js';
import * as lesson from '../src/js/views/lesson.js';
import * as practice from '../src/js/views/practice.js';
import * as quiz from '../src/js/views/quiz.js';
import * as progress from '../src/js/views/progress.js';
import * as settings from '../src/js/views/settings.js';
import * as readings from '../src/js/views/readings.js';
import * as sprachbausteine from '../src/js/views/sprachbausteine.js';
import * as cards from '../src/js/views/cards.js';
import * as modelExams from '../src/js/views/model-exams.js';
import { context, freshState } from './support/context.js';

const day = '2026-11-14';
const views = { home, grammar, island, topics, level, vocab, writing, lesson, practice, quiz, progress, settings, readings, sprachbausteine, cards, 'model-exams': modelExams };

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
    route: null,
    apply(events) { return events.flatMap(event => award(ctx, store.state, event, day)); }
  };
}

function check(html, where) {
  assert.equal(typeof html, 'string', where);
  assert.ok(html.length > 100, `${where}: suspiciously short`);
  const markup = html.replace(/data:image\/webp;base64,[A-Za-z0-9+/=]+/g, 'data:image/webp');
  for (const hole of ['undefined', '[object Object]', 'NaN', '${']) {
    assert.ok(!markup.includes(hole), `${where}: contains ${hole}`);
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
      const routes = ['#home', '#practice', '#progress', '#settings', '#topics', '#vokabeln', '#schreiben',
        '#level', '#level/a1', '#level/c1', '#grammatik',
        ...ctx.islands.map(item => `#island/${item.id}`),
        ...[...ctx.lessons.keys()].map(id => `#lesson/${id}`),
        '#practice/passiv-perfekt', '#practice/exam-passiv', '#practice/mixed', '#practice/test', '#practice/mistakes',
        '#readings', '#sprachbausteine', '#cards', '#cards/genitiv', '#practice/apply-genitiv',
        '#model-exams', ...[...ctx.modelTests.values()].flatMap(model => [`#model-exams/${model.id}`, ...model.sections.map(section => `#model-exams/${model.id}/${section.id}`)]),
        ...[...ctx.practiceSets.keys()].map(id => `#practice/${id}`),
        ...[...ctx.readings.keys()].map(id => `#readings/${id}`),
        ...[...ctx.sprachbausteine.keys()].map(id => `#sprachbausteine/${id}`)];
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
      check(renderIndex({ ctx, state: app.state }).html, `${label} index`);
    }
  });
}

test('the grammar page lists every island and every lesson', () => {
  setLang('de');
  const ctx = context();
  const app = fakeApp(ctx, freshState(ctx, day));
  const html = grammar.render(app, parse('#grammatik', ctx));
  for (const id of ctx.lessons.keys()) assert.ok(html.includes(`#lesson/${id}"`), id);
  for (const item of ctx.islands) assert.ok(html.includes(`#island/${item.id}"`), item.id);
});

test('the lesson renders only the saved screen and keeps questions in the practice run', () => {
  setLang('de');
  const ctx = context();
  const state = freshState(ctx, day);
  const app = fakeApp(ctx, state);
  const route = parse('#lesson/genitiv', ctx);
  app.route = route;
  const intro = lesson.render(app, route);
  assert.match(intro, /data-lesson-slide="intro"/);
  assert.match(intro, /class="player-bar"/);
  assert.match(intro, /data-continue/);
  assert.doesNotMatch(intro, /class="wr"|id="quiz-prompt"|<table>|data-deck-back/);
  state.lessonSlides.genitiv = 'quiz-1';
  const question = lesson.render(app, route);
  assert.match(question, /class="lesson-quiz"/);
  assert.match(question, /data-check/);
  assert.equal(state.runs['lesson-practice-genitiv'].ids.length, ctx.lessons.get('genitiv').questions.length + 1);
  assert.equal(state.runs.genitiv, undefined);
  assert.equal(state.lastRun, null);
  state.lessonSlides.genitiv = 'finish';
  app.redrawing = true;
  const finish = lesson.render(app, route);
  assert.match(finish, /Lektion geschafft!/);
  assert.match(finish, /href="#cards\/genitiv"/);
  assert.match(finish, /href="#lesson\/genitiv-praep"/);
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

test('the Arabic map moves islands, docks and the treasure to mirrored coordinates', () => {
  const ctx = context();
  for (const [name, layout] of Object.entries(LAYOUTS)) {
    const ltr = routePoints(ctx, name, false);
    const rtl = routePoints(ctx, name, true);
    assert.deepEqual(rtl, ltr.map(([x, y]) => [layout.width - x, y]));
  }
});

test('search in the index finds lessons in both scripts', () => {
  setLang('ar');
  const ctx = context();
  const state = freshState(ctx, day);
  assert.equal(renderIndex({ ctx, state, query: 'Plusquamperfekt' }).count, 1);
  assert.equal(renderIndex({ ctx, state, query: 'المجهول' }).count >= 3, true);
  assert.equal(renderIndex({ ctx, state, query: 'zzzz' }).count, 0);
});

test('both roadmaps use the same progress and hide completed topics without changing totals', () => {
  setLang('de');
  const ctx = context();
  const state = freshState(ctx, day);
  state.completed['passiv-perfekt'] = day;
  state.started['je-desto'] = true;
  for (const roadmap of ['islands', 'telc']) {
    state.settings.roadmap = roadmap;
    state.settings.hideCompleted = false;
    const full = renderIndex({ ctx, state });
    assert.equal(full.count, ctx.lessons.size);
    assert.match(full.html, /lang="de" dir="ltr">Passiv im Perfekt/);
    assert.match(full.html, /topic-status done/);
    assert.match(full.html, /topic-status started/);
    const groupSize = roadmap === 'islands' ? 4 : 5;
    assert.match(full.html, new RegExp(`value="1" max="${groupSize}"`));
    state.settings.hideCompleted = true;
    const incomplete = renderIndex({ ctx, state });
    assert.equal(incomplete.count, full.count - 1);
    assert.equal(incomplete.hidden, 1);
    assert.doesNotMatch(incomplete.html, /#lesson\/passiv-perfekt"/);
    assert.match(incomplete.html, new RegExp(`value="1" max="${groupSize}"`));
    assert.match(renderIndex({ ctx, state, query: 'Passiv im Perfekt' }).html, /data-show-completed/);
  }
});

test('the dashboard shows the current level and progress in four areas, nothing more', () => {
  setLang('de');
  const ctx = context();
  const state = freshState(ctx, day);
  const app = fakeApp(ctx, state);
  const dashboard = home.render(app, parse('#home', ctx));
  for (const href of ['grammatik', 'vokabeln', 'schreiben', 'model-exams']) assert.match(dashboard, new RegExp(`class="progress-card [^"]*" href="#${href}"`), href);
  assert.equal((dashboard.match(/class="progress-card /g) || []).length, 4);
  assert.doesNotMatch(dashboard, /#lesson\/|class="modules"|class="resume-card|goal-widget|rank-widget/);
  assert.ok(dashboard.indexOf('href="#level"') < dashboard.indexOf('streak-widget'), 'the level card sits above the streak');
  assert.match(dashboard, /Aktuelle Stufe/);
  assert.match(dashboard, /0 von 51 Lektionen gelernt/);
});

test('switching the level changes the dashboard and the area pages', () => {
  setLang('de');
  const ctx = context();
  const state = freshState(ctx, day);
  const app = fakeApp(ctx, state);
  const picker = level.render(app, parse('#level', ctx));
  for (const id of ['A1', 'A2', 'B1', 'B2', 'C1']) assert.match(picker, new RegExp(`data-action="pick-level" data-level="${id}" aria-pressed="${id === 'B1'}"`), id);
  state.settings.level = 'B2';
  const dashboard = home.render(app, parse('#home', ctx));
  assert.match(dashboard, /href="#level" aria-label="Aktuelle Stufe: B2/);
  assert.equal((dashboard.match(/Bald verfügbar/g) || []).length, 3, 'grammar, writing and exams wait for content');
  assert.match(grammar.render(app, parse('#grammatik', ctx)), /B2 ist in Vorbereitung/);
  assert.match(writing.render(app), /B2 ist in Vorbereitung/);
  assert.match(modelExams.render(app, parse('#model-exams', ctx)), /B2 ist in Vorbereitung/);
  assert.match(vocab.render(app), /Meine Wörter/);
});
