// Turns the saved "last stop" of an area into a title, a line with the
// date and a button that goes straight back.
import { t, num, getLang } from '../i18n/index.js';
import { lessonTitle, islandName } from '../content.js';
import { areaOf } from '../engine/areas.js';
import { parse } from '../router.js';
import { esc, prose, link, formatDay } from './html.js';

const when = day => (day ? ` · ${t('lastOn', formatDay(day, { day: 'numeric', month: 'long' }))}` : '');

// Before stops were recorded: the first exam part or writing draft with
// saved work, shown without a date.
function earlierWork(ctx, state, area) {
  for (const model of ctx.modelTests.values()) {
    const saved = state.modelExams[model.id] || {};
    for (const section of model.sections) {
      const draft = saved[section.id];
      if (!draft) continue;
      const writing = section.id === 'schreiben';
      if (area === 'writing' && writing && draft.writing?.trim()) return { hash: `model-exams/${model.id}/schreiben`, day: null };
      if (area === 'tests' && !writing && (draft.checked || Object.keys(draft.responses || {}).length)) return { hash: `model-exams/${model.id}/${section.id}`, day: null };
    }
  }
  return null;
}

export function stopFor(app, area) {
  const { ctx, state } = app;
  const lang = getLang();
  const entry = state.last[area];
  const entryRoute = entry && parse(entry.hash, ctx);
  const saved = entryRoute && areaOf(entryRoute) === area ? entry : null;
  if (area === 'grammar') {
    const id = saved ? entryRoute.key : state.lastLesson;
    const lesson = ctx.lessons.get(id);
    if (!lesson) return null;
    const island = ctx.islandById.get(lesson.island);
    const done = Boolean(state.completed[lesson.id]);
    return {
      title: prose(lessonTitle(lesson, lang)),
      meta: `${esc(`${t('moduleN', num(island.order))} · ${islandName(island, lang)}`)}${done ? ` · ${t('lessonFinished')}` : ''}${when(saved?.day)}`,
      action: link(`lesson/${lesson.id}`, t(done ? 'lessonRepeat' : 'continueHere'), done ? 'secondary' : 'primary'),
      lesson, done
    };
  }
  const work = saved || earlierWork(ctx, state, area);
  if (!work) return null;
  const route = saved ? entryRoute : parse(work.hash, ctx);
  if (route.view === 'model-exams' && route.key) {
    const model = ctx.modelTests.get(route.key);
    const sampleTitle = { 'audio-practice': 'listeningSample', 'speaking-practice': 'speakingSample' }[route.section];
    const title = sampleTitle ? t(sampleTitle) : t('examPartTitle')[route.section];
    return {
      title: esc(title),
      meta: `${esc(`${t('examModel', num(model.number))} · ${model.title[lang]}`)}${when(work.day)}`,
      action: link(work.hash, t('continueHere'), 'primary')
    };
  }
  if (route.view === 'quiz') {
    const write = /^write-(.+)$/.exec(route.key);
    const exam = /^exam-(.+)$/.exec(route.key);
    const title = write ? t('realLifeTask') : exam ? t('examName', islandName(ctx.islandById.get(exam[1]), lang)) : t('testName');
    const meta = write ? `${prose(lessonTitle(ctx.lessons.get(write[1]), lang))}${when(work.day)}` : work.day ? t('lastOn', formatDay(work.day, { day: 'numeric', month: 'long' })) : '';
    return { title: esc(title), meta, action: link(work.hash, t('continueHere'), 'primary') };
  }
  return null;
}
