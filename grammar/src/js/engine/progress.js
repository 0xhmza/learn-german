// Learning progress derived from the saved state: stars, island and
// overall progress, the recommended next lesson and answer records.
import { inFilter, routeFor } from '../content.js';
import { schedule } from './srs.js';

export function lessonStars(state, id) {
  return Math.max(state.stars[id] || 0, state.completed[id] ? 1 : 0);
}

// Stars earned by a finished practice run of one lesson (0 = below ★★).
export function runStars(correct, total) {
  const ratio = total ? correct / total : 0;
  if (ratio >= 0.88) return 3;
  if (ratio >= 0.66) return 2;
  return 0;
}

export function islandProgress(ctx, state, islandId, filter = 'all') {
  const all = ctx.islandLessons(islandId);
  const list = all.filter(lesson => inFilter(lesson, filter));
  const learnedAll = all.filter(lesson => state.completed[lesson.id]).length;
  const record = state.islands[islandId] || {};
  return {
    total: list.length,
    learned: list.filter(lesson => state.completed[lesson.id]).length,
    stars: list.reduce((sum, lesson) => sum + lessonStars(state, lesson.id), 0),
    maxStars: list.length * 3,
    totalAll: all.length,
    learnedAll,
    examReady: all.length > 0 && learnedAll === all.length,
    conquered: record.conquered || null,
    examBest: record.examBest || 0,
    examTries: record.examTries || 0
  };
}

export function overall(ctx, state, filter = 'all') {
  const lessons = routeFor(ctx, filter);
  const ids = new Set(lessons.flatMap(lesson => lesson.questions.map(q => q.id)));
  const results = [...ids].map(id => state.results[id]).filter(Boolean);
  return {
    lessons: lessons.length,
    learned: lessons.filter(lesson => state.completed[lesson.id]).length,
    stars: lessons.reduce((sum, lesson) => sum + lessonStars(state, lesson.id), 0),
    maxStars: lessons.length * 3,
    questions: ids.size,
    attempted: results.length,
    correct: results.filter(result => result.correct).length,
    conquered: ctx.islands.filter(island => state.islands[island.id]?.conquered).length,
    islands: ctx.islands.length
  };
}

// First unlearned lesson on the route, then the first one below three
// stars, then null when everything is mastered.
export function nextLesson(ctx, state, filter = state.settings?.levelFilter || 'all') {
  const route = routeFor(ctx, filter);
  return route.find(lesson => !state.completed[lesson.id])
    || route.find(lesson => lessonStars(state, lesson.id) < 3)
    || null;
}

export function pendingErrors(ctx, state, filter = 'all') {
  return ctx.route
    .filter(lesson => inFilter(lesson, filter))
    .flatMap(lesson => [...lesson.questions.map(q => q.id), `apply-${lesson.id}`, `write-${lesson.id}`])
    .filter(id => state.results[id]?.needsReview);
}

export function missingPrereqs(ctx, state, lesson) {
  return lesson.prereqs.filter(id => !state.completed[id]).map(id => ctx.lessons.get(id)).filter(Boolean);
}

// Saves one graded answer. Keeps the original rule that a question leaves
// the mistake list after two correct answers in a row.
export function record(state, q, correct, day) {
  const old = state.results[q.id] || {};
  const streak = correct ? (old.streak || 0) + 1 : 0;
  const needsReview = !correct || Boolean(old.needsReview && streak < 2);
  const cleared = Boolean(old.needsReview && !needsReview);
  const result = { ...old, correct, streak, tries: (old.tries || 0) + 1, needsReview, last: day };
  schedule(result, correct, day);
  state.results[q.id] = result;
  if (cleared) state.stats.mistakesCleared += 1;
  return { result, cleared };
}

// Moves the player token when a lesson is opened.
export function visitLesson(state, id) {
  state.lastLesson = id;
  if (state.player.at !== id) {
    state.player.from = state.player.at;
    state.player.at = id;
    state.player.animate = true;
  }
}
