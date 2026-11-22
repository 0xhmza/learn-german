// The lesson player: screen order, moving through a lesson, finishing it,
// and rendering every screen of every lesson in both languages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../src/js/i18n/index.js';
import { parse } from '../src/js/router.js';
import { award } from '../src/js/engine/gamification.js';
import { localize } from '../src/js/content.js';
import { lessonRunKey } from '../src/js/engine/runs.js';
import * as lesson from '../src/js/views/lesson.js';
import * as quiz from '../src/js/views/quiz.js';
import * as grammar from '../src/js/views/grammar.js';
import { context, freshState } from './support/context.js';

const day = '2026-11-14';

function fakeApp(ctx, state) {
  const store = { state, available: true, update(fn) { return fn(this.state); }, save() {}, replace(next) { this.state = next; } };
  return {
    ctx, store, route: null, redrawing: false,
    get state() { return store.state; },
    day: () => day,
    reduceMotion: () => true,
    themeMode: () => 'auto',
    apply(events) { return events.flatMap(event => award(ctx, store.state, event, day)); }
  };
}

function noHoles(html, where) {
  for (const hole of ['undefined', '[object Object]', 'NaN', '${']) assert.ok(!html.includes(hole), `${where}: contains ${hole}`);
}

const ids = app => lesson.lessonFlow(app, app.ctx.lessons.get('genitiv'), localize(app.ctx.lessons.get('genitiv'), 'de')).map(item => item.id);

test('a lesson interleaves short checks with the explanation', () => {
  setLang('de');
  const ctx = context();
  const app = fakeApp(ctx, freshState(ctx, day));
  for (const item of ctx.lessons.values()) {
    const flow = lesson.lessonFlow(app, item, localize(item, 'de')).map(entry => entry.id);
    assert.equal(flow[0], 'intro', item.id);
    assert.equal(flow[flow.indexOf('rule') + 1], 'quiz-1', item.id);
    assert.equal(flow[flow.indexOf('pitfall') + 1], 'quiz-3', item.id);
    const lastStep = flow.findLastIndex(id => id.startsWith('step-'));
    assert.equal(flow[(lastStep < 0 ? flow.indexOf('quiz-1') : lastStep) + 1], 'quiz-2', item.id);
    assert.deepEqual(flow.slice(-2), ['practice', 'finish'], item.id);
    assert.equal(new Set(flow).size, flow.length, `${item.id}: unique screen ids`);
    assert.ok(flow.indexOf('quiz-1') <= 3, `${item.id}: first question within three screens`);
  }
});

test('question screens use the lesson practice run', () => {
  assert.equal(lessonRunKey('genitiv', 'quiz-2'), 'lesson-practice-genitiv');
  assert.equal(lessonRunKey('genitiv', 'practice'), 'lesson-practice-genitiv');
  assert.equal(lessonRunKey('genitiv', 'cards'), 'lesson-cards-genitiv');
  assert.equal(lessonRunKey('genitiv', 'rule'), null);
});

test('walking through a lesson answers each question once and finishes with stars and XP', () => {
  setLang('de');
  const ctx = context();
  const state = freshState(ctx, day);
  const app = fakeApp(ctx, state);
  app.route = parse('#lesson/genitiv', ctx);
  lesson.render(app, app.route);
  const flow = ids(app);
  const seen = [state.lessonSlides.genitiv || 'intro'];
  for (let guard = 0; guard < 80; guard++) {
    const slide = state.lessonSlides.genitiv || 'intro';
    if (slide === 'finish') break;
    const run = state.runs['lesson-practice-genitiv'];
    if (slide.startsWith('quiz-') || slide === 'practice') {
      assert.equal(lesson.advance(app, 'genitiv'), null, `${slide}: cannot skip an unchecked question`);
      run.grades[run.ids[run.position]] = true;
    }
    seen.push(lesson.advance(app, 'genitiv'));
  }
  const run = state.runs['lesson-practice-genitiv'];
  const collapsed = seen.filter((id, i) => id !== seen[i - 1]);
  assert.deepEqual(collapsed, flow);
  assert.equal(seen.filter(id => id === 'practice').length, run.ids.length - 3, 'one practice screen per remaining question');
  assert.equal(run.finished, true);
  assert.equal(state.lessonSlides.genitiv, 'finish');
  assert.ok(state.completed.genitiv, 'lesson marked as learned');
  assert.equal(state.stars.genitiv, 3);
  assert.ok(run.xp > 0, 'the completion screen has XP to show');
  assert.equal(lesson.advance(app, 'genitiv'), null, 'nothing follows the completion screen');
});

test('opening a finished lesson starts it again from the first screen', () => {
  setLang('de');
  const ctx = context();
  const state = freshState(ctx, day);
  const app = fakeApp(ctx, state);
  const route = parse('#lesson/genitiv', ctx);
  app.route = route;
  state.lessonSlides.genitiv = 'finish';
  state.runs['lesson-practice-genitiv'] = { finished: true };
  const html = lesson.render(app, route);
  assert.match(html, /data-lesson-slide="intro"/);
  assert.equal(state.runs['lesson-practice-genitiv'].finished, false);
});

for (const lang of ['de', 'ar']) {
  test(`every screen of every lesson renders in ${lang}`, () => {
    setLang(lang);
    const ctx = context();
    const state = freshState(ctx, day);
    const app = fakeApp(ctx, state);
    for (const item of ctx.lessons.values()) {
      const route = parse(`#lesson/${item.id}`, ctx);
      app.route = route;
      app.redrawing = false;
      lesson.render(app, route);
      app.redrawing = true;
      for (const entry of lesson.lessonFlow(app, item, localize(item, lang))) {
        state.lessonSlides[item.id] = entry.id;
        const html = lesson.render(app, route);
        noHoles(html, `${lang} ${item.id} ${entry.id}`);
        assert.match(html, new RegExp(`data-lesson-slide="${entry.id}"`), `${item.id} ${entry.id}`);
        assert.match(html, /class="action-bar"|class="answer-sheet/, `${item.id} ${entry.id}: bottom bar`);
      }
    }
  });
}

test('practice runs open in the same player with a check button', () => {
  setLang('de');
  const ctx = context();
  const app = fakeApp(ctx, freshState(ctx, day));
  const route = parse('#practice/passiv-perfekt', ctx);
  app.route = route;
  const html = quiz.render(app, route);
  assert.match(html, /class="player-bar"/);
  assert.match(html, /data-check/);
  assert.match(html, /data-player-close/);
});

test('Arabic pages isolate German text as left-to-right', () => {
  setLang('ar');
  const ctx = context();
  const app = fakeApp(ctx, freshState(ctx, day));
  const html = grammar.render(app, parse('#grammatik', ctx));
  for (const item of ctx.lessons.values()) {
    const german = item.german.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    assert.ok(html.includes(`lang="de" dir="ltr">${german}<`), `${item.id}: German name marked as LTR`);
  }
  const route = parse('#lesson/genitiv', ctx);
  app.route = route;
  const intro = lesson.render(app, route);
  assert.match(intro, /<div class="de" lang="de" dir="ltr">/);
  assert.match(intro, /<p class="lesson-german" lang="de" dir="ltr">/);
});
