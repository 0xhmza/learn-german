// The four learning areas shown on the dashboard (grammar, vocabulary,
// writing, exams): progress per area for the current level, and where the
// learner stopped last time in each area.
import { examResult } from './model-exams.js';
import { CEFR } from '../cefr.js';

export const AREAS = ['grammar', 'vocab', 'writing', 'tests'];
export const LEVELS = CEFR.map(level => level.id);
export const DEFAULT_LEVEL = 'B1';

export const currentLevel = state => (LEVELS.includes(state.settings.level) ? state.settings.level : DEFAULT_LEVEL);
// Only B1 has content so far: the grammar islands, writing tasks and the telc exams.
export const levelHasContent = level => level === 'B1';

// Which area a route belongs to, for remembering where the learner stopped.
export function areaOf(route) {
  if (route.view === 'lesson') return 'grammar';
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
  const everyday = Object.entries(ctx.learning.islands || {}).filter(([, task]) => ctx.questions.has(`write-${task.lesson}`)).map(([island, task]) => ({
    kind: 'everyday', id: island, task, key: `write-${task.lesson}`, hash: `practice/write-${task.lesson}`,
    done: Boolean(state.results[`write-${task.lesson}`])
  }));
  return { exams, everyday };
}

export function writingProgress(ctx, state) {
  const { exams, everyday } = writingTasks(ctx, state);
  const all = [...exams, ...everyday];
  return { done: all.filter(task => task.done).length, total: all.length };
}

// Exam parts that can be checked (reading and Sprachbausteine of every mock exam).
export function testsProgress(ctx, state) {
  let done = 0;
  let total = 0;
  for (const model of ctx.modelTests.values()) {
    for (const section of model.sections) {
      if (!examResult(section, {}).total) continue;
      total += 1;
      if (state.modelExams[model.id]?.[section.id]?.checked) done += 1;
    }
  }
  return { done, total };
}

export function vocabProgress(state) {
  const entries = Object.entries(state.words);
  const [word, day] = entries.at(-1) || [];
  return { words: entries.length, last: word ? { word, day } : null };
}
