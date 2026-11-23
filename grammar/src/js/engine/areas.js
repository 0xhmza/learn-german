// The four learning areas shown on the dashboard (grammar, vocabulary,
// writing, exams): progress per area for the current level, and where the
// learner stopped last time in each area.
import { examResult } from './model-exams.js';
import { wordList } from './words.js';
import { CEFR } from '../cefr.js';

export const AREAS = ['grammar', 'vocab', 'writing', 'tests'];
export const LEVELS = CEFR.map(level => level.id);
export const DEFAULT_LEVEL = 'B1';

export const currentLevel = state => (LEVELS.includes(state.settings.level) ? state.settings.level : DEFAULT_LEVEL);
// Only B1 has content so far: the grammar islands, writing tasks and the telc exams.
export const levelHasContent = level => CEFR.some(info => info.id === level && info.grammar);

// Which area a route belongs to, for remembering where the learner stopped.
export function areaOf(route) {
  if (route.view === 'lesson') return 'grammar';
  if (route.view === 'writing' && route.task) return 'writing';
  if (route.view === 'model-exams' && route.key && route.section) return route.section === 'schreiben' ? 'writing' : 'tests';
  if (route.view === 'quiz') {
    if (/^write-/.test(route.key)) return 'writing';
    if (/^exam-/.test(route.key) || route.key === 'test') return 'tests';
  }
  return null;
}

export function recordVisit(state, route, day) {
  const area = areaOf(route);
  if (!area) return false;
  const last = state.last[area];
  if (last?.hash === route.hash && last.day === day) return false;
  state.last[area] = { hash: route.hash, day };
  return true;
}

export function normalizeLast(raw, isDay) {
  const last = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return last;
  for (const area of ['grammar', 'writing', 'tests']) {
    const entry = raw[area];
    if (entry && typeof entry.hash === 'string' && /^[a-z0-9/-]{1,120}$/i.test(entry.hash) && isDay(entry.day)) last[area] = { hash: entry.hash, day: entry.day };
  }
  return last;
}

export function grammarProgress(ctx, state) {
  const lessons = [...ctx.lessons.keys()];
  return { done: lessons.filter(id => state.completed[id]).length, total: lessons.length };
}

// Writing tasks: the writing part of every mock exam and the everyday
// writing task of every grammar island.
export function writingTasks(ctx, state) {
  const exams = [...ctx.modelTests.values()].filter(model => model.sections.some(section => section.id === 'schreiben')).map(model => ({
    kind: 'exam', id: model.id, model, hash: `model-exams/${model.id}/schreiben`,
    done: Boolean(state.modelExams[model.id]?.schreiben?.writing?.trim())
  }));
  const everyday = [];
  for (const [id, task] of Object.entries(ctx.learning.islands || {})) {
    const key = `write-${task.lesson}`;
    if (!ctx.questions.has(key)) continue;
    const run = state.runs[key];
    const answer = run?.answers?.[key];
    everyday.push({ kind: 'everyday', id, task, key, hash: `practice/${key}`,
      done: Boolean(state.results[key]), draft: !run?.finished && typeof answer === 'string' && Boolean(answer.trim()) });
  }
  return { exams, everyday };
}

export function writingProgress(ctx, state) {
  const { exams, everyday } = writingTasks(ctx, state);
  const all = [...exams, ...everyday];
  return { done: all.filter(task => task.done).length, total: all.length };
}

// Exam parts that can be checked (reading and Sprachbausteine).
export function modelProgress(model, state) {
  let done = 0;
  let total = 0;
  for (const section of model.sections) {
    if (!examResult(section, {}).total) continue;
    total += 1;
    if (state.modelExams[model.id]?.[section.id]?.checked) done += 1;
  }
  return { done, total };
}

export function testsProgress(ctx, state) {
  let done = 0;
  let total = 0;
  for (const model of ctx.modelTests.values()) {
    const progress = modelProgress(model, state);
    done += progress.done;
    total += progress.total;
  }
  return { done, total };
}

export function vocabProgress(state) {
  const entries = wordList(state);
  const [word, day] = entries[0] || [];
  return { words: entries.length, last: word ? { word, day } : null };
}
