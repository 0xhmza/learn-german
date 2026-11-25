// Learn tab (dashboard): progress in grammar, vocabulary, writing and exams
// for the current level, with the level picker and streak beside it.
import { t, num } from '../i18n/index.js';
import { currentLevel, levelHasContent, grammarProgress, writingProgress, testsProgress, vocabProgress } from '../engine/areas.js';
import { courseProgress as writingCourseProgress } from '../engine/writing.js';
import { profile } from '../engine/listening-trainer.js';
import { streakCard, levelCard, progressCard } from '../components/widgets.js';
import { icons } from '../components/icons.js';
import { skillsRadar } from '../components/skills-radar.js';

export const title = () => t('tabHome');

// Hören: the estimated listening level from the Hörtraining dictations.
function listeningCard(ctx, state, day) {
  const info = profile(ctx, state.listenTrainer, currentLevel(state), day);
  const detail = !state.listenTrainer.placed && !info.dictations ? t('lisCardStart')
    : info.due ? t('lisCardDue', num(info.due)) : t('lisCardMinutes', num(info.minutes));
  return progressCard({ area: 'listen', href: 'hoeren', icon: icons.listen, title: t('navListening'), detail,
    ...(info.measured ? { value: info.level } : {}) });
}

export function render(app) {
  const { ctx, state } = app;
  const ready = levelHasContent(currentLevel(state));
  const courseProgress = (measure, label) => {
    if (!ready) return { detail: t('comingSoon') };
    const { done, total } = measure(ctx, state);
    const percent = Math.round(done / Math.max(1, total) * 100);
    return { detail: t(label, num(done), num(total)), value: `${num(percent)} %`, percent };
  };
  const cards = [
    progressCard({ area: 'grammar', href: 'grammatik', icon: icons.learn, title: t('courseGrammar'),
      ...courseProgress(grammarProgress, 'grammarDone') }),
    progressCard({ area: 'vocab', href: 'vokabeln', icon: icons.vocab, title: t('navVocab'),
      detail: t('wordsSaved'), value: num(vocabProgress(state).words) }),
    listeningCard(ctx, state, app.day()),
    progressCard({ area: 'writing', href: 'schreiben', icon: icons.writing, title: t('navWriting'),
      ...courseProgress(ctx.writingCourse ? () => writingCourseProgress(ctx.writingCourse, state) : writingProgress, 'writingDone') }),
    progressCard({ area: 'tests', href: 'model-exams', icon: icons.exam, title: t('areaTests'),
      ...courseProgress(testsProgress, 'testsDone') })
  ];
  return `<div class="dash">
    <section class="dash-main" aria-labelledby="dash-title">
      <h1 id="dash-title">${t('dashProgress')}</h1>
      <div class="progress-cards">${cards.join('')}</div>
      ${ready ? skillsRadar(ctx, state) : ''}
    </section>
    <aside class="dash-side">
      ${levelCard(state)}
      ${streakCard(state, app.day())}
    </aside>
  </div>`;
}
