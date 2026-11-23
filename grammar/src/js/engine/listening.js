const MAX_ANSWER = 350;
export const MAX_PLAYS = 2;

const numbers = new Map('zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn neunzehn zwanzig'.split(' ').map((word, i) => [word, String(i + 2)]));
const words = value => value.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const folded = value => words(value).map(word => (numbers.get(word) ?? word)
  .replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss')).join(' ');

export function checkListening(task, answer) {
  if (task.options) return { correct: String(task.answer) === answer, spelling: true };
  const spelling = words(answer).join(' ') === words(task.answer).join(' ');
  return { correct: spelling || folded(answer) === folded(task.answer), spelling };
}

export const makeListeningRun = scene => ({ answers: scene.tasks.map(() => ''), plays: 0, submitted: false });
export const scoreListening = (scene, run) => ({
  total: scene.tasks.length,
  correct: scene.tasks.filter((task, i) => checkListening(task, run.answers[i]).correct).length
});

export function normalizeListening(raw, scenes) {
  const runs = {};
  for (const [id, scene] of scenes ?? []) {
    const saved = raw?.runs?.[id];
    if (!Array.isArray(saved?.answers)) continue;
    const answers = scene.tasks.map((task, i) => {
      const value = saved.answers[i];
      if (typeof value !== 'string') return '';
      if (task.options) return ['0', '1', '2'].includes(value) ? value : '';
      return value.slice(0, MAX_ANSWER);
    });
    const plays = Number.isInteger(saved.plays) ? Math.max(0, Math.min(MAX_PLAYS, saved.plays)) : 0;
    runs[id] = { answers, plays, submitted: Boolean(saved.submitted === true && answers.every(answer => answer.trim()) && (!scene.assessment || plays)) };
  }
  const clips = {};
  for (const [id, status] of Object.entries(raw?.clips ?? {}).slice(-12000)) {
    if (/^(simpsons|spongebob)\.s\d{2}e\d{2}-[a-z\d]+-\d+$/.test(id) && ['done', 'skipped'].includes(status)) clips[id] = status;
  }
  return { runs, clips };
}

export function listeningAssessment(ctx, state) {
  const score = { correct: 0, total: 0 };
  for (const scene of ctx.listeningAssessment ?? []) {
    const run = state.listening?.runs[scene.id];
    if (!run?.submitted) continue;
    const result = scoreListening(scene, run);
    score.correct += result.correct;
    score.total += result.total;
  }
  return score;
}

export const listeningDraft = (scene, run) => Boolean(run && !run.submitted && (run.plays || scene.tasks.some((_, i) => run.answers[i]?.trim())));
