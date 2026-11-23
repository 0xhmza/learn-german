import { w } from '../i18n/writing.js';
import { iso, now } from '../dates.js';
import { updateWritingMeter } from '../components/writing-meter.js';
import { checkClosedWriting, criteria, isClosedWriting, newWritingAttempt, normalizeWritingReview, pointKey,
  submitWriting, writingDeadline, WRITING_LIMIT } from '../engine/writing.js';

const taskFor = app => app.ctx.writingExercises.get(app.route.key);
const attemptFor = (app, task) => app.state.writingCourse[task.id];
const refresh = (app, selector) => {
  app.rerender();
  if (selector) document.querySelector(selector)?.focus({ preventScroll: true });
};

function updateAttempt(app, task, update) {
  return app.store.update(state => update(state.writingCourse[task.id] ??= newWritingAttempt(task)));
}

function submit(app, task) {
  const attempt = attemptFor(app, task);
  if (!attempt || attempt.submitted) return;
  const time = now();
  const submitted = updateAttempt(app, task, entry => {
    const elapsed = writingDeadline(task, entry);
    return submitWriting(task, entry, time, iso(new Date(Math.min(time, elapsed ?? Infinity))));
  });
  if (!submitted) {
    app.notify(w('needText'));
    [...document.querySelectorAll('[data-writing-edit="draft"]')].find(field => !field.value.trim())?.focus();
    return;
  }
  app.store.flush();
  app.rerender({ keepScroll: false });
  document.querySelector('#writing-feedback')?.focus({ preventScroll: true });
}

export const actions = {
  'writing-start'(app) {
    const task = taskFor(app);
    if (!task?.minutes || task.heldOut || attemptFor(app, task)) return;
    app.store.update(state => { state.writingCourse[task.id] = newWritingAttempt(task, now()); });
    app.store.flush();
    refresh(app, '#writing-draft-0');
  },
  'writing-print'() { window.print(); },
  'writing-option'(app, target) {
    const task = taskFor(app);
    const value = Number(target.dataset.index);
    const order = task.kind === 'order';
    updateAttempt(app, task, attempt => {
      if (order) {
        attempt.selection = attempt.selection.includes(value) ? attempt.selection.filter(index => index !== value) : [...attempt.selection, value];
      } else attempt.selection = [value];
    });
    refresh(app, `[data-action="writing-option"][data-index="${value}"]`);
  },
  'writing-check-choice'(app) {
    const task = taskFor(app);
    updateAttempt(app, task, attempt => {
      if (attempt.selection.length !== (task.kind === 'order' ? task.options.length : 1)) return;
      attempt.checked = true;
      attempt.done ||= checkClosedWriting(task, attempt);
    });
    refresh(app, '#writing-feedback');
  },
  'writing-reset-choice'(app) {
    const task = taskFor(app);
    updateAttempt(app, task, attempt => { attempt.selection = []; attempt.checked = false; });
    refresh(app, '[data-action="writing-option"]');
  },
  'writing-submit'(app) {
    const task = taskFor(app);
    if (!isClosedWriting(task) && !attemptFor(app, task)) {
      app.notify(w('needText'));
      document.querySelector('#writing-draft-0')?.focus();
      return;
    }
    submit(app, task);
  },
  'writing-evidence'(app, target) {
    const task = taskFor(app);
    const index = Number(target.dataset.index);
    const key = pointKey(index, Number(target.dataset.point));
    const input = document.querySelector(`#writing-before-${index}`);
    if (!input) return;
    const removing = Boolean(attemptFor(app, task).evidence[key]);
    if (!removing && !input.value.slice(input.selectionStart, input.selectionEnd).trim()) {
      app.notify(w('selectFirst'));
      input.focus();
      return;
    }
    updateAttempt(app, task, attempt => {
      if (removing) delete attempt.evidence[key];
      else attempt.evidence[key] = [input.selectionStart, input.selectionEnd];
    });
    refresh(app, `[data-evidence-id="${key}"]`);
  },
  'writing-reveal'(app) {
    const task = taskFor(app);
    updateAttempt(app, task, attempt => {
      if (!attempt.submitted) return;
      attempt.revealed = true;
      if (task.minutes) attempt.done = true;
      else attempt.revision ??= [...attempt.answers];
    });
    refresh(app, '#writing-feedback');
  },
  'writing-finish'(app) {
    const task = taskFor(app);
    if (!attemptFor(app, task).revision.every(answer => answer.trim())) {
      app.notify(w('needText'));
      document.querySelector('#writing-revision-0')?.focus();
      return;
    }
    updateAttempt(app, task, attempt => { attempt.done = true; });
    refresh(app, '.writing-workspace .writing-ready-callout a');
  },
  'writing-edit'(app) {
    updateAttempt(app, taskFor(app), attempt => { attempt.done = false; });
    refresh(app, '#writing-revision-0');
  },
  'writing-save-review'(app, target) {
    const task = taskFor(app);
    const form = target.closest('form');
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const review = normalizeWritingReview({
      grades: Object.fromEntries(criteria.map(key => [key, data.get(`grade-${key}`)])),
      reasons: Object.fromEntries(criteria.map(key => [key, data.get(`reason-${key}`)])),
      tags: data.getAll('tag')
    });
    if (!review) {
      const reason = criteria.find(key => !data.get(`reason-${key}`).trim());
      form.elements.namedItem(`reason-${reason}`)?.focus();
      return;
    }
    updateAttempt(app, task, attempt => {
      if (target.dataset.review === 'first') attempt.review = review;
      else if (attempt.review) attempt.secondReview = review;
    });
    app.notify(w('reviewSaved'));
    refresh(app);
    const saved = document.querySelector(`[data-review="${target.dataset.review}"]`)?.closest('details');
    if (saved) { saved.open = true; saved.querySelector('summary').focus(); }
  },
  'writing-export'(app) {
    const task = taskFor(app);
    const attempt = attemptFor(app, task);
    const script = task.prompts.flatMap((prompt, i) => [
      prompt.title, prompt.message, prompt.instruction, ...prompt.points.map(point => `• ${point}`),
      '', 'Erster Entwurf', attempt.answers[i], '',
      ...(attempt.revision ? ['Überarbeitete Fassung', attempt.revision[i], ''] : [])
    ]);
    const grades = [attempt.review, attempt.secondReview].map((review, i) => review && [
      i ? 'Zweite Bewertung' : 'Bewertung', ...criteria.map(key => `${key}: ${review.grades[key]} · ${review.reasons[key]}`), ''
    ]).filter(Boolean).flat();
    const report = [task.title.de, attempt.day, '', ...script, ...grades].filter(line => line !== undefined).join('\n');
    const url = URL.createObjectURL(new Blob([report], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${task.id}-${attempt.day}.txt`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

export function onInput(app, event) {
  const field = event.target;
  const edit = field.dataset.writingEdit;
  const plan = field.dataset.writingPlan;
  if (!edit && plan === undefined) return;
  const task = taskFor(app);
  if (!task) return;
  if (edit) updateWritingMeter(field);
  const current = attemptFor(app, task);
  const deadline = writingDeadline(task, current);
  if (edit === 'draft' && deadline && now() >= deadline) return submit(app, task);
  if (edit === 'before' || field.readOnly) return;
  updateAttempt(app, task, attempt => {
    if (plan !== undefined) attempt.plan[Number(plan)] = field.value.slice(0, 500);
    if (edit === 'draft' && !attempt.submitted) attempt.answers[Number(field.dataset.index)] = field.value.slice(0, WRITING_LIMIT);
    if (edit === 'revision' && attempt.submitted && !attempt.done && !task.minutes) {
      attempt.revision ??= [...attempt.answers];
      attempt.revision[Number(field.dataset.index)] = field.value.slice(0, WRITING_LIMIT);
    }
  });
}

export function onChange(app, event) {
  const key = event.target.dataset.writingCheck;
  if (!criteria.includes(key)) return;
  updateAttempt(app, taskFor(app), attempt => {
    attempt.checks = criteria.filter(criterion => criterion === key ? event.target.checked : attempt.checks.includes(criterion));
  });
}

export function mount(app, root) {
  for (const editor of root.querySelectorAll('[data-writing-edit]')) updateWritingMeter(editor);
  for (const form of root.querySelectorAll('[data-writing-review]')) form.addEventListener('submit', event => event.preventDefault());
  const timer = root.querySelector('[data-writing-timer]');
  if (!timer) return;
  const task = taskFor(app);
  const deadline = writingDeadline(task, attemptFor(app, task));
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((deadline - now()) / 1000));
    const stamp = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    if (timer.textContent !== stamp) timer.textContent = stamp;
    timer.parentElement.classList.toggle('ending', remaining <= 60);
    if (!remaining) submit(app, task);
  };
  // Schedule the first tick so a resumed, expired screen can be cleaned up normally.
  const first = setTimeout(tick, 0);
  const interval = setInterval(tick, 250);
  return () => { clearTimeout(first); clearInterval(interval); };
}
