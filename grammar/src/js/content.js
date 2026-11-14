// Indexes the assembled content and resolves language-specific fields.

export function indexContent(raw) {
  const islands = [...raw.islands].sort((a, b) => a.order - b.order);
  const islandById = new Map(islands.map(island => [island.id, island]));
  const lessons = new Map();
  const questions = new Map();
  const byIsland = new Map(islands.map(island => [island.id, []]));
  for (const lesson of raw.lessons) {
    lessons.set(lesson.id, lesson);
    byIsland.get(lesson.island)?.push(lesson);
    for (const q of lesson.questions) {
      q.lesson = lesson.id;
      questions.set(q.id, q);
    }
  }
  for (const list of byIsland.values()) list.sort((a, b) => a.order - b.order);
  const route = islands.flatMap(island => byIsland.get(island.id));
  return {
    version: raw.version,
    levels: raw.levels,
    levelById: new Map(raw.levels.map(level => [level.id, level])),
    islands,
    islandById,
    badges: raw.badges,
    badgeById: new Map(raw.badges.map(badge => [badge.id, badge])),
    lessons,
    questions,
    route,
    islandLessons: id => byIsland.get(id) || []
  };
}

export const inFilter = (lesson, filter) => !filter || filter === 'all' || lesson.level === filter;

export function routeFor(ctx, filter) {
  return ctx.route.filter(lesson => inFilter(lesson, filter));
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
