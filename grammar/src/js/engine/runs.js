// Practice runs: which questions a run contains and in which order.
import { inFilter } from '../content.js';
import { pendingErrors } from './progress.js';
import { dueIds } from './srs.js';

export const TEST_MINUTES = 20;
export const MAX_REVIEW = 20;
export const examSize = lessonCount => Math.max(8, Math.min(12, 2 * lessonCount));
export const passMark = total => Math.ceil(0.8 * total);

export function shuffle(items, rng = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function parseRunKey(ctx, key) {
  if (ctx.lessons.has(key)) return { kind: 'lesson', id: key };
  if (ctx.practiceSets.has(key)) return { kind: 'set', id: key };
  if (key?.startsWith('apply-') && ctx.lessonStudy.has(key.slice(6))) return { kind: 'apply', id: key.slice(6) };
  const island = /^(island|exam)-(.+)$/.exec(key || '');
  if (island && ctx.islandById.has(island[2])) return { kind: island[1], id: island[2] };
  if (['mixed', 'test', 'mistakes', 'review'].includes(key)) return { kind: key, id: null };
  return null;
}

export function mixedQuestions(ctx, filter, rng = Math.random, testMode = false) {
  const picked = [];
  for (const island of ctx.islands) {
    const lessons = shuffle(ctx.islandLessons(island.id).filter(lesson => inFilter(lesson, filter)), rng);
    if (!lessons.length) continue;
    const choose = (lesson, difficulties) => {
      const pool = lesson.questions.filter(q => difficulties.includes(q.difficulty) && (!testMode || q.type !== 'text') && !picked.includes(q.id));
      return shuffle(pool, rng)[0];
    };
    const first = choose(lessons[0], [1, 2]);
    if (first) picked.push(first.id);
    const second = choose(lessons[1] || lessons[0], testMode ? [2] : [2, 3]);
    if (second) picked.push(second.id);
  }
  return shuffle(picked, rng).slice(0, 20);
}

// Round-robin over the island's lessons, alternating difficulty 2 and 1,
// never a self-graded writing task.
export function examQuestions(ctx, islandId, rng = Math.random) {
  const lessons = shuffle(ctx.islandLessons(islandId), rng);
  const size = examSize(lessons.length);
  const pools = lessons.map(lesson => shuffle(lesson.questions.filter(q => q.type !== 'text'), rng));
  const picked = [];
  while (picked.length < size) {
    let added = false;
    for (const pool of pools) {
      if (picked.length >= size || !pool.length) continue;
      const want = picked.length % 2 === 0 ? 2 : 1;
      let index = pool.findIndex(q => q.difficulty === want);
      if (index < 0) index = 0;
      picked.push(pool.splice(index, 1)[0].id);
      added = true;
    }
    if (!added) break;
  }
  return picked;
}

export function newRun(ctx, state, key, { rng = Math.random, day, now = Date.now(), filter = state.settings.levelFilter } = {}) {
  const parsed = parseRunKey(ctx, key);
  if (!parsed) return null;
  let ids = [];
  if (parsed.kind === 'lesson') ids = ctx.lessons.get(parsed.id).questions.map(q => q.id);
  if (parsed.kind === 'apply') ids = [key];
  if (parsed.kind === 'set') {
    const set = ctx.practiceSets.get(key);
    ids = shuffle([...set.lessons.map(id => `apply-${id}`), ...set.additionalQuestions], rng);
  }
  if (parsed.kind === 'island') {
    const all = ctx.islandLessons(parsed.id);
    const chosen = all.filter(lesson => inFilter(lesson, filter));
    ids = shuffle((chosen.length ? chosen : all).flatMap(lesson => lesson.questions.map(q => q.id)), rng);
  }
  if (parsed.kind === 'exam') ids = examQuestions(ctx, parsed.id, rng);
  if (parsed.kind === 'mixed' || parsed.kind === 'test') ids = mixedQuestions(ctx, filter, rng, parsed.kind === 'test');
  if (parsed.kind === 'mistakes') ids = pendingErrors(ctx, state, filter);
  if (parsed.kind === 'review') ids = dueIds(ctx, state, day, filter).slice(0, MAX_REVIEW);
  if (!ids.length) return null;
  const mode = parsed.kind === 'test' ? 'test' : parsed.kind === 'exam' ? 'exam' : 'practice';
  return {
    key, mode, kind: parsed.kind, target: parsed.id,
    deadline: mode === 'test' ? now + TEST_MINUTES * 60000 : null,
    ids, answers: {}, grades: {}, order: {}, hinted: {}, position: 0, finished: false, summary: null
  };
}

export function permutation(run, q, length, rng = Math.random) {
  if (!run.order[q.id] || run.order[q.id].length !== length) {
    let result = shuffle(Array.from({ length }, (_, i) => i), rng);
    if (q.type === 'order' && length > 1 && result.every((n, i) => n === i)) result = result.slice(1).concat(result[0]);
    run.order[q.id] = result;
  }
  return run.order[q.id];
}

export function runScore(run) {
  const total = run.ids.length;
  const correct = run.ids.filter(id => run.grades[id] === true).length;
  const counted = run.ids.filter(id => typeof run.grades[id] === 'boolean').length;
  return { total, correct, counted };
}

export function isRunValid(ctx, run) {
  return Boolean(run && Array.isArray(run.ids) && run.ids.length && run.ids.every(id => ctx.questions.has(id)) && parseRunKey(ctx, run.key));
}
