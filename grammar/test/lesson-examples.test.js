// Extra lesson material: six marked examples with translations, Arabic for
// the step examples and the added overview tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../src/js/i18n/index.js';
import { localize } from '../src/js/content.js';
import * as lesson from '../src/js/views/lesson.js';
import { context, freshState } from './support/context.js';

const day = '2026-11-25';
const appFor = ctx => {
  const state = freshState(ctx, day);
  return { ctx, state, store: { state, update: fn => fn(state), save() {} }, day: () => day, reduceMotion: () => true };
};

test('every lesson has a "more examples" screen before the typical mistake', () => {
  setLang('de');
  const ctx = context();
  const app = appFor(ctx);
  for (const item of ctx.lessons.values()) {
    const view = localize(item, 'de');
    assert.ok(view.examples.length >= 6, item.id);
    const flow = lesson.lessonFlow(app, item, view).map(entry => entry.id);
    assert.equal(flow[flow.indexOf('more') + 1], 'pitfall', item.id);
    assert.ok(view.steps.some(step => step.translation), `${item.id}: step examples are translated`);
  }
});

test('the examples screen marks the rule and hides the translation until tapped', () => {
  setLang('ar');
  const ctx = context();
  const view = localize(ctx.lessons.get('obwohl'), 'ar');
  const screen = lesson.lessonFlow(appFor(ctx), ctx.lessons.get('obwohl'), view).find(entry => entry.id === 'more');
  const html = screen.body();
  assert.equal((html.match(/<details>/g) || []).length, 6);
  assert.match(html, /<mark>Obwohl<\/mark>/);
  assert.match(html, /<p lang="ar" dir="rtl">مع أنني متعب أذهب إلى التمرين.<\/p>/);
  assert.doesNotMatch(html, /\*/, 'no raw marks');
});

test('lessons without a table get the added overview table in both languages', () => {
  const ctx = context();
  for (const id of ['genitiv-praep', 'relativ-genitiv', 'passiv-modal', 'lassen', 'falls']) {
    const item = ctx.lessons.get(id);
    assert.ok(localize(item, 'de').table?.length > 2, id);
    assert.notDeepEqual(localize(item, 'de').table[0], localize(item, 'ar').table[0], `${id}: headers are translated`);
  }
  assert.equal(localize(ctx.lessons.get('genitiv'), 'de').table[0][0], 'Artikel', 'existing tables stay');
});
