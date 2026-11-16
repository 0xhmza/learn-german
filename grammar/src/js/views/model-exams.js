import { t, num } from '../i18n/index.js';
import { button, crumbs, de, esc, link } from '../components/html.js';
import { examChoices, examResult, isAnswerable, isListening, isMatching, isScorable } from '../engine/model-exams.js';

const routeFor = (model, section) => `model-exams/${model.id}${section ? `/${section.id}` : ''}`;
const partTitle = section => t('examPartTitle')[section.id];
const pageNumber = page => t('examPage', num(page));
const wordCount = text => text.trim() ? text.trim().split(/\s+/).length : 0;
const savedSection = (app, model, section) => app.state.modelExams[model.id]?.[section.id] || {};
const hasWork = draft => draft.checked || draft.writing || Object.keys(draft.responses || {}).length;

export const title = (app, route) => app.ctx.modelTests.get(route.key)?.label ?? t('examTrainerTitle');

function list(app) {
  return `<section class="simple-banner practice-head"><h1>${t('examTrainerTitle')}</h1><p>${t('examTrainerIntro')}</p>
    <p class="study-meta">${t('examSource')} · ${de(app.ctx.modelTestSource)}</p></section>
    <div class="study-grid exam-catalog">${[...app.ctx.modelTests.values()].map(model => {
      const started = Object.values(app.state.modelExams[model.id] || {}).some(hasWork);
      return `<article class="panel study-tile"><h2>${de(model.label)}</h2>
        <p>${t('examPages', ...model.sourcePages.map(num))}${started ? ` · ${t('examInProgress')}` : ''}</p>
        ${link(routeFor(model), t('examOpen'), 'secondary', `aria-label="${esc(`${t('examOpen')} ${model.label}`)}"`)}</article>`;
    }).join('')}</div>`;
}

const groups = [['lesen', 'examGroupRead'], ['sprache', 'examGroupLang'], ['hoeren', 'examGroupListen'], ['schreiben', 'examGroupWrite']];

function menu(app, model, current) {
  return `<nav class="exam-menu" aria-label="${t('examParts')}">${groups.map(([prefix, label]) => `
    <section class="exam-menu-section">${prefix === 'schreiben' ? '' : `<h2>${t(label)}</h2>`}<ul>${model.sections.filter(section => section.id.startsWith(prefix)).map(section => {
      const draft = savedSection(app, model, section);
      const status = section.availability === 'missing' ? t('examMissing') : draft.checked ? t('examChecked') : hasWork(draft) ? t('examInProgress') : '';
      return `<li><a href="#${routeFor(model, section)}" ${current?.id === section.id ? 'aria-current="location"' : ''}>
        <span>${partTitle(section)}</span>${status ? `<small>${status}</small>` : ''}</a></li>`;
    }).join('')}</ul></section>`).join('')}</nav>`;
}

export function render(app, route) {
  const model = app.ctx.modelTests.get(route.key);
  if (!model) return list(app);
  const section = model.sections.find(part => part.id === route.section);
  return `${crumbs([['model-exams', t('examTrainerNav')], [section ? routeFor(model) : null, de(model.label)], ...(section ? [[null, partTitle(section)]] : [])])}
    <section class="simple-banner practice-head"><h1>${section ? partTitle(section) : de(model.label)}</h1>
      <p>${section ? de(model.label) : t('examPages', ...model.sourcePages.map(num))}</p></section>
    <div class="exam-layout ${section ? 'with-part' : ''}">${menu(app, model, section)}
    ${section ? renderPart(app, model, section) : `<p class="muted">${t('examNoSpeaking')}</p>`}</div>`;
}

function renderPassage(section) {
  return section.passage?.map(line => `<p>${line.split(/(\{\d+\})/g).map(piece => /^\{\d+\}$/.test(piece)
    ? `<strong class="exam-gap">${esc(piece.slice(1, -1))}</strong>` : esc(piece)).join('')}</p>`).join('') || '';
}

function renderScans(section) {
  const scans = section.scans || [];
  if (!scans.length) return '';
  const ads = section.id === 'lesen-3';
  return `<details class="panel exam-scans" ${ads ? 'open' : ''}>
    <summary>${t(ads ? 'examAds' : 'examScan')}</summary>
    ${!ads ? `<p>${t('examCompareSource')}</p>` : ''}
    ${scans.map(scan => `<details class="exam-scan" ${scans.length === 1 ? 'open' : ''}>
      <summary>${pageNumber(scan.page)}</summary><div class="actions scan-controls">${button('exam-zoom', t('examZoom'), 'secondary', `aria-pressed="false" aria-controls="exam-scan-${scan.page}"`)}</div>
      <div class="exam-scan-image" id="exam-scan-${scan.page}" tabindex="0" dir="ltr" role="region" aria-label="${esc(pageNumber(scan.page))}">
      <img src="${esc(scan.data)}" loading="lazy" alt="${esc(`${partTitle(section)} · ${pageNumber(scan.page)}`)}"></div></details>`).join('')}
    </details>`;
}

function renderTranscript(section) {
  const content = section.transcript || [];
  if (!content.length && !section.adTranscript) return '';
  return `<details class="panel exam-transcript"><summary>${t(section.id === 'schreiben' ? 'examStudyNotes' : 'examTranscript')}</summary>
    ${content.map(part => `<h3>${pageNumber(part.page)}</h3><p lang="de" dir="ltr">${esc(part.text)}</p>`).join('')}
    ${section.adTranscript ? `<p lang="de" dir="ltr">${esc(section.adTranscript)}</p>` : ''}</details>`;
}

function renderVariants(section) {
  return (section.variants || []).map(variant => `<details class="panel exam-transcript">
    <summary>${t('examVariant')} · ${pageNumber(variant.page)}</summary>
    <ol start="${variant.items[0].number}" lang="de" dir="ltr">${variant.items.map(item => `<li><strong>${esc(item.prompt)}</strong>
      <ol type="a">${Object.entries(item.choices).sort().map(([code, value]) => `<li ${code === item.key?.choice ? 'class="exam-variant-answer"' : ''}>${esc(value)}</li>`).join('')}</ol></li>`).join('')}</ol>
  </details>`).join('');
}

function renderPart(app, model, section) {
  if (section.availability === 'missing') {
    return `<section class="panel exam-part"><p>${t('examMissing')}</p>
      ${section.related ? `<div class="actions">${link(`model-exams/${section.related}/${section.id}`, t('examRelated'))}</div>` : ''}</section>`;
  }
  const draft = savedSection(app, model, section);
  const writing = section.id === 'schreiben';
  const passage = renderPassage(section);
  const bank = section.choices && section.id !== 'lesen-3' ? `<ul class="exam-bank" lang="de" dir="ltr">${Object.entries(section.choices).sort().map(([value, label]) => `<li><b>${value.toUpperCase()}</b> ${esc(label)}</li>`).join('')}</ul>` : '';
  const { responses = {}, checked = false } = draft;
  const score = examResult(section, responses);
  const exercise = writing ? `<label for="exam-writing">${t('examWritten')}</label>
    <textarea id="exam-writing" maxlength="30000" lang="de" dir="ltr">${esc(draft.writing || '')}</textarea>
    <p id="exam-words" class="study-meta">${t('examWords', num(wordCount(draft.writing || '')))}</p><p>${t('examWriteOwn')}</p>`
    : `<div class="exam-questions">${section.items.map(item => renderItem(section, item, responses, checked)).join('')}</div>
      <div class="actions study-actions">${button(checked ? 'exam-edit' : 'exam-check', t(checked ? 'examPracticeAgain' : 'examCheck'), 'primary')}</div>`;
  return `<div class="exam-part">
      ${isListening(section) ? `<p class="notice">${t('examNoAudio')}</p>` : ''}
      ${renderScans(section)}
      <section class="panel exam-paper">
        ${checked ? `<h2 id="exam-result" tabindex="-1">${score.total ? t('examScore', num(score.correct), num(score.total)) : t('examNoGrade')}</h2>
          <p class="study-meta">${t('examSourceNotice')}</p>` : ''}
        ${isMatching(section) && !checked ? `<p class="study-meta">${t('examMatchHelp')}</p>` : ''}
        ${passage ? `<div class="exam-passage" lang="de" dir="ltr">${passage}${section.transcriptionNote ? `<p class="study-meta">${esc(section.transcriptionNote)}</p>` : ''}</div>` : ''}
        ${bank || ''}${exercise}
      </section>
      ${renderVariants(section)}${renderTranscript(section)}
    </div>`;
}

function renderItem(section, item, responses, checked) {
  const id = `exam-question-${item.number}`;
  const choices = examChoices(section, item);
  const value = responses[item.number];
  const answerable = isAnswerable(section, item);
  const scoreable = isScorable(section, item);
  const formatChoice = (code, label) => section.id === 'lesen-3' ? (code === 'x' ? `X · ${t('examNoAd')}` : code.toUpperCase()) : `${code.toUpperCase()} · ${label}`;
  const keyStatus = { verified: 'examVerified', 'source-key': 'examSourceKey', corrected: 'examCorrected', disputed: 'examDisputed', missing: 'examUnavailableKey' };
  return `<section class="exam-item" aria-labelledby="${id}">
    <h3 id="${id}"><bdi class="exam-number">${num(item.number)}</bdi>
      ${item.prompt ? `<span lang="de" dir="ltr">${esc(item.prompt)}</span>` : section.id.startsWith('sprache-') ? t('blank', num(item.number)) : t('examPromptMissing')}</h3>
    ${answerable && !checked ? `<select data-exam-item="${item.number}" aria-labelledby="${id}" lang="de" dir="ltr">
      <option value="" dir="auto">${esc(t('examChoose'))}</option>${Object.entries(choices).sort().map(([code, label]) => {
        const disabled = isMatching(section) && code !== 'x' && Object.entries(responses).some(([n, answer]) => Number(n) !== item.number && code === answer);
        return `<option value="${esc(code)}" ${value === code ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${esc(formatChoice(code, label))}</option>`;
      }).join('')}</select>` : !answerable && !checked ? `<p class="study-meta">${t('examLockedItem')}</p>` : ''}
    ${checked ? `<div class="exam-mark ${scoreable ? (value === item.key.choice ? 'good' : 'bad') : ''}">
      <strong>${t(keyStatus[item.key.status])}</strong>
      ${value ? `<p>${t('yourAnswer')} · ${de(formatChoice(value, choices[value]))}</p>` : ''}
      ${item.key.choice && item.key.status !== 'disputed' ? `<p>${t('solution')} · ${de(formatChoice(item.key.choice, choices[item.key.choice] || item.key.word || ''))}</p>` : ''}
      ${item.key.printedChoice ? `<p>${t('examPrinted')} · ${de(item.key.printedChoice.toUpperCase())}${item.key.printedWord ? ` · ${de(item.key.printedWord)}` : ''}</p>` : ''}
      ${item.key.note ? `<p lang="de" dir="ltr">${esc(item.key.note)}</p>` : ''}
      ${item.key.page ? `<small>${pageNumber(item.key.page)}</small>` : ''}</div>` : ''}</section>`;
}

function updateDraft(app, change) {
  app.store.update(state => {
    const model = state.modelExams[app.route.key] ||= {};
    const draft = model[app.route.section] ||= {};
    change(draft);
  });
}

export function onInput(app, event) {
  const input = event.target;
  if (input.id !== 'exam-writing') return;
  updateDraft(app, draft => { draft.writing = input.value; });
  document.querySelector('#exam-words').textContent = t('examWords', num(wordCount(input.value)));
}

export function onChange(app, event) {
  const select = event.target;
  if (!select.matches('[data-exam-item]')) return;
  const section = app.ctx.modelTests.get(app.route.key).sections.find(part => part.id === app.route.section);
  const matching = isMatching(section);
  updateDraft(app, draft => {
    const responses = draft.responses ||= {};
    if (select.value) responses[select.dataset.examItem] = select.value;
    else delete responses[select.dataset.examItem];
    if (!matching) return;
    for (const sibling of document.querySelectorAll('[data-exam-item]')) {
      for (const option of sibling.options) option.disabled = Boolean(option.value && option.value !== 'x' && option.value !== sibling.value && Object.values(responses).includes(option.value));
    }
  });
}

function check(app, checked) {
  updateDraft(app, draft => { draft.checked = checked; });
  app.rerender({ keepScroll: false });
  document.querySelector(checked ? '#exam-result' : '[data-exam-item]')?.focus();
}

export const actions = {
  'exam-check': app => check(app, true),
  'exam-edit': app => check(app, false),
  'exam-zoom': (app, target) => {
    const zoomed = target.closest('.exam-scan').classList.toggle('zoomed');
    target.setAttribute('aria-pressed', String(zoomed));
    target.textContent = t(zoomed ? 'examFit' : 'examZoom');
  }
};
