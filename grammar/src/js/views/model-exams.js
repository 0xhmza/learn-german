import { getLang, t, num } from '../i18n/index.js';
import { button, crumbs, de, esc, link } from '../components/html.js';
import { examChoices, examResult, isListening, isMatching } from '../engine/model-exams.js';

const routeFor = (model, section) => `model-exams/${model.id}${section ? `/${section.id}` : ''}`;
const partTitle = section => t('examPartTitle')[section.id];
const modelTitle = model => model.title[getLang()];
const modelNumber = model => t('examModel', num(model.number));
const wordCount = text => text.trim() ? text.trim().split(/\s+/).length : 0;
const savedSection = (app, model, section) => app.state.modelExams[model.id]?.[section.id] || {};
const hasWork = draft => draft.checked || draft.writing || Object.keys(draft.responses || {}).length;

export function title(app, route) {
  const model = app.ctx.modelTests.get(route.key);
  return model ? modelTitle(model) : t('examTrainerTitle');
}

function list(app) {
  return `<section class="simple-banner practice-head"><h1>${t('examTrainerTitle')}</h1><p>${t('examTrainerIntro')}</p></section>
    <div class="study-grid exam-catalog">${[...app.ctx.modelTests.values()].map(model => {
      const started = Object.values(app.state.modelExams[model.id] || {}).some(hasWork);
      return `<article class="panel study-tile">
        <p class="study-meta">${modelNumber(model)}${started ? ` · ${t('examInProgress')}` : ''}</p>
        <h2>${esc(modelTitle(model))}</h2>
        ${link(routeFor(model), t('examOpen'), 'secondary', `aria-label="${esc(`${t('examOpen')} · ${modelNumber(model)} · ${modelTitle(model)}`)}"`)}</article>`;
    }).join('')}</div>`;
}

const groups = [['lesen', 'examGroupRead'], ['sprache', 'examGroupLang'], ['hoeren', 'examGroupListen'], ['schreiben', 'examGroupWrite']];

function menu(app, model, current) {
  return `<nav class="exam-menu" aria-label="${t('examParts')}">${groups.map(([prefix, label]) => `
    <section class="exam-menu-section">${prefix === 'schreiben' ? '' : `<h2>${t(label)}</h2>`}<ul>${model.sections.filter(section => section.id.startsWith(prefix)).map(section => {
      const draft = savedSection(app, model, section);
      const status = !isListening(section) && draft.checked ? t('examChecked') : hasWork(draft) ? t('examInProgress') : '';
      return `<li><a href="#${routeFor(model, section)}" ${current?.id === section.id ? 'aria-current="location"' : ''}>
        <span>${partTitle(section)}</span>${status ? `<small>${status}</small>` : ''}</a></li>`;
    }).join('')}</ul></section>`).join('')}</nav>`;
}

export function render(app, route) {
  const model = app.ctx.modelTests.get(route.key);
  if (!model) return list(app);
  const section = model.sections.find(part => part.id === route.section);
  const name = esc(modelTitle(model));
  const navigation = menu(app, model, section);
  const writing = section?.id === 'schreiben';
  const layout = writing
    ? `<details class="exam-writing-navigation">
        <summary>${t('examParts')}</summary>
        ${navigation}
      </details>
      ${renderWriting(app, model, section)}`
    : `<div class="exam-layout ${section ? 'with-part' : ''}">${navigation}
      ${section ? renderPart(app, model, section) : ''}</div>`;
  return `${crumbs([['model-exams', t('examTrainerNav')], [section ? routeFor(model) : null, name], ...(section ? [[null, partTitle(section)]] : [])])}
    <section class="simple-banner practice-head${writing ? ' exam-writing-heading' : ''}"><h1>${section ? partTitle(section) : name}</h1>
      <p>${section ? `${modelNumber(model)} · ${name}` : modelNumber(model)}</p></section>
    ${layout}`;
}

function renderWriting(app, model, section) {
  const { intro, greeting, body, closing, instruction, points, notes } = section.writing;
  const reply = savedSection(app, model, section).writing || '';
  return `<div class="exam-writing-workspace">
    <div class="exam-writing-grid">
      <section class="panel exam-writing-source" aria-labelledby="exam-writing-message-title">
        <h2 id="exam-writing-message-title">${t('examWritingMessage')}</h2>
        <div lang="de" dir="ltr">
          <p class="exam-writing-intro">${esc(intro)}</p>
          <blockquote class="exam-writing-message">
            <p>${esc(greeting)}</p>
            ${body.map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}
            <p class="exam-writing-closing">${closing.map(esc).join('<br>')}</p>
          </blockquote>
        </div>
      </section>
      <div class="exam-writing-response">
        <section class="panel exam-writing-task" aria-labelledby="exam-writing-task-title">
          <h2 id="exam-writing-task-title">${t('examWritingTask')}</h2>
          <div lang="de" dir="ltr">
            <p id="exam-writing-instruction">${esc(instruction)}</p>
            <ul class="exam-writing-points">${points.map(point => `<li>${esc(point)}</li>`).join('')}</ul>
            <div class="exam-writing-notes">${notes.map(note => `<p>${esc(note)}</p>`).join('')}</div>
          </div>
        </section>
        <section class="panel exam-writing-editor" aria-labelledby="exam-writing-label">
          <div class="exam-writing-editor-header">
            <h2><label id="exam-writing-label" for="exam-writing">${t('examWritten')}</label></h2>
            <p id="exam-words">${t('examWords', num(wordCount(reply)))}</p>
          </div>
          <textarea id="exam-writing" maxlength="30000" lang="de" dir="ltr" aria-describedby="exam-writing-instruction exam-writing-storage">
${esc(reply)}</textarea>
          <p id="exam-writing-storage" class="exam-writing-storage">${t('examWritingStorage')}</p>
        </section>
      </div>
    </div>
  </div>`;
}

function renderPassage(section) {
  return section.passage?.map(line => `<p>${line.split(/(\{\d+\})/g).map(piece => /^\{\d+\}$/.test(piece)
    ? `<strong class="exam-gap">${esc(piece.slice(1, -1))}</strong>` : esc(piece)).join('')}</p>`).join('') || '';
}

function renderAds(ads) {
  return `<details class="panel exam-ads" open>
    <summary>${t('examAds')}</summary>
    <ul class="exam-ad-grid" lang="de" dir="ltr">${ads.map(ad => `<li class="exam-ad">
      <h3><b>${esc(ad.code.toUpperCase())}</b> ${esc(ad.title)}</h3><p>${esc(ad.text)}</p></li>`).join('')}</ul>
  </details>`;
}

function renderVariants(section) {
  return (section.variants || []).map(variant => `<details class="panel exam-variant">
    <summary>${t('examVariant')}</summary>
    <ol start="${variant.items[0].number}" lang="de" dir="ltr">${variant.items.map(item => `<li><strong>${esc(item.prompt)}</strong>
      <ol type="a">${Object.values(item.choices).map(value => `<li>${esc(value)}</li>`).join('')}</ol></li>`).join('')}</ol>
    <details><summary>${t('examSolutions')}</summary>
      <ul lang="de" dir="ltr">${variant.items.map(item => `<li>${num(item.number)} · <b>${esc(item.answer.toUpperCase())}</b> ${esc(item.choices[item.answer])}</li>`).join('')}</ul>
    </details>
  </details>`).join('');
}

function renderPart(app, model, section) {
  const draft = savedSection(app, model, section);
  const listening = isListening(section);
  const passage = renderPassage(section);
  const bank = section.choices ? `<ul class="exam-bank" lang="de" dir="ltr">${Object.entries(section.choices).map(([value, label]) => `<li><b>${value.toUpperCase()}</b> ${esc(label)}</li>`).join('')}</ul>` : '';
  const { responses = {} } = draft;
  const score = examResult(section, responses);
  const checked = score.total > 0 && draft.checked;
  const exercise = `<div class="exam-questions">${section.items.map(item => renderItem(section, item, responses, checked)).join('')}</div>
    ${score.total ? `<div class="actions study-actions">${button(checked ? 'exam-edit' : 'exam-check', t(checked ? 'examPracticeAgain' : 'examCheck'), 'primary')}</div>` : ''}`;
  const tip = section.ads ? 'examMatchAds' : 'examMatchHelp';
  return `<div class="exam-part">
      ${listening ? `<p class="notice">${t('examNoAudio')}</p>` : ''}
      ${isMatching(section) && !checked ? `<p class="study-meta">${t(tip)}</p>` : ''}
      ${section.ads ? renderAds(section.ads) : ''}
      <section class="panel exam-paper">
        ${checked ? `<h2 id="exam-result" tabindex="-1">${t('examScore', num(score.correct), num(score.total))}</h2>` : ''}
        ${passage ? `<div class="exam-passage" lang="de" dir="ltr">${passage}</div>` : ''}
        ${bank}${exercise}
      </section>
      ${renderVariants(section)}
    </div>`;
}

function renderItem(section, item, responses, checked) {
  const id = `exam-question-${item.number}`;
  const choices = examChoices(section, item);
  const value = responses[item.number];
  const formatChoice = (code, label) => code === 'x' ? `X · ${t('examNoAd')}` : `${code.toUpperCase()} · ${label}`;
  const choiceText = code => code === 'x' ? `<bdi dir="ltr">X</bdi> · ${t('examNoAd')}` : de(formatChoice(code, choices[code]));
  const correct = value === item.answer;
  return `<section class="exam-item" aria-labelledby="${id}">
    <h3 id="${id}"><bdi class="exam-number">${num(item.number)}</bdi>
      ${item.prompt ? `<span lang="de" dir="ltr">${esc(item.prompt)}</span>` : t('blank', num(item.number))}</h3>
    ${!checked ? `<select data-exam-item="${item.number}" aria-labelledby="${id}" lang="de" dir="ltr">
      <option value="" lang="${getLang()}" dir="auto">${esc(t('examChoose'))}</option>${Object.entries(choices).map(([code, label]) => {
        const disabled = isMatching(section) && code !== 'x' && Object.entries(responses).some(([n, answer]) => Number(n) !== item.number && code === answer);
        return `<option value="${esc(code)}" ${code === 'x' ? `lang="${getLang()}" dir="auto"` : ''} ${value === code ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${esc(formatChoice(code, label))}</option>`;
      }).join('')}</select>` : `<div class="exam-mark ${correct ? 'good' : 'bad'}">
      <strong>${t(correct ? 'examRight' : value ? 'examWrong' : 'examUnanswered')}</strong>
      ${value && !correct ? `<p>${t('yourAnswer')} · ${choiceText(value)}</p>` : ''}
      <p>${t('examCorrectAnswer')} · ${choiceText(item.answer)}</p></div>`}</section>`;
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
  updateDraft(app, draft => {
    const responses = draft.responses ||= {};
    if (select.value) responses[select.dataset.examItem] = select.value;
    else delete responses[select.dataset.examItem];
    if (!isMatching(section)) return;
    const used = new Set(Object.values(responses));
    for (const sibling of document.querySelectorAll('[data-exam-item]')) {
      for (const option of sibling.options) option.disabled = option.value !== 'x' && option.value !== sibling.value && used.has(option.value);
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
  'exam-edit': app => check(app, false)
};
