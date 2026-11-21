import { inFilter } from '../content.js';
import { dueIds } from './srs.js';
import { nextLesson } from './progress.js';

const NEW_CARDS = 2;
export const DAILY_SIZE = 8;
export const cardQuestionId = id => `card-${id}`;
export const isGuidedRun = run => run.kind === 'lesson-practice' || run.kind === 'lesson-cards';

export function cardQueue(ctx, state, day, filter, lessonId) {
  const seen = new Set([...Object.keys(state.completed), ...Object.keys(state.viewed || {})]);
  for (const id of Object.keys(state.results)) {
    const lesson = ctx.questions.get(id)?.lesson;
    if (lesson) seen.add(lesson);
  }
  const due = [];
  const fresh = [];
  for (const card of ctx.cards.values()) {
    if (lessonId ? card.lesson !== lessonId : !inFilter(ctx.lessons.get(card.lesson), filter)) continue;
    const record = state.cards[card.id];
    if (record?.due <= day) due.push(card);
    if (!record && (lessonId || seen.has(card.lesson))) fresh.push(card);
  }
  due.sort((a, b) => state.cards[a.id].due.localeCompare(state.cards[b.id].due));
  return { due, fresh };
}

export function dailyReview(ctx, state, day, filter = state.settings.levelFilter) {
  const cards = cardQueue(ctx, state, day, filter);
  const transfers = [...ctx.transferQuestions.values()].filter(q => state.transfer?.[q.lesson]?.due <= day
    && inFilter(ctx.lessons.get(q.lesson), filter));
  const questions = dueIds(ctx, state, day, filter);
  const queues = [transfers.map(q => q.id), questions, cards.due.map(card => cardQuestionId(card.id))];
  const ids = [];
  for (let index = 0; ids.length < DAILY_SIZE && queues.some(queue => queue[index]); index++) {
    for (const queue of queues) {
      if (queue[index] && ids.length < DAILY_SIZE) ids.push(queue[index]);
    }
  }
  return {
    ids: ids.concat(cards.fresh.slice(0, Math.min(NEW_CARDS, DAILY_SIZE - ids.length)).map(card => cardQuestionId(card.id))),
    questions: questions.length, cards: cards.due.length, fresh: cards.fresh.length, transfers: transfers.length
  };
}

export function resumableRun(state, now = Date.now()) {
  return [state.runs[state.lastRun], ...Object.values(state.runs).reverse()]
    .find(run => run && !isGuidedRun(run) && !run.finished && (run.mode !== 'test' || run.deadline > now));
}

export function recommendedLesson(ctx, state) {
  const last = ctx.lessons.get(state.lastLesson);
  return last && !state.completed[last.id] && inFilter(last, state.settings.levelFilter) ? last : nextLesson(ctx, state);
}
