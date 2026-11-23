import { criteria, errorTags, isClosedWriting } from '../src/js/engine/writing.js';

export function validateWriting(course) {
  const errors = [];
  const fail = message => errors.push(`Schreiben B1: ${message}`);
  const nonempty = value => typeof value === 'string' && Boolean(value.trim());
  const localized = value => nonempty(value?.de) && nonempty(value?.ar);
  const textList = list => Array.isArray(list) && list.every(nonempty);
  const unique = list => Array.isArray(list) && new Set(list).size === list.length;
  const ids = new Set(['bereit']);
  const checkId = id => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id ?? '') || ids.has(id)) fail(`missing or duplicate ID ${id}`);
    ids.add(id);
  };
  if (!Array.isArray(course?.chapters) || !Array.isArray(course?.readiness)) {
    fail('needs chapters and a reserved assessment bank');
    return errors;
  }
  const checkTask = (task, heldOut) => {
    checkId(task.id);
    const name = task.id;
    if (!localized(task.title)) fail(`${name} needs German and Arabic titles`);
    if (Boolean(task.heldOut) !== heldOut || (heldOut && task.kind !== 'telc')) fail(`${name} has the wrong assessment visibility`);
    if (isClosedWriting(task)) {
      if (!textList(task.options) || task.options.length < 2 || !unique(task.options)
        || !nonempty(task.question) || !localized(task.feedback) || !errorTags.includes(task.skill)) {
        fail(`${name} needs a prompt, distinct options, feedback and a skill`);
      }
      const choices = task.kind === 'choice' ? [task.answer] : task.answer;
      if (!unique(choices) || choices.length !== (task.kind === 'choice' ? 1 : task.options?.length)
        || !choices.every(i => Number.isInteger(i) && i >= 0 && i < task.options?.length)) fail(`${name} has an invalid answer key`);
      return;
    }
    const kinds = { write: { count: 1 }, telc: { count: 1, minutes: 30 }, goethe: { count: 3, minutes: 60 } };
    const format = kinds[task.kind];
    if (!format || task.minutes !== format.minutes || !Array.isArray(task.prompts) || task.prompts.length !== format.count) {
      fail(`${name} has an invalid writing format`);
      return;
    }
    if (task.kind === 'telc' && (!['personal', 'semi-formal'].includes(task.register) || !nonempty(task.topic))) fail(`${name} needs a register and topic`);
    for (const prompt of task.prompts) {
      if (!nonempty(prompt.instruction) || !nonempty(prompt.model) || !textList(prompt.points) || !prompt.points.length
        || !textList(prompt.modelPoints) || prompt.modelPoints.length !== prompt.points.length
        || !prompt.modelPoints.every(quote => prompt.model.includes(quote))) fail(`${name} needs an answer and a matching excerpt for each point`);
      if (!Array.isArray(prompt.explain) || !prompt.explain.length
        || !prompt.explain.every(note => criteria.includes(note.criterion) && localized(note.text))) fail(`${name} needs bilingual model annotations`);
      if (task.kind === 'telc' && (!nonempty(prompt.message) || prompt.points?.length !== 4)) fail(`${name} needs an incoming email and four points`);
      if (prompt.expected !== undefined && (!Number.isInteger(prompt.expected) || prompt.expected < 1)) fail(`${name} has an invalid word guidance value`);
      if (prompt.alternatives !== undefined && !textList(prompt.alternatives)) fail(`${name} has invalid alternative phrases`);
    }
  };
  if (course.chapters.length !== 8) fail('needs eight chapters');
  for (const chapter of course.chapters) {
    checkId(chapter.id);
    if (![chapter.title, chapter.description, chapter.tip].every(localized) || !textList(chapter.phrases)
      || !Array.isArray(chapter.tasks) || chapter.tasks.length < 2) {
      fail(`${chapter.id} needs bilingual coaching and at least two tasks`);
      continue;
    }
    chapter.tasks.forEach(task => checkTask(task, false));
  }
  if (course.readiness.length < 9 || !unique(course.readiness.map(task => task.topic))
    || ['personal', 'semi-formal'].some(register => course.readiness.filter(task => task.register === register).length < 4)) {
    fail('needs at least nine reserve prompts with different topics and both registers');
  }
  course.readiness.forEach(task => checkTask(task, true));
  return errors;
}
