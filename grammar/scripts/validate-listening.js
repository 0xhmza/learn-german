export function validateListening(course, timings, { minimumTasks = 4, minimumLines = 2 } = {}) {
  const failures = [];
  const fail = (id, reason) => failures.push(`Hören B1 ${id}: ${reason}`);
  const filled = text => typeof text === 'string' && Boolean(text.trim());
  const translated = value => filled(value?.de) && filled(value?.ar);
  const validId = id => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
  if (!Array.isArray(course?.chapters) || !Array.isArray(course.assessment)) return ['Hören B1 needs chapters and assessment recordings.'];
  const ids = new Set(['check', 'serien', 'folgen']);
  const recordings = new Set();
  function add(id) {
    if (!validId(id) || ids.has(id)) fail(id, 'invalid or duplicate route');
    ids.add(id);
  }
  const validateScene = (scene, assessment) => {
    add(scene.id);
    recordings.add(scene.id);
    if (!translated(scene.title)) fail(scene.id, 'needs German and Arabic titles');
    if (!Array.isArray(scene.lines) || scene.lines.length < minimumLines || scene.lines.some(line => !filled(line.text) || !filled(line.voice))) {
      fail(scene.id, 'needs spoken lines');
      return;
    }
    const segments = timings?.[scene.id];
    if (!Array.isArray(segments) || segments.length !== scene.lines.length || segments.some((segment, i) => {
      return !Array.isArray(segment) || segment.length !== 2 || !segment.every(Number.isFinite) ||
        segment[0] < (i ? segments[i - 1]?.[1] : 0) || segment[1] <= segment[0];
    })) fail(scene.id, 'needs one ordered audio range per line');
    if (!Array.isArray(scene.tasks) || scene.tasks.length < minimumTasks) { fail(scene.id, `needs at least ${minimumTasks} exercises`); return; }
    for (const task of scene.tasks) {
      if (!filled(task.note)) fail(scene.id, 'exercise is missing feedback');
      if (['gist', 'detail', 'contrast'].includes(task.kind)) {
        if (!filled(task.prompt) || !Array.isArray(task.options) || task.options.length !== 3 ||
          !task.options.every(filled) || new Set(task.options).size !== 3 || ![0, 1, 2].includes(task.answer)) fail(scene.id, 'invalid choice exercise');
        if (task.kind === 'contrast' && scene.lines[task.segment]?.text !== task.options?.[task.answer]) fail(scene.id, 'contrast answer must match the audio');
      } else if (['gap', 'dictation'].includes(task.kind)) {
        const line = scene.lines[task.segment]?.text;
        if (!Number.isInteger(task.segment) || !line || !filled(task.answer) || !line.includes(task.answer) ||
          (task.kind === 'dictation' && line !== task.answer) || (assessment && task.kind === 'dictation')) {
          fail(scene.id, 'the answer must match the referenced recording');
        }
      } else fail(scene.id, 'unknown exercise kind');
    }
  };
  for (const chapter of course.chapters) {
    add(chapter.id);
    if (!translated(chapter.title) || !translated(chapter.description) || !Array.isArray(chapter.scenes) || chapter.scenes.length < 2) {
      fail(chapter.id, 'needs bilingual copy and a set of recordings');
      continue;
    }
    chapter.scenes.forEach(scene => validateScene(scene, false));
  }
  for (const scene of course.assessment) validateScene(scene, true);
  for (const id of Object.keys(timings ?? {})) if (!recordings.has(id)) fail(id, 'orphaned recording');
  return failures;
}
