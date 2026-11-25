// State defaults, sanitizing of saved data, backups and the one-time
// import of progress from the original B1.1 file.
import { isDay } from '../dates.js';
import { nextLesson, runStars } from './progress.js';
import { checkBadges, QUESTION_XP, XP, DAILY_GOALS } from './gamification.js';
import { isRunValid } from './runs.js';
import { examChoices, isListening, isMatching, lastReadingResult } from './model-exams.js';
import { normalizeWords } from './words.js';
import { normalizeLast, LEVELS } from './areas.js';
import { normalizeWriting } from './writing.js';
import { normalizeListening } from './listening.js';
import { defaultTrainer, normalizeTrainer } from './listening-trainer.js';

export const STATE_VERSION = 1;
export const APP_ID = 'grammatikinseln';
export const LEGACY_KEYS = { state: 'deutsch-b11-ar-2026-1', lang: 'deutsch-b11-lang', theme: 'deutsch-b11-theme' };

export function defaultState(day) {
  return {
    v: STATE_VERSION,
    createdAt: day,
    settings: { level: 'B1', levelFilter: 'all', dailyGoal: 30, reduceMotion: false, roadmap: 'islands', hideCompleted: false },
    completed: {},
    started: {},
    viewed: {},
    lessonSlides: {},
    transfer: {},
    stars: {},
    lessonBonus: {},
    results: {},
    runs: {},
    cards: {},
    sprach: {},
    modelExams: {},
    writingCourse: {},
    listeningSample: null,
    listening: { runs: {}, clips: {} },
    listenTrainer: defaultTrainer(),
    words: {},
    last: {},
    lastRun: null,
    lastLesson: null,
    islands: {},
    xp: { total: 0, byDay: {}, goalBonusDay: null, testDay: null },
    streak: { current: 0, best: 0, lastGoalDay: null },
    badges: {},
    stats: { mistakesCleared: 0, reviewsDone: 0, flawlessExams: 0, timedAce: 0 },
    player: { at: null, from: null, animate: false }
  };
}

const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const count = value => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const dayOr = (value, fallback) => (isDay(value) ? value : fallback);

// The old recap and multiple-choice cards no longer measure the same recall.
// Keep the other items in a daily session that was saved with those cards.
function stripLegacyCards(ctx, run) {
  if (run.key !== 'daily' || !Array.isArray(run.ids)) return run;
  const obsolete = id => ctx.lessons.has(/^card-(.+)-(?:recall|apply)$/.exec(id)?.[1]);
  const ids = run.ids.filter(id => !obsolete(id));
  if (ids.length === run.ids.length) return run;
  const position = run.ids.slice(0, count(run.position)).filter(id => !obsolete(id)).length;
  const restored = { ...run, ids, position };
  for (const field of ['answers', 'grades', 'order', 'hinted']) {
    restored[field] = Object.fromEntries(Object.entries(run[field] || {}).filter(([id]) => !obsolete(id)));
  }
  return restored;
}

export function normalizeState(raw, ctx, day) {
  const state = defaultState(day);
  if (!plain(raw) || raw.v !== STATE_VERSION) {
    state.player.at = nextLesson(ctx, state)?.id ?? null;
    return state;
  }
  state.createdAt = dayOr(raw.createdAt, day);
  const settings = plain(raw.settings) ? raw.settings : {};
  if (['all', ...ctx.levels.map(level => level.id)].includes(settings.levelFilter)) state.settings.levelFilter = settings.levelFilter;
  if (DAILY_GOALS.includes(settings.dailyGoal)) state.settings.dailyGoal = settings.dailyGoal;
  state.settings.reduceMotion = settings.reduceMotion === true;
  if (settings.roadmap === 'telc') state.settings.roadmap = 'telc';
  state.settings.hideCompleted = settings.hideCompleted === true;
  state.words = normalizeWords(raw.words, isDay);
  state.last = normalizeLast(raw.last, isDay);
  state.writingCourse = normalizeWriting(raw.writingCourse, ctx.writingExercises);
  state.listening = normalizeListening(raw.listening, ctx.listeningScenes);
  state.listenTrainer = normalizeTrainer(raw.listenTrainer, ctx);
  const listeningCount = ctx.learning?.examSample?.listening?.items.length;
  const right = raw.listeningSample?.correct;
  if (listeningCount && raw.listeningSample?.total === listeningCount && Number.isInteger(right) && right >= 0 && right <= listeningCount) {
    state.listeningSample = { correct: right, total: listeningCount };
  }
  if (LEVELS.includes(settings.level)) state.settings.level = settings.level;

  for (const [id, value] of Object.entries(plain(raw.completed) ? raw.completed : {})) {
    if (ctx.lessons.has(id) && value) state.completed[id] = dayOr(value, day);
  }
  for (const [id, value] of Object.entries(plain(raw.started) ? raw.started : {})) {
    if (ctx.lessons.has(id) && value === true) state.started[id] = true;
  }
  for (const [id, value] of Object.entries(plain(raw.viewed) ? raw.viewed : {})) {
    if (ctx.lessons.has(id) && isDay(value)) state.viewed[id] = value;
  }
  for (const [id, value] of Object.entries(plain(raw.lessonSlides) ? raw.lessonSlides : {})) {
    if (ctx.lessons.has(id) && typeof value === 'string' && /^[a-z]+(?:-\d+)?$/.test(value)) state.lessonSlides[id] = value;
  }
  for (const [id, value] of Object.entries(plain(raw.transfer) ? raw.transfer : {})) {
    if (!ctx.transferQuestions.has(id) || !plain(value)) continue;
    if (isDay(value.last)) state.transfer[id] = { last: value.last, correct: value.correct === true, hinted: value.hinted === true };
    if (isDay(value.due)) (state.transfer[id] ||= {}).due = value.due;
  }
  for (const [id, value] of Object.entries(plain(raw.stars) ? raw.stars : {})) {
    if (ctx.lessons.has(id) && [1, 2, 3].includes(value)) state.stars[id] = value;
  }
  for (const [id, value] of Object.entries(plain(raw.lessonBonus) ? raw.lessonBonus : {})) {
    if (ctx.lessons.has(id) && plain(value)) state.lessonBonus[id] = { runDay: isDay(value.runDay) ? value.runDay : undefined, perfect: value.perfect === true };
  }
  for (const [id, value] of Object.entries(plain(raw.results) ? raw.results : {})) {
    if (!ctx.questions.has(id) || !plain(value)) continue;
    state.results[id] = {
      correct: value.correct === true,
      streak: count(value.streak),
      tries: count(value.tries),
      needsReview: value.needsReview === true,
      box: Math.min(5, Math.max(1, count(value.box) || 1)),
      due: dayOr(value.due, day),
      last: dayOr(value.last, day),
      xpDone: value.xpDone === true,
      ...(value.hinted === true ? { hinted: true } : {}),
      ...(value.self === true ? { self: true } : {}),
      ...(isDay(value.xpDay) ? { xpDay: value.xpDay } : {})
    };
  }
  for (const [key, saved] of Object.entries(plain(raw.runs) ? raw.runs : {})) {
    if (!plain(saved) || saved.key !== key) continue;
    const run = stripLegacyCards(ctx, saved);
    if (isRunValid(ctx, run)) {
      state.runs[key] = { answers: {}, grades: {}, order: {}, hinted: {}, position: 0, finished: false, summary: null, ...run };
      state.runs[key].position = Math.min(count(run.position), run.ids.length - 1);
    }
  }
  if (state.runs[raw.lastRun]) state.lastRun = raw.lastRun;
  for (const [id, saved] of Object.entries(plain(raw.modelExams) ? raw.modelExams : {})) {
    const model = ctx.modelTests.get(id);
    if (!model || !plain(saved)) continue;
    const sections = {};
    for (const section of model.sections) {
      const value = saved[section.id];
      if (!plain(value)) continue;
      if (section.id === 'schreiben') {
        if (typeof value.writing === 'string') sections[section.id] = { writing: value.writing.slice(0, 30000) };
        continue;
      }
      const responses = {};
      const used = new Set();
      for (const item of section.items) {
        const choice = value.responses?.[item.number];
        if (typeof choice !== 'string' || !Object.hasOwn(examChoices(section, item), choice)) continue;
        if (isMatching(section) && choice !== 'x' && used.has(choice)) continue;
        responses[item.number] = choice;
        used.add(choice);
      }
      const checked = !isListening(section) && value.checked === true;
      const readingResult = checked ? null : lastReadingResult(section, value);
      sections[section.id] = { responses, checked, ...(readingResult && { readingResult }) };
    }
    if (Object.keys(sections).length) state.modelExams[id] = sections;
  }
  for (const [id, value] of Object.entries(plain(raw.cards) ? raw.cards : {})) {
    if (ctx.cards.has(id) && plain(value) && isDay(value.due)) {
      state.cards[id] = { due: value.due, box: Math.min(5, Math.max(1, count(value.box))) };
    }
  }
  for (const [id, value] of Object.entries(plain(raw.sprach) ? raw.sprach : {})) {
    const set = ctx.sprachbausteine.get(id);
    if (!set || !plain(value) || !Array.isArray(value.answers)) continue;
    const used = new Set();
    const answers = set.gaps.map((gap, i) => {
      const answer = value.answers[i];
      if (set.bank) {
        if (!set.bank.includes(answer) || used.has(answer)) return '';
        used.add(answer);
        return answer;
      }
      return gap.options.includes(answer) ? answer : '';
    });
    state.sprach[id] = { answers, finished: value.finished === true && answers.every(Boolean) };
  }
  if (ctx.lessons.has(raw.lastLesson)) {
    state.lastLesson = raw.lastLesson;
    state.started[raw.lastLesson] = true;
  }
  for (const [id, value] of Object.entries(plain(raw.islands) ? raw.islands : {})) {
    if (ctx.islandById.has(id) && plain(value)) {
      state.islands[id] = { conquered: isDay(value.conquered) ? value.conquered : null, examBest: count(value.examBest), examTries: count(value.examTries) };
    }
  }
  const xp = plain(raw.xp) ? raw.xp : {};
  state.xp.total = count(xp.total);
  for (const [key, value] of Object.entries(plain(xp.byDay) ? xp.byDay : {})) if (isDay(key)) state.xp.byDay[key] = count(value);
  state.xp.goalBonusDay = isDay(xp.goalBonusDay) ? xp.goalBonusDay : null;
  state.xp.testDay = isDay(xp.testDay) ? xp.testDay : null;
  const streak = plain(raw.streak) ? raw.streak : {};
  state.streak = { current: count(streak.current), best: count(streak.best), lastGoalDay: isDay(streak.lastGoalDay) ? streak.lastGoalDay : null };
  for (const [id, value] of Object.entries(plain(raw.badges) ? raw.badges : {})) {
    if (ctx.badgeById.has(id)) state.badges[id] = dayOr(value, day);
  }
  const stats = plain(raw.stats) ? raw.stats : {};
  for (const key of Object.keys(state.stats)) state.stats[key] = count(stats[key]);
  const player = plain(raw.player) ? raw.player : {};
  state.player.at = ctx.lessons.has(player.at) ? player.at : nextLesson(ctx, state)?.id ?? null;
  state.player.from = ctx.lessons.has(player.from) ? player.from : null;
  state.player.animate = player.animate === true && Boolean(state.player.from);
  return state;
}

// Shared by the automatic migration and the import of an exported results
// file: copies answer records and rebuilds stars and XP from them.
function applyLegacyResults(ctx, state, entries, day) {
  let imported = 0;
  for (const [id, value] of entries) {
    const q = ctx.questions.get(id);
    if (!q || !plain(value)) continue;
    const correct = value.correct === true;
    const streak = count(value.streak);
    const previous = state.results[id];
    state.results[id] = {
      correct,
      streak,
      tries: Math.max(count(value.tries), 1) + (previous?.tries || 0),
      needsReview: value.needsReview === true,
      box: correct ? Math.min(Math.max(streak, 1), 2) : 1,
      due: day,
      last: day,
      xpDone: correct || previous?.xpDone === true
    };
    if (correct && !previous?.xpDone) state.xp.total += QUESTION_XP[q.difficulty] || QUESTION_XP[1];
    imported++;
  }
  return imported;
}

function finishLegacyImport(ctx, state, day, inferCompleted) {
  for (const lesson of ctx.lessons.values()) {
    const results = lesson.questions.map(q => state.results[q.id]);
    const allTried = results.every(Boolean);
    if (inferCompleted && allTried) state.completed[lesson.id] ||= day;
    const stars = allTried ? runStars(results.filter(result => result.correct).length, results.length) : 0;
    if (stars >= 2) state.completed[lesson.id] ||= day;
    if (state.completed[lesson.id]) state.stars[lesson.id] = Math.max(state.stars[lesson.id] || 0, stars, 1);
  }
  state.player.at = nextLesson(ctx, state)?.id ?? null;
  state.player.from = null;
  state.player.animate = false;
}

export function migrateLegacy(legacy, ctx, day) {
  const state = defaultState(day);
  if (!plain(legacy)) return normalizeState(state, ctx, day);
  for (const [id, done] of Object.entries(plain(legacy.completed) ? legacy.completed : {})) {
    if (done === true && ctx.lessons.has(id)) {
      state.completed[id] = day;
      state.xp.total += XP.lesson;
    }
  }
  const before = new Set(Object.keys(state.completed));
  applyLegacyResults(ctx, state, Object.entries(plain(legacy.results) ? legacy.results : {}), day);
  finishLegacyImport(ctx, state, day, false);
  for (const id of Object.keys(state.completed)) if (!before.has(id)) state.xp.total += XP.lesson;
  for (const id of checkBadges(ctx, state)) state.badges[id] = day;
  if (ctx.lessons.has(legacy.lastLesson)) state.lastLesson = legacy.lastLesson;
  return state;
}

// Accepts the "Download results · JSON" file of the original page.
export function importLegacyExport(json, ctx, state, day) {
  if (!plain(json) || json.kind !== 'results' || !Array.isArray(json.items)) throw new Error('not-legacy');
  const before = new Set(Object.keys(state.completed));
  const imported = applyLegacyResults(ctx, state, json.items.filter(plain).map(item => [item.id, item]), day);
  finishLegacyImport(ctx, state, day, true);
  for (const id of Object.keys(state.completed)) if (!before.has(id)) state.xp.total += XP.lesson;
  for (const id of checkBadges(ctx, state)) state.badges[id] = day;
  return imported;
}

export function exportBackup(state, ctx, exportedAt = new Date().toISOString()) {
  return { app: APP_ID, kind: 'backup', v: STATE_VERSION, exported: exportedAt, contentVersion: ctx.version, state };
}

export function importBackup(json, ctx, day) {
  if (!plain(json) || json.app !== APP_ID || json.kind !== 'backup' || !plain(json.state)) throw new Error('not-backup');
  return normalizeState(json.state, ctx, day);
}
