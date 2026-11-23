import { getLang, num, t } from '../i18n/index.js';
import { esc } from './html.js';
import { lastReadingResult } from '../engine/model-exams.js';
import { overall } from '../engine/progress.js';
import { writingScore } from '../engine/writing.js';
import { listeningAssessment } from '../engine/listening.js';

const vocabulary = {
  de: { title: 'Dein Fertigkeitsprofil', caption: 'Ergebnisse aus bewerteten Aufgaben', reading: 'Lesen', listening: 'Hören',
    empty: 'Noch keine Bewertung', questions: ['Aufgabe', 'Aufgaben'], writing: ['bewerteter Text', 'bewertete Texte'], listeningSample: ['Frage aus der Hörprobe', 'Fragen aus der Hörprobe'], listeningCheck: ['Hörcheck-Aufgabe', 'Hörcheck-Aufgaben'] },
  ar: { title: 'مستواك في المهارات', caption: 'نتائج المهام التي تم تقييمها', reading: 'القراءة', listening: 'الاستماع',
    empty: 'لم يُقيّم بعد', questions: ['مهمة', 'مهام'], writing: ['نص مقيّم', 'نصوص مقيّمة'], listeningSample: ['سؤال من نموذج الاستماع', 'أسئلة من نموذج الاستماع'], listeningCheck: ['مهمة في اختبار الاستماع', 'مهام في اختبار الاستماع'] }
};
const xy = (index, radius) => {
  const angle = -Math.PI / 2 + Math.PI / 2 * index;
  return [120 + Math.cos(angle) * radius, 117 + Math.sin(angle) * radius];
};
const points = coords => coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
const percent = (correct, total) => total ? Math.round(correct * 100 / total) : null;

export function skillResults(ctx, state) {
  let readingTotal = 0;
  let readingRight = 0;
  for (const exam of ctx.modelTests.values()) {
    for (const section of exam.sections) {
      const result = lastReadingResult(section, state.modelExams[exam.id]?.[section.id]);
      if (!result) continue;
      const { total, correct } = result;
      readingTotal += total;
      readingRight += correct;
    }
  }
  const grammar = overall(ctx, state);
  const writing = Object.values(state.writingCourse ?? {}).flatMap(attempt => {
    const score = writingScore(attempt.secondReview ?? attempt.review);
    return score === null ? [] : [score];
  });
  const writingTotal = writing.reduce((sum, score) => sum + score, 0);
  const training = listeningAssessment(ctx, state);
  const listening = training.total ? training : state.listeningSample;
  return [
    { value: percent(readingRight, readingTotal), count: readingTotal },
    { value: percent(grammar.correct, grammar.attempted), count: grammar.attempted },
    { value: percent(writingTotal, writing.length * 45), count: writing.length },
    { value: percent(listening?.correct, listening?.total), count: listening?.total ?? 0 }
  ];
}

export function skillsRadar(ctx, state) {
  const copy = vocabulary[getLang()];
  const labels = [copy.reading, t('courseGrammar'), t('navWriting'), copy.listening];
  const destinations = ['model-exams', 'grammatik', 'schreiben/bereit', 'hoeren'];
  const captions = [copy.questions, copy.questions, copy.writing, listeningAssessment(ctx, state).total ? copy.listeningCheck : copy.listeningSample];
  const axes = skillResults(ctx, state);
  const radius = 75;
  const measured = axes.map((axis, i) => axis.value === null ? null : xy(i, radius * axis.value / 100));
  const links = measured.map((coord, i) => coord && measured[(i + 1) % 4] ? `<polyline class="skills-radar-line" points="${points([coord, measured[(i + 1) % 4]])}"/>` : '').join('');
  const tick = (i, size) => xy(i, size).map(value => value.toFixed(2));
  return `<section class="panel skills-radar" aria-labelledby="skills-radar-title">
    <h2 id="skills-radar-title">${esc(copy.title)}</h2><p>${esc(copy.caption)}</p>
    <svg viewBox="0 0 240 234" aria-hidden="true" focusable="false">
      ${[.25, .5, .75, 1].map(ring => `<polygon class="skills-radar-grid" points="${points(axes.map((_, i) => xy(i, radius * ring)))}"/>`).join('')}
      ${axes.map((_, i) => {
        const [x, y] = tick(i, radius);
        return `<line class="skills-radar-grid" x1="120" y1="117" x2="${x}" y2="${y}"/>`;
      }).join('')}
      ${measured.every(Boolean) ? `<polygon class="skills-radar-fill" points="${points(measured)}"/>` : ''}
      ${links}
      ${axes.map((axis, i) => {
        const [x, y] = measured[i] ?? xy(i, radius);
        const [labelX, labelY] = xy(i, 94);
        const side = i % 2 !== 0;
        return `<circle class="skills-radar-dot ${axis.value === null ? 'missing' : ''}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4"/>
          <text class="skills-radar-label" x="${i === 1 ? 203 : i === 3 ? 37 : labelX.toFixed(2)}" y="${labelY.toFixed(2)}" dy="${side ? '-.95em' : '.32em'}" text-anchor="middle">${esc(labels[i])}</text>`;
      }).join('')}
    </svg>
    <ul>${axes.map(({ value, count }, i) => `<li><a href="#${destinations[i]}">${esc(labels[i])}</a>
      <span>${value === null ? esc(copy.empty) : `<strong>${num(value)} %</strong> <small>· ${num(count)} ${esc(captions[i][count === 1 ? 0 : 1])}</small>`}</span></li>`).join('')}</ul>
  </section>`;
}
