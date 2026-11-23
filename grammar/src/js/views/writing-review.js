import { num } from '../i18n/index.js';
import { w } from '../i18n/writing.js';
import { button, esc, prose } from '../components/html.js';
import { expectedWords, writingMeter } from '../components/writing-meter.js';
import { criteria, errorTags, pointKey, writingScore, WRITING_LIMIT } from '../engine/writing.js';

const checkKeys = { task: 'checkTask', style: 'checkStyle', accuracy: 'checkAccuracy' };

export function editor(prompt, index, type, value, label, timed = false, readOnly = false) {
  const id = `writing-${type}-${index}`;
  return `<div class="writing-editor">
    <label for="${id}">${esc(label)}</label>
    <textarea id="${id}" lang="de" dir="ltr" maxlength="${WRITING_LIMIT}" aria-describedby="${id}-meter"
      ${timed ? 'spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off"' : 'spellcheck="true"'}
      ${readOnly ? 'readonly' : ''} data-writing-edit="${type}" data-index="${index}"
      placeholder="${esc(w('draftWrite'))}">${'\n'}${esc(value)}</textarea>
    ${writingMeter(id, expectedWords(prompt), value)}
  </div>`;
}

function evidence(prompt, index, attempt) {
  return `<div class="writing-evidence"><ul>${prompt.points.map((point, j) => {
    const key = pointKey(index, j);
    const range = attempt.evidence[key];
    return `<li><div lang="de" dir="ltr">${esc(point)}${range ? `<blockquote>${esc(attempt.answers[index].slice(...range))}</blockquote>` : ''}</div>
      ${button('writing-evidence', esc(w(range ? 'removeEvidence' : 'evidence')), 'quiet', `data-point="${j}" data-index="${index}" data-evidence-id="${key}"`)}</li>`;
  }).join('')}</ul></div>`;
}

export function selfCheck(task, attempt, promptBlock) {
  return `<section class="writing-step" id="writing-feedback" tabindex="-1">
    <header class="writing-page-head"><h2>${esc(w('selfCheck'))}</h2><p>${esc(w('evidenceHint'))}</p></header>
    ${task.prompts.map((prompt, i) => `<div class="writing-split">
      <section class="panel writing-draft-panel">${editor(prompt, i, 'before', attempt.answers[i], prompt.title ?? w('draftTitle'), true, true)}</section>
      <section class="panel">${promptBlock(prompt)}${evidence(prompt, i, attempt)}</section>
    </div>`).join('')}
    <fieldset class="panel writing-checks"><legend>${esc(w('checklist'))}</legend>
      ${criteria.map(key => `<label><input type="checkbox" data-writing-check="${key}" ${attempt.checks.includes(key) ? 'checked' : ''}> <span>${esc(w(checkKeys[key]))}</span></label>`).join('')}
    </fieldset>
    ${!task.minutes ? `<details class="panel writing-pre-revision"><summary>${esc(w('edit'))}</summary>
      ${task.prompts.map((prompt, i) => editor(prompt, i, 'revision', (attempt.revision ?? attempt.answers)[i], w('revise'))).join('')}</details>` : ''}
    <div class="actions">${button('writing-reveal', esc(w('reveal')), 'primary')}</div>
  </section>`;
}

function modelPanel(prompt, language) {
  return `<section class="panel writing-model">
    <h3>${esc(w('model'))}</h3><p>${esc(w('modelIntro'))}</p>
    <div class="writing-manuscript" lang="de" dir="ltr">${esc(prompt.model)}</div>
    <details class="writing-point-notes" open><summary>${esc(w('modelPoints'))}</summary><ol lang="de" dir="ltr">${prompt.points.map((point, i) =>
      `<li lang="de" dir="ltr"><span>${esc(point)}</span><blockquote>${esc(prompt.modelPoints[i])}</blockquote></li>`).join('')}</ol></details>
    <div class="writing-model-notes"><h4>${esc(w('modelNotes'))}</h4>${prompt.explain.map(note =>
      `<p><strong>${esc(w(note.criterion))}</strong> ${prose(note.text[language])}</p>`).join('')}</div>
    ${prompt.alternatives?.length ? `<details><summary>${esc(w('alternatives'))}</summary><ul lang="de" dir="ltr">${prompt.alternatives.map(item => `<li>${esc(item)}</li>`).join('')}</ul></details>` : ''}
  </section>`;
}

export function comparison(task, attempt, language) {
  return `<section class="writing-step" id="writing-feedback" tabindex="-1">
    ${task.prompts.map((prompt, i) => `<div class="writing-split">
      <section class="panel writing-original"><h3>${esc(prompt.title ?? w('draftTitle'))}</h3>
        <div class="writing-manuscript original" lang="de" dir="ltr">${esc(attempt.answers[i]) || '—'}</div>
        ${!task.minutes ? `<p class="muted">${esc(w('reviseHint'))}</p>
          ${editor(prompt, i, 'revision', attempt.revision[i], w('revise'), false, attempt.done)}` : ''}
      </section>
      ${modelPanel(prompt, language)}
    </div>`).join('')}
    ${!task.minutes ? `<div class="actions">${attempt.done ? button('writing-edit', esc(w('edit')), 'quiet') : button('writing-finish', esc(w('finish')), 'primary')}</div>` : ''}
  </section>`;
}

function reviewForm(review, second = false) {
  const score = writingScore(review);
  const suffix = second ? 'second' : 'first';
  return `<details class="panel writing-review-form">
    <summary>${esc(w(second ? 'second' : 'review'))} <span>${score === null ? esc(w('awaiting')) : `${num(score)} / ${num(45)}`}</span></summary>
    <p>${esc(w('reviewHelp'))}</p>
    <form data-writing-review>
      ${criteria.map(key => `<fieldset><legend>${esc(w(key))}</legend><div>
        <label>${esc(w('grade'))}<select name="grade-${key}" required><option value="">—</option>
          ${['A', 'B', 'C', 'D'].map(grade => `<option value="${grade}" ${review?.grades[key] === grade ? 'selected' : ''}>${grade}</option>`).join('')}</select></label>
        <label>${esc(w('reason'))}<input name="reason-${key}" required maxlength="600" dir="auto" value="${esc(review?.reasons[key])}"></label>
      </div></fieldset>`).join('')}
      ${!second ? `<fieldset class="writing-tags"><legend>${esc(w('tags'))}</legend>
        ${errorTags.map(tag => `<label><input type="checkbox" name="tag" value="${tag}" ${review?.tags.includes(tag) ? 'checked' : ''}> ${esc(w(tag))}</label>`).join('')}
      </fieldset>` : ''}
      ${button('writing-save-review', esc(w('saveReview')), 'secondary', `data-review="${suffix}"`)}
    </form>
  </details>`;
}

export function reviews(attempt) {
  return `<details class="panel writing-rubric">
      <summary>${esc(w('rubric'))}</summary>
      <ul>${['rubricTask', 'rubricStyle', 'rubricAccuracy', 'rubricSituation'].map(key => `<li>${esc(w(key))}</li>`).join('')}</ul>
      <a href="https://shop.telc.net/media/catalog/product/file/2/0/20201225_5061-b00-010301_web.pdf#page=38" target="_blank" rel="noopener">telc · Übungstest 1</a>
    </details>
    ${reviewForm(attempt.review)}
    ${attempt.review ? reviewForm(attempt.secondReview, true) : ''}`;
}
