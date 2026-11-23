import { isDay } from '../dates.js';

export const WRITING_LIMIT = 12000;
export const criteria = ['task', 'style', 'accuracy'];
export const errorTags = ['word-order', 'case', 'capitalization', 'register', 'coverage', 'cohesion'];
const grades = ['A', 'B', 'C', 'D'];
const values = { A: 5, B: 3, C: 1, D: 0 };
const text = (value, limit = WRITING_LIMIT) => typeof value === 'string' ? value.slice(0, limit) : '';
const stamp = value => Number.isSafeInteger(value) && value > 0 ? value : null;
const array = value => Array.isArray(value) ? value : [];

export const writingHash = task => `schreiben/${task.id}`;
export const pointKey = (prompt, point) => `${prompt}-${point}`;
export const writingScore = review => review ? 3 * criteria.reduce((sum, key) => sum + values[review.grades[key]], 0) : null;
export const isClosedWriting = task => task.kind === 'choice' || task.kind === 'order';
export const taskFinished = attempt => Boolean(attempt?.done);
export const writingDeadline = (task, attempt) => task.minutes && attempt?.started ? attempt.started + task.minutes * 60000 : null;

export function newWritingAttempt(task, now = null) {
  if (isClosedWriting(task)) return { selection: [], checked: false, done: false };
  return {
    started: now, submitted: null, day: null, done: false, revealed: false,
    answers: task.prompts.map(() => ''), revision: null, evidence: {}, checks: [], plan: [],
    review: null, secondReview: null
  };
}

export function checkClosedWriting(task, attempt) {
  return task.kind === 'choice' ? attempt.selection[0] === task.answer
    : task.answer.every((value, index) => attempt.selection[index] === value);
}

export function submitWriting(task, attempt, now, day) {
  if (attempt.submitted || (task.minutes && !attempt.started)) return false;
  const deadline = writingDeadline(task, attempt);
  if (now < (deadline ?? Infinity) && !attempt.answers.every(answer => answer.trim())) return false;
  attempt.submitted = Math.min(now, deadline ?? Infinity);
  attempt.day = day;
  return true;
}

export function normalizeWritingReview(raw) {
  if (!criteria.every(key => grades.includes(raw?.grades?.[key]) && text(raw?.reasons?.[key], 600).trim())) return null;
  return {
    grades: Object.fromEntries(criteria.map(key => [key, raw.grades[key]])),
    reasons: Object.fromEntries(criteria.map(key => [key, text(raw.reasons[key], 600).trim()])),
    tags: errorTags.filter(tag => array(raw.tags).includes(tag))
  };
}

export function normalizeWriting(raw, tasks) {
  const saved = {};
  for (const [id, task] of tasks ?? []) {
    const old = raw?.[id];
    if (!old || typeof old !== 'object') continue;
    const attempt = newWritingAttempt(task, task.minutes ? stamp(old.started) : null);
    if (isClosedWriting(task)) {
      attempt.selection = [...new Set(array(old.selection).filter(value => Number.isInteger(value) && value >= 0 && value < task.options.length))]
        .slice(0, task.kind === 'choice' ? 1 : task.options.length);
      attempt.checked = old.checked === true && attempt.selection.length === (task.kind === 'choice' ? 1 : task.options.length);
      attempt.done = old.done === true || (attempt.checked && checkClosedWriting(task, attempt));
    } else {
      if (task.minutes && !attempt.started) continue;
      attempt.answers = task.prompts.map((_, i) => text(old.answers?.[i]));
      attempt.plan = task.plan ? task.prompts[0].points.map((_, i) => text(old.plan?.[i], 500)) : [];
      const submitted = stamp(old.submitted);
      if (submitted && isDay(old.day) && (!task.minutes || (submitted >= attempt.started && submitted <= writingDeadline(task, attempt)))) {
        attempt.submitted = submitted;
        attempt.day = old.day;
        attempt.revealed = old.revealed === true;
        attempt.done = attempt.revealed && old.done === true;
        attempt.checks = criteria.filter(key => array(old.checks).includes(key));
        task.prompts.forEach((prompt, i) => prompt.points.forEach((_, j) => {
          const key = pointKey(i, j);
          const range = old.evidence?.[key];
          if (Array.isArray(range) && range.length === 2 && range.every(Number.isInteger)
            && range[0] >= 0 && range[1] > range[0] && range[1] <= attempt.answers[i].length) attempt.evidence[key] = range;
        }));
        if (!task.minutes && (attempt.revealed || Array.isArray(old.revision))) {
          attempt.revision = task.prompts.map((_, i) => text(old.revision?.[i] ?? attempt.answers[i]));
        }
        if (task.kind === 'telc') {
          attempt.review = normalizeWritingReview(old.review);
          attempt.secondReview = attempt.review ? normalizeWritingReview(old.secondReview) : null;
        }
      }
    }
    saved[id] = attempt;
  }
  return saved;
}

export function nextReadinessTask(course, state) {
  const attempts = state.writingCourse;
  return course.readiness.find(task => attempts[task.id]?.started && !attempts[task.id].submitted)
    ?? course.readiness.find(task => !attempts[task.id]);
}

export function readinessProgress(course, state) {
  const attempts = course.readiness.filter(task => state.writingCourse[task.id]?.submitted)
    .sort((a, b) => state.writingCourse[a.id].started - state.writingCourse[b.id].started);
  let run = [];
  let achieved = false;
  for (const task of attempts) {
    const attempt = state.writingCourse[task.id];
    const result = writingScore(attempt.review);
    const confirmed = writingScore(attempt.secondReview);
    if (result !== 45 || (confirmed !== null && confirmed !== 45) || !attempt.answers[0].trim()) {
      run = [];
      continue;
    }
    if (run.at(-1)?.day === attempt.day) run = [];
    run.push({ day: attempt.day, register: task.register, topic: task.topic, confirmed: confirmed === 45 });
    const lastThree = run.slice(-3);
    achieved ||= lastThree.length === 3 && new Set(lastThree.map(item => item.register)).size === 2
      && new Set(lastThree.map(item => item.topic)).size === 3 && lastThree.some(item => item.confirmed);
  }
  return { attempts, streak: run.length, achieved };
}

export function frequentWritingErrors(state) {
  const counts = Object.fromEntries(errorTags.map(tag => [tag, 0]));
  for (const attempt of Object.values(state.writingCourse)) {
    for (const tag of attempt.review?.tags ?? []) counts[tag]++;
  }
  return errorTags.filter(tag => counts[tag]).sort((a, b) => counts[b] - counts[a]).slice(0, 3);
}

export function courseProgress(course, state) {
  const tasks = course?.chapters.flatMap(chapter => chapter.tasks) ?? [];
  const done = tasks.filter(task => taskFinished(state.writingCourse?.[task.id])).length;
  return { done, total: tasks.length };
}
