// Leitner boxes: a correct answer moves a question up one box, a wrong
// answer sends it back to box 1.
import { addDays } from '../dates.js';
import { inFilter } from '../content.js';

export const INTERVALS = [0, 1, 3, 7, 14, 30];

export function schedule(result, correct, day) {
  result.box = correct ? Math.min(5, (result.box || 0) + 1) : 1;
  result.due = addDays(day, INTERVALS[result.box]);
  return result;
}

export function dueIds(ctx, state, day, filter = 'all') {
  return Object.entries(state.results)
    .filter(([id, result]) => {
      const q = ctx.questions.get(id);
      return q && result.due && result.due <= day && inFilter(ctx.lessons.get(q.lesson), filter);
    })
    .sort(([a, x], [b, y]) => x.due.localeCompare(y.due) || a.localeCompare(b))
    .map(([id]) => id);
}
