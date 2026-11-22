// Turns the saved "last stop" of an area into a title, a line with the
// date and a button that goes straight back.
import { t, num, getLang } from '../i18n/index.js';
import { lessonTitle, islandName } from '../content.js';
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
  const saved = state.last[area] || earlierWork(ctx, state, area);
  if (area === 'grammar') {
    const id = saved ? parse(`#${saved.hash}`, ctx).key : state.lastLesson;
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
  if (!saved) return null;
  const route = parse(`#${saved.hash}`, ctx);
  if (route.view === 'model-exams' && route.key) {
    const model = ctx.modelTests.get(route.key);
    return {
      title: esc(`${t('examPartTitle')[route.section] || t('examGroupWrite')}`),
      meta: `${esc(`${t('examModel', num(model.number))} · ${model.title[lang]}`)}${when(saved.day)}`,
      action: link(saved.hash, t('continueHere'), 'primary')
    };
  }
  if (route.view === 'quiz') {
    const write = /^write-(.+)$/.exec(route.key);
    const exam = /^exam-(.+)$/.exec(route.key);
    const title = write ? t('realLifeTask') : exam ? t('examName', islandName(ctx.islandById.get(exam[1]), lang)) : t('testName');
    const meta = write ? `${prose(lessonTitle(ctx.lessons.get(write[1]), lang))}${when(saved.day)}` : saved.day ? t('lastOn', formatDay(saved.day, { day: 'numeric', month: 'long' })) : '';
    return { title: esc(title), meta, action: link(saved.hash, t('continueHere'), 'primary') };
  }
  return null;
}
