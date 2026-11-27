import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/js/router.js';
import { context } from './support/context.js';

test('routes resolve against the content', () => {
  const ctx = context();
  assert.deepEqual(parse('', ctx).view, 'home');
  assert.deepEqual(parse('#home', ctx).view, 'home');
  assert.equal(parse('#grammatik', ctx).tab, 'grammar');
  assert.deepEqual(parse('#island/passiv', ctx), { view: 'island', key: 'passiv', hash: 'island/passiv', tab: 'grammar' });
  assert.deepEqual(parse('#island/atlantis', ctx).view, 'home');
  assert.deepEqual(parse('#lesson/passiv-perfekt', ctx).key, 'passiv-perfekt');
  assert.deepEqual(parse('#lesson/passiv-perfekt/x', ctx).view, 'home');
  assert.deepEqual(parse('#practice', ctx).view, 'practice');
  assert.deepEqual(parse('#practice/genitiv', ctx), { view: 'quiz', key: 'genitiv', hash: 'practice/genitiv', tab: 'practice' });
  assert.deepEqual(parse('#practice/exam-passiv', ctx).view, 'quiz');
  assert.deepEqual(parse('#practice/review', ctx).view, 'quiz');
  assert.deepEqual(parse('#progress', ctx).tab, 'progress');
  assert.deepEqual(parse('#settings', ctx).view, 'settings');
  assert.deepEqual(parse('#nonsense', ctx).view, 'home');
  assert.deepEqual(parse('#vokabeln', ctx), { view: 'vocab', key: null, hash: 'vokabeln', tab: 'vocab' });
  assert.deepEqual(parse('#schreiben', ctx).view, 'writing');
  assert.deepEqual(parse('#topics', ctx).view, 'topics');
  assert.deepEqual(parse('#level/b2', ctx), { view: 'level', key: 'b2', hash: 'level/b2', tab: 'home' });
  assert.equal(parse('#level/c2', ctx).view, 'level');
  assert.deepEqual(parse('#level/d1', ctx).view, 'home');
  assert.deepEqual(parse('#vokabeln/x', ctx).view, 'home');
});

test('links from the original B1.1 page still work', () => {
  const ctx = context();
  assert.equal(parse('#practice/unit-3', ctx).view, 'practice');
  assert.equal(parse('#practice/mixed', ctx).view, 'quiz');
  assert.equal(parse('#practice/mistakes', ctx).view, 'quiz');
  assert.equal(parse('#lesson/je-desto', ctx).view, 'lesson');
});
