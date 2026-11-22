// Learn tab (dashboard): progress in grammar, vocabulary, writing and exams
// for the current level, with the current level, streak, daily goal and
// rank beside it. Each card opens the area's own page with the details.
import { t, num } from '../i18n/index.js';
import { currentLevel, levelHasContent, grammarProgress, writingProgress, testsProgress, vocabProgress } from '../engine/areas.js';
import { streakCard, goalCard, rankCard, levelCard, progressCard } from '../components/widgets.js';
import { icons } from '../components/icons.js';
import { esc } from '../components/html.js';

export const title = () => t('tabHome');

const percentOf = ({ done, total }) => Math.round((done / Math.max(1, total)) * 100);

export function render(app) {
  const { ctx, state } = app;
  const day = app.day();
  const level = currentLevel(state);
  const ready = levelHasContent(level);
  const grammar = grammarProgress(ctx, state);
  const writing = writingProgress(ctx, state);
  const tests = testsProgress(ctx, state);
  const vocab = vocabProgress(state);
  const soon = { detail: t('comingSoon'), value: '–', percent: 0, soon: true };
  const cards = [
    progressCard({ area: 'grammar', href: 'grammatik', icon: icons.learn, title: t('courseGrammar'),
      ...(ready ? { detail: t('grammarDone', num(grammar.done), num(grammar.total)), value: `${num(percentOf(grammar))} %`, percent: percentOf(grammar) } : soon) }),
    progressCard({ area: 'vocab', href: 'vokabeln', icon: icons.vocab, title: t('navVocab'),
      detail: t('wordsSaved'), value: num(vocab.words) }),
    progressCard({ area: 'writing', href: 'schreiben', icon: icons.writing, title: t('navWriting'),
      ...(ready ? { detail: t('writingDone', num(writing.done), num(writing.total)), value: `${num(percentOf(writing))} %`, percent: percentOf(writing) } : soon) }),
    progressCard({ area: 'tests', href: 'model-exams', icon: icons.exam, title: t('areaTests'),
      ...(ready ? { detail: t('testsDone', num(tests.done), num(tests.total)), value: `${num(percentOf(tests))} %`, percent: percentOf(tests) } : soon) })
  ];
  return `<div class="dash">
    <section class="dash-main" aria-labelledby="dash-title">
      <h1 id="dash-title">${t('dashProgress')}</h1>
      <p class="dash-sub">${esc(t('levelTitle', level))} · ${esc(t('levelNames')[level])}</p>
      <div class="progress-cards">${cards.join('')}</div>
    </section>
    <aside class="dash-side" aria-label="${esc(t('studyTools'))}">
      ${levelCard(state)}
      ${streakCard(state, day)}
      ${goalCard(state, day)}
      ${rankCard(state)}
    </aside>
  </div>`;
}
