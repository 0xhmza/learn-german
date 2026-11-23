import { getLang, num } from '../i18n/index.js';
import { w } from '../i18n/writing.js';
import { button, esc, link, prose } from '../components/html.js';
import { hasWritingResponse, isClosedWriting, newWritingAttempt, checkClosedWriting, writingDeadline } from '../engine/writing.js';
import { comparison, editor, reviews, selfCheck } from './writing-review.js';

export { actions, mount, onInput, onChange } from './writing-actions.js';

const l = value => prose(value[getLang()]);
const optionButtons = (items, attempt, chosen = false) => items.map(({ option, index }) =>
  button('writing-option', esc(option), 'secondary',
    `lang="de" dir="ltr" data-index="${index}" aria-pressed="${chosen || attempt.selection.includes(index)}" ${attempt.checked ? 'disabled' : ''}`)).join('');

function closedExercise(task, attempt, next) {
  const options = task.options.map((option, index) => ({ option, index }));
  const correct = checkClosedWriting(task, attempt);
  const order = task.kind === 'order';
  return `<section class="panel writing-closed">
    <h2>${esc(w('question'))}</h2><p lang="de" dir="ltr">${esc(task.question)}</p>
    ${order ? `<p class="muted">${esc(w('orderHint'))}</p>` : ''}
    <div class="writing-options" role="group" aria-label="${esc(w('question'))}">
      ${optionButtons(order ? options.filter(item => !attempt.selection.includes(item.index)) : options, attempt)}
    </div>
    ${order ? `<div class="writing-order"><h3>${esc(w('chosen'))}</h3><div class="writing-options" role="group" aria-label="${esc(w('chosen'))}">
      ${optionButtons(attempt.selection.map(index => options[index]), attempt, true)}</div></div>` : ''}
    ${attempt.checked ? `<div class="writing-answer ${correct ? 'positive' : 'retry'}" id="writing-feedback" tabindex="-1">
      <h3>${esc(w(correct ? 'right' : 'rethink'))}</h3>
      <p>${l(task.feedback)}</p><p lang="de" dir="ltr">${esc(order ? task.answer.map(index => task.options[index]).join(' ') : task.options[task.answer])}</p>
    </div>` : ''}
    <div class="actions">${attempt.checked
      ? `${correct ? link(next, esc(w('nextTask')), 'primary') : ''}${button('writing-reset-choice', esc(w('resetChoice')), 'secondary')}`
      : button('writing-check-choice', esc(w('checkChoice')), 'primary', attempt.selection.length === (order ? options.length : 1) ? '' : 'disabled')}</div>
  </section>`;
}

function incoming(prompt, label = w('message')) {
  return prompt.message ? `<section class="writing-incoming"><h3>${esc(label)}</h3>
    <blockquote lang="de" dir="ltr">${esc(prompt.message)}</blockquote></section>` : '';
}

function promptBlock(prompt) {
  return `<div class="writing-prompt" lang="de" dir="ltr">
    ${prompt.title ? `<h3>${esc(prompt.title)}</h3>` : ''}<p>${esc(prompt.instruction)}</p>
    <ol>${prompt.points.map(point => `<li>${esc(point)}</li>`).join('')}</ol>
  </div>`;
}

function printable(task) {
  return `<article class="writing-print" lang="de" dir="ltr">
    <h1>${esc(task.title.de)}</h1><p>Bearbeitungszeit: ${task.minutes} Minuten</p>
    ${task.prompts.map(prompt => incoming(prompt, 'Die Nachricht') + promptBlock(prompt)).join('')}
    <h2>Ihre Antwort</h2><div class="writing-print-lines">${'<div></div>'.repeat(18)}</div>
  </article>`;
}

function renderDraft(task, attempt, chapter) {
  const coaching = chapter && !task.diagnostic && !task.independent && !task.minutes
    ? `<details class="panel writing-hint" id="writing-hint" data-writing-panel><summary>${esc(w('tip'))}</summary>
      <p>${l(chapter.tip)}</p>
      <ul class="writing-phrases" lang="de" dir="ltr">${chapter.phrases.map(phrase => `<li>${esc(phrase)}</li>`).join('')}</ul></details>` : '';
  const prompts = task.prompts.map((prompt, i) => `<div class="writing-split">
    <section class="panel writing-assignment"><h2>${esc(w('question'))}${task.prompts.length > 1 ? ` ${num(i + 1)}` : ''}</h2>
      ${incoming(prompt)}${promptBlock(prompt)}
      ${task.plan ? `<details class="writing-plan" id="writing-plan" data-writing-panel><summary>${esc(w('plan'))}</summary>
        <p>${esc(w('planHint'))}</p>${prompt.points.map((point, j) =>
          `<label lang="de" dir="ltr">${esc(point)}<input type="text" maxlength="500" data-writing-plan="${j}" value="${esc(attempt.plan[j])}"></label>`).join('')}</details>` : ''}
    </section>
    <section class="panel writing-draft-panel">
      ${editor(prompt, i, 'draft', attempt.answers[i], prompt.title ?? w('draftTitle'), Boolean(task.minutes))}
      <p class="muted writing-editor-hint">${esc(w('expectedHelp'))} ${esc(w('saveLocal'))}</p>
    </section></div>`).join('');
  return `${coaching}${prompts}<div class="actions">${button('writing-submit', esc(w(task.minutes ? 'submitTimed' : 'submit')), 'primary')}</div>`;
}

export function renderWorkspace(task, saved, chapter, next) {
  const timed = Boolean(task.minutes);
  const deadline = writingDeadline(task, saved);
  const attempt = saved ?? newWritingAttempt(task);
  const blank = timed && attempt.submitted && !hasWritingResponse(attempt);
  const stage = isClosedWriting(task) ? closedExercise(task, attempt, next)
    : timed && !attempt.started ? `<section class="panel writing-timed-start">
      <h2>${num(task.minutes)} ${esc(w('minutes'))}</h2><p>${esc(w('timedIntro'))}</p>
      <div class="actions">${button('writing-start', esc(w('timedStart')), 'primary')}
        ${task.printable ? button('writing-print', esc(w('print'))) : ''}</div>
      ${task.printable ? printable(task) : ''}</section>`
    : !attempt.submitted ? renderDraft(task, attempt, chapter)
    : attempt.revealed ? comparison(task, attempt, getLang()) : selfCheck(task, attempt, promptBlock);
  return `<article class="writing-course writing-workspace" aria-labelledby="writing-title">
    <header class="writing-page-head writing-workspace-head">
      <div><h1 id="writing-title">${l(task.title)}</h1>
        ${timed && attempt.submitted && !blank ? `<p>${esc(w(attempt.submitted === deadline ? 'timedExpired' : 'timedFinished'))}</p>` : ''}</div>
      ${timed && attempt.started && !attempt.submitted
        ? `<div class="writing-timer"><span>${esc(w('timer'))}</span><strong data-writing-timer role="timer" dir="ltr">${task.minutes}:00</strong></div>` : ''}
    </header>
    ${stage}
    ${blank ? `<section class="panel writing-coach"><p>${esc(w('blankAttempt'))}</p>
      ${task.heldOut ? link(next, esc(w('ready')), 'secondary') : button('writing-start', esc(w('retryTimed')), 'secondary')}</section>` : ''}
    ${attempt.done && !isClosedWriting(task) ? `<section class="writing-ready-callout">
      <div><h2>${esc(w('done'))}</h2><p>${esc(w('doneNote'))}</p></div>
      ${link(next, esc(w(next === 'schreiben/bereit' ? 'ready' : 'nextTask')), 'primary')}</section>` : ''}
    ${attempt.submitted && !blank && !isClosedWriting(task) ? `<div class="actions">${button('writing-export', esc(w('export')))}</div>` : ''}
    ${attempt.submitted && task.kind === 'telc' && !blank ? reviews(attempt) : ''}
  </article>`;
}
