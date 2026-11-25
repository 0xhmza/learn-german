// Indexes the assembled content and resolves language-specific fields.

export function indexContent(raw) {
  const islands = [...raw.islands].sort((a, b) => a.order - b.order);
  const islandById = new Map(islands.map(island => [island.id, island]));
  const lessons = new Map();
  const questions = new Map();
  const cards = new Map();
  const decks = new Map();
  const transferQuestions = new Map();
  const lessonStudy = new Map(Object.entries(raw.lessonStudy || {}));
  const byIsland = new Map(islands.map(island => [island.id, []]));
  for (const lesson of raw.lessons) {
    lessons.set(lesson.id, lesson);
    byIsland.get(lesson.island)?.push(lesson);
    for (const q of lesson.questions) {
      q.lesson = lesson.id;
      questions.set(q.id, q);
    }
    for (const [key, [de, ar, answer]] of Object.entries(raw.flashcards?.[lesson.id] || {})) {
      const card = { id: `${lesson.id}-${key}`, lesson: lesson.id };
      const id = `card-${card.id}`;
      cards.set(card.id, card);
      if (!decks.has(lesson.id)) decks.set(lesson.id, []);
      decks.get(lesson.id).push(card);
      const shared = typeof answer === 'string' ? '`' + answer + '`' : null;
      questions.set(id, {
        id, lesson: lesson.id, card: card.id, type: 'text',
        i18n: {
          de: { prompt: de, explain: shared ?? answer.de, hints: [] },
          ar: { prompt: ar, explain: shared ?? answer.ar, hints: [] }
        }
      });
    }
    const study = lessonStudy.get(lesson.id);
    if (!study) continue;
    const id = `apply-${lesson.id}`;
    questions.set(id, {
      id, lesson: lesson.id, type: 'mcq', difficulty: 2, answer: 0,
      options: [study.correct, study.alternative],
      i18n: {
        ar: { prompt: study.task.ar, explain: study.ar, hints: [study.hint.ar] },
        de: { prompt: study.task.de, explain: study.de, hints: [study.hint.de] }
      }
    });
    const transfer = raw.learning?.pilot?.[lesson.id]?.transfer;
    if (transfer) {
      const question = { ...transfer, id: `transfer-${lesson.id}`, lesson: lesson.id, difficulty: 2, transfer: true };
      transferQuestions.set(lesson.id, question);
      questions.set(question.id, question);
    }
    const writing = raw.learning?.islands?.[lesson.island];
    if (writing?.lesson === lesson.id) {
      const id = `write-${lesson.id}`;
      questions.set(id, {
        id, lesson: lesson.id, type: 'text', difficulty: 3, answer: writing.model, writing: true,
        i18n: Object.fromEntries(['ar', 'de'].map(lang => [lang, {
          prompt: writing[lang], explain: raw.learning.outcomes[lesson.id][lang], hints: []
        }]))
      });
    }
  }
  for (const list of byIsland.values()) list.sort((a, b) => a.order - b.order);
  const route = islands.flatMap(island => byIsland.get(island.id));
  const chapters = (raw.roadmap || []).map(chapter => {
    const topics = chapter.lessons.map(id => lessons.get(id));
    return { ...chapter, lessons: topics, level: topics[0].level };
  });
  const writingCourse = raw.writingCourse;
  const writingChapters = new Map((writingCourse?.chapters || []).map(chapter => [chapter.id, chapter]));
  const writingExercises = new Map([
    ...[...writingChapters.values()].flatMap(chapter => chapter.tasks), ...(writingCourse?.readiness || [])
  ].map(task => [task.id, task]));
  const withTiming = (scene, assessment = false) => ({ ...scene, assessment, segments: raw.listeningTimings?.[scene.id] || [] });
  const listeningChapters = (raw.listeningCourse?.chapters ?? []).map(chapter => ({ ...chapter, scenes: chapter.scenes.map(scene => withTiming(scene)) }));
  const listeningAssessment = (raw.listeningCourse?.assessment ?? []).map(scene => withTiming(scene, true));
  const listeningSeries = (raw.listeningSeries?.course?.chapters ?? []).map(chapter => ({ ...chapter,
    scenes: chapter.scenes.map(scene => ({ ...scene, series: true, segments: raw.listeningSeries.timings[scene.id] })) }));
  const listeningScenes = new Map([...listeningChapters, ...listeningSeries].flatMap(chapter => chapter.scenes)
    .concat(listeningAssessment).map(scene => [scene.id, scene]));
  return {
    listeningChapters, listeningAssessment, listeningSeries, listeningScenes, listeningAudio: raw.listeningAudio,
    listeningEpisodeLibrary: raw.listeningEpisodeLibrary === true,
    writingCourse, writingChapters, writingExercises,
    version: raw.version,
    levels: raw.levels,
    levelById: new Map(raw.levels.map(level => [level.id, level])),
    islands,
    islandById,
    badges: raw.badges,
    badgeById: new Map(raw.badges.map(badge => [badge.id, badge])),
    lessons,
    questions,
    cards,
    decks,
    transferQuestions,
    learning: raw.learning || {},
    lessonStudy,
    practiceSets: new Map((raw.practiceSets || []).map(set => [set.id, set])),
    readings: new Map((raw.readings?.texts || []).map(reading => [reading.id, reading])),
    glossary: new Map(Object.entries(raw.readings?.glossary || {})),
    sprachbausteine: new Map((raw.sprachbausteine || []).map(set => [set.id, set])),
    modelTests: new Map((raw.modelTests?.models || []).map(model => [model.id, model])),
    listenTrainer: indexTrainer(raw.listenTrainer),
    route,
    chapters,
    bookRoute: chapters.flatMap(chapter => chapter.lessons),
    islandLessons: id => byIsland.get(id) || []
  };
}

// Hörtraining content: dictation clips, sound contrasts, sentence endings,
// everyday speech and longer texts.
function indexTrainer(raw = {}) {
  const trainer = { clips: [], contrasts: [], predict: [], casual: [], texts: [], rules: {}, ...raw };
  return { ...trainer, textById: new Map(trainer.texts.map(text => [text.id, text])) };
}

export const inFilter = (lesson, filter) => !filter || filter === 'all' || lesson.level === filter;

export function routeFor(ctx, filter, mode) {
  const route = mode === 'telc' && ctx.bookRoute.length ? ctx.bookRoute : ctx.route;
  return route.filter(lesson => inFilter(lesson, filter));
}

export function localize(lesson, lang) {
  const ar = lesson.i18n.ar;
  const own = lesson.i18n[lang] || ar;
  return {
    title: own.title,
    lead: own.lead,
    translation: ar.translation,
    steps: own.steps.map((step, i) => ({ ...step, example: lesson.stepExamples[i] })),
    explain: own.explain,
    pitfall: own.pitfall,
    recall: own.recall,
    links: lesson.links.map((url, i) => [own.linkTitles[i], url]),
    table: own.table || ar.table || null
  };
}

export function localizeQuestion(q, lang) {
  const own = q.i18n[lang] || q.i18n.ar;
  return {
    ...q,
    prompt: own.prompt,
    explain: own.explain,
    hints: own.hints,
    options: own.options ?? q.options,
    answer: own.answer ?? q.answer,
    text: own.text ?? q.text
  };
}

export const lessonTitle = (lesson, lang) => (lesson.i18n[lang] || lesson.i18n.ar).title;
export const islandName = (island, lang) => island.name[lang] || island.name.ar;
