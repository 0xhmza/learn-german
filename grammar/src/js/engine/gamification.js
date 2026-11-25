// XP, ranks, daily goal, streak, stars, island conquest and badges.
// Every function works on a plain state object; nothing here touches the
// page or the storage.
import { addDays } from '../dates.js';
import { lessonStars, runStars, nextLesson, record } from './progress.js';
import { passMark } from './runs.js';
import { schedule } from './srs.js';

export const RANKS = [
  { xp: 0, de: 'Neu an Bord', ar: 'مُبحر جديد' },
  { xp: 150, de: 'Matrose·in', ar: 'بحّار' },
  { xp: 400, de: 'Am Steuer', ar: 'على الدفّة' },
  { xp: 800, de: 'Navigator·in', ar: 'ملّاح' },
  { xp: 1400, de: 'Entdecker·in', ar: 'مستكشف' },
  { xp: 2200, de: 'Kartograf·in', ar: 'رسّام خرائط' },
  { xp: 3200, de: 'Kapitän·in', ar: 'قبطان' },
  { xp: 4500, de: 'Inselmeister·in', ar: 'سيّد الجزر' },
  { xp: 6000, de: 'Grammatik-Legende', ar: 'أسطورة القواعد' }
];

export const QUESTION_XP = { 1: 5, 2: 8, 3: 12 };
export const XP = {
  lesson: 20, repeat: 1, review: 3, run: 10, perfectRun: 15,
  examFirst: 100, examAgain: 20, test: 15, testAce: 15, goal: 10
};
export const DAILY_GOALS = [15, 30, 60];
const KEEP_DAYS = 400;

export function levelFor(xp) {
  let index = 0;
  while (index + 1 < RANKS.length && RANKS[index + 1].xp <= xp) index++;
  const from = RANKS[index].xp;
  const to = RANKS[index + 1]?.xp ?? null;
  return { level: index + 1, rank: RANKS[index], from, to, progress: to === null ? 1 : (xp - from) / (to - from) };
}

export function updateStreak(state, day) {
  const streak = state.streak;
  if (streak.lastGoalDay === day) return;
  streak.current = streak.lastGoalDay === addDays(day, -1) ? streak.current + 1 : 1;
  streak.lastGoalDay = day;
  streak.best = Math.max(streak.best, streak.current);
}

// The streak shown to the learner: it is broken once a whole day passed
// without reaching the goal, even before the state is rewritten.
export function displayStreak(state, day) {
  const last = state.streak.lastGoalDay;
  return last === day || last === addDays(day, -1) ? state.streak.current : 0;
}

function gain(state, amount, day, notes, countsForGoal = true) {
  if (amount <= 0) return;
  const before = levelFor(state.xp.total).level;
  state.xp.total += amount;
  notes.push({ type: 'xp', amount });
  if (countsForGoal) {
    state.xp.byDay[day] = (state.xp.byDay[day] || 0) + amount;
    const days = Object.keys(state.xp.byDay);
    if (days.length > KEEP_DAYS) days.sort().slice(0, days.length - KEEP_DAYS).forEach(old => delete state.xp.byDay[old]);
    if (state.xp.byDay[day] >= state.settings.dailyGoal && state.xp.goalBonusDay !== day) {
      state.xp.goalBonusDay = day;
      updateStreak(state, day);
      state.xp.total += XP.goal;
      notes.push({ type: 'goal', amount: XP.goal });
    }
  }
  const after = levelFor(state.xp.total).level;
  if (after > before) notes.push({ type: 'levelUp', level: after });
}

function learn(ctx, state, id, day, notes) {
  if (state.completed[id]) return;
  state.completed[id] = day;
  state.stars[id] = Math.max(state.stars[id] || 0, 1);
  notes.push({ type: 'learned', lesson: id });
  gain(state, XP.lesson, day, notes);
  state.player.from = id;
  state.player.at = nextLesson(ctx, state)?.id ?? null;
  state.player.animate = true;
}

function raiseStars(state, id, stars, notes) {
  if (stars > lessonStars(state, id)) {
    state.stars[id] = stars;
    notes.push({ type: 'stars', lesson: id, stars });
  }
}

export function checkBadges(ctx, state) {
  const lessons = [...ctx.lessons.values()];
  const conquered = ctx.islands.filter(island => state.islands[island.id]?.conquered).length;
  const levelDone = level => {
    const own = lessons.filter(lesson => lesson.level === level);
    return own.length > 0 && own.every(lesson => state.completed[lesson.id]);
  };
  const rules = {
    'first-step': () => Object.keys(state.completed).length >= 1,
    'bullseye': () => Object.values(state.stars).some(stars => stars >= 3),
    'streak-3': () => state.streak.best >= 3,
    'streak-7': () => state.streak.best >= 7,
    'streak-30': () => state.streak.best >= 30,
    'land-ho': () => conquered >= 1,
    'half-chart': () => conquered >= 5,
    'all-islands': () => conquered >= ctx.islands.length,
    'b11': () => levelDone('B1.1'),
    'b12': () => levelDone('B1.2'),
    'flawless-exam': () => state.stats.flawlessExams >= 1,
    'mistake-hunter': () => state.stats.mistakesCleared >= 20,
    'reviewer': () => state.stats.reviewsDone >= 50,
    'timed-ace': () => state.stats.timedAce >= 1,
    'xp-1000': () => state.xp.total >= 1000,
    'xp-5000': () => state.xp.total >= 5000
  };
  return ctx.badges.map(badge => badge.id).filter(id => !state.badges[id] && rules[id]?.());
}

// Applies one learning event and returns notes for toasts:
// xp, goal, levelUp, learned, stars, conquered, badge.
export function award(ctx, state, event, day) {
  const notes = [];
  if (event.kind === 'lessonLearned') {
    (state.viewed ||= {})[event.lesson] ||= day;
    learn(ctx, state, event.lesson, day, notes);
  } else if (event.kind === 'answer') {
    const { q, correct, hinted = false, review = false } = event;
    if (q.card) {
      state.cards[q.card] = schedule(state.cards[q.card] || {}, correct, day);
      state.stats.reviewsDone += Number(review);
      return notes;
    }
    if (q.transfer) {
      state.transfer[q.lesson] = { last: day, correct, hinted, ...(correct && !hinted ? {} : { due: addDays(day, 7) }) };
      return notes;
    }
    if (ctx.transferQuestions.has(q.lesson)) state.transfer[q.lesson] ||= { due: addDays(day, 7) };
    const { result } = record(state, q, correct, day);
    result.hinted = hinted;
    result.self = q.type === 'text';
    if (review) state.stats.reviewsDone += 1;
    if (correct) {
      if (!result.xpDone) {
        const base = QUESTION_XP[q.difficulty] || QUESTION_XP[1];
        result.xpDone = true;
        result.xpDay = day;
        gain(state, hinted ? Math.floor(base / 2) : base, day, notes);
      } else if (result.xpDay !== day) {
        result.xpDay = day;
        gain(state, review ? XP.review : XP.repeat, day, notes);
      }
    }
  } else if (event.kind === 'lessonRun') {
    const { lesson, correct, total } = event;
    const bonus = state.lessonBonus[lesson] ||= {};
    if (bonus.runDay !== day) {
      bonus.runDay = day;
      gain(state, XP.run, day, notes);
    }
    if (total > 0 && correct === total && !bonus.perfect) {
      bonus.perfect = true;
      gain(state, XP.perfectRun, day, notes);
    }
    const stars = runStars(correct, total);
    if (stars >= 2) {
      learn(ctx, state, lesson, day, notes);
      raiseStars(state, lesson, stars, notes);
    }
  } else if (event.kind === 'exam') {
    const { island, correct, total } = event;
    const recordOf = state.islands[island] ||= { conquered: null, examBest: 0, examTries: 0 };
    recordOf.examTries += 1;
    recordOf.examBest = Math.max(recordOf.examBest, correct);
    if (correct >= passMark(total)) {
      const first = !recordOf.conquered;
      if (first) {
        recordOf.conquered = day;
        notes.push({ type: 'conquered', island });
      }
      if (correct === total) state.stats.flawlessExams += 1;
      gain(state, first ? XP.examFirst : XP.examAgain, day, notes);
    }
  } else if (event.kind === 'listen' || event.kind === 'flash') {
    // Hörtraining drills and flashcards: a few points per item, capped per event.
    gain(state, Math.min(20, Math.max(0, Math.floor(event.xp) || 0)), day, notes);
  } else if (event.kind === 'test') {
    const { correct, total } = event;
    const ace = total > 0 && correct / total >= 0.9;
    if (ace) state.stats.timedAce += 1;
    if (state.xp.testDay !== day) {
      state.xp.testDay = day;
      gain(state, XP.test + (ace ? XP.testAce : 0), day, notes);
    }
  }
  for (const id of checkBadges(ctx, state)) {
    state.badges[id] = day;
    notes.push({ type: 'badge', id });
  }
  return notes;
}
