import { getLang, t, num } from '../i18n/index.js';
import { button, crumbs, de, esc, link } from '../components/html.js';
import { examChoices, examResult, isListening, isMatching, isReading, lastReadingResult } from '../engine/model-exams.js';
import { dropGap, wordChips, mountDragDrop, focusAfterPlacing } from '../components/dragdrop.js';
import { currentLevel, levelHasContent, modelProgress, testsProgress } from '../engine/areas.js';
import { resumeCard, levelSoonCard } from '../components/widgets.js';
import { stopFor } from '../components/stops.js';
import { expectedWords, updateWritingMeter, writingMeter } from '../components/writing-meter.js';
import { w } from '../i18n/writing.js';

const routeFor = (model, section) => `model-exams/${model.id}${section ? `/${section.id}` : ''}`;
const partTitle = section => t('examPartTitle')[section.id];
const modelTitle = model => model.title[getLang()];
const modelNumber = model => t('examModel', num(model.number));
const savedSection = (app, model, section) => app.state.modelExams[model.id]?.[section.id] || {};
const hasWork = draft => draft.checked || draft.writing || Object.keys(draft.responses || {}).length;

function coverage(sample) {
  return `<ul class="coverage-list">${['readingScored', 'writingSelf', 'listeningStatements', ...(sample ? ['listeningSample', 'speakingSample'] : [])].map(key => `<li>${t(key)}</li>`).join('')}</ul>`;
}

export function title(app, route) {
  const model = app.ctx.modelTests.get(route.key);
  return model ? modelTitle(model) : t('examTrainerTitle');
}

function list(app) {
  const sampleId = app.ctx.learning.examSample?.model;
  const models = [...app.ctx.modelTests.values()];
  const added = models.find(model => model.id === sampleId);
  const card = (model, featured = false) => {
      const saved = app.state.modelExams[model.id] || {};
      const draft = saved.schreiben?.writing?.trim();
      const started = Object.values(saved).some(hasWork);
      const progress = modelProgress(model, app.state);
      return `<article class="panel study-tile ${featured ? 'exam-featured' : ''}">
        <p class="study-meta">${featured ? t('featuredModel') : modelNumber(model)}${started ? ` · ${t('examInProgress')}` : ''}</p>
        <h2>${esc(modelTitle(model))}</h2>
        <p class="study-meta">${t('testsDone', num(progress.done), num(progress.total))}</p>
        ${coverage(model.id === sampleId)}
        <div class="actions">
          ${draft ? link(`${routeFor(model)}/schreiben`, t('resumeWriting'), 'primary') : ''}
          ${link(routeFor(model), t('examOpen'), featured && !draft ? 'primary' : 'secondary', `aria-label="${esc(`${t('examOpen')} · ${modelNumber(model)} · ${modelTitle(model)}`)}"`)}
        </div></article>`;
  };
  const extra = models.filter(model => model !== added);
  const activeDrafts = extra.filter(model => app.state.modelExams[model.id]?.schreiben?.writing?.trim());
  const level = currentLevel(app.state);
  const head = `<section class="simple-banner practice-head"><h1>${t('examTrainerTitle')}</h1><p>${t('examTrainerIntro')}</p></section>`;
  if (!levelHasContent(level)) return head + levelSoonCard(level);
  const progress = testsProgress(app.ctx, app.state);
  const percent = Math.round((progress.done / Math.max(1, progress.total)) * 100);
  const first = added || models[0];
  return `${head}
    ${resumeCard({ stop: stopFor(app, 'tests'), empty: { title: esc(`${modelNumber(first)} · ${modelTitle(first)}`), action: link(`${routeFor(first)}/lesen-1`, t('startHere'), 'primary') } })}
    <div class="area-progress"><span>${t('testsDone', num(progress.done), num(progress.total))}</span><span class="bar" aria-hidden="true"><i style="inline-size:${percent}%"></i></span></div>
    ${added ? card(added, true) : ''}${activeDrafts.length ? `<div class="study-grid exam-catalog">${activeDrafts.map(model => card(model)).join('')}</div>` : ''}
    <details class="panel modes-panel"><summary>${t('allModels', num(extra.length - activeDrafts.length))}</summary>
      <div class="study-grid exam-catalog">${extra.filter(model => !activeDrafts.includes(model)).map(model => card(model)).join('')}</div></details>
    <p class="study-followup"><a href="https://www.telc.net/sprachpruefungen/deutsch/zertifikat-deutsch-telc-deutsch-b1/" target="_blank" rel="noopener">${t('officialExam')}</a></p>`;
}

const groups = [['lesen', 'examGroupRead'], ['sprache', 'examGroupLang'], ['hoeren', 'examGroupListen'], ['schreiben', 'examGroupWrite']];

function menu(app, model, current, sample) {
  return `<nav class="exam-menu" aria-label="${t('examParts')}">${groups.map(([prefix, label]) => `
    <section class="exam-menu-section">${prefix === 'schreiben' ? '' : `<h2>${t(label)}</h2>`}<ul>${model.sections.filter(section => section.id.startsWith(prefix)).map(section => {
      const draft = savedSection(app, model, section);
      const status = !isListening(section) && draft.checked ? t('examChecked') : hasWork(draft) ? t('examInProgress') : '';
      return `<li><a href="#${routeFor(model, section)}" ${current === section.id ? 'aria-current="location"' : ''}>
        <span>${partTitle(section)}</span>${status ? `<small>${status}</small>` : ''}</a></li>`;
    }).join('')}</ul></section>`).join('')}
    ${sample ? `<section class="exam-menu-section"><h2>${t('independentExam')}</h2><ul>
      ${[['audio-practice', 'listeningSample'], ['speaking-practice', 'speakingSample']].map(([id, label]) =>
        `<li><a href="#${routeFor(model, { id })}" ${current === id ? 'aria-current="location"' : ''}>${t(label)}</a></li>`).join('')}
    </ul></section>` : ''}</nav>`;
}

export function render(app, route) {
  const model = app.ctx.modelTests.get(route.key);
  if (!model) return list(app);
  const section = model.sections.find(part => part.id === route.section);
  const sample = app.ctx.learning.examSample?.model === model.id ? app.ctx.learning.examSample : null;
  const sampleRoute = route.section === 'audio-practice' || route.section === 'speaking-practice';
  const name = esc(modelTitle(model));
  const navigation = menu(app, model, route.section, sample);
  const writing = section?.id === 'schreiben';
  const heading = section ? partTitle(section) : sampleRoute ? t(route.section === 'audio-practice' ? 'listeningSample' : 'speakingSample') : name;
  const layout = writing
    ? `<details class="exam-writing-navigation">
        <summary>${t('examParts')}</summary>
        ${navigation}
      </details>
      ${renderWriting(app, model, section, sample)}`
    : `<div class="exam-layout ${section || sampleRoute ? 'with-part' : ''}">${navigation}
      ${section ? renderPart(app, model, section) : sampleRoute && sample ? renderSample(route.section, sample) : `<section class="panel exam-overview"><h2>${t('examCoverage')}</h2>${coverage(sample)}${link(`${routeFor(model)}/lesen-1`, t('examOpen'), 'primary')}${savedSection(app, model, { id: 'schreiben' }).writing?.trim() ? link(`${routeFor(model)}/schreiben`, t('resumeWriting')) : ''}</section>`}</div>`;
  return `${crumbs([writing ? ['schreiben', t('navWriting')] : ['model-exams', t('examTrainerNav')], [section || sampleRoute ? routeFor(model) : null, name], ...(section || sampleRoute ? [[null, heading]] : [])])}
    <section class="simple-banner practice-head${writing ? ' exam-writing-heading' : ''}"><h1>${heading}</h1>
      <p>${section || sampleRoute ? `${modelNumber(model)} · ${name}` : modelNumber(model)}</p></section>
    ${layout}`;
}

function renderWriting(app, model, section, sample) {
  const { intro, greeting, body, closing, instruction, points, notes } = section.writing;
  const reply = savedSection(app, model, section).writing || '';
  const expected = sample ? expectedWords({ model: sample.writingReply.join(' ') }) : 100;
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
        <section class="panel exam-writing-editor writing-editor" aria-labelledby="exam-writing-label">
          <div class="exam-writing-editor-header">
            <h2><label id="exam-writing-label" for="exam-writing">${t('examWritten')}</label></h2>
          </div>
          <textarea id="exam-writing" maxlength="30000" lang="de" dir="ltr" aria-describedby="exam-writing-instruction exam-writing-storage exam-writing-meter">
${esc(reply)}</textarea>
          ${writingMeter('exam-writing', expected, reply)}
          <p id="exam-writing-storage" class="exam-writing-storage">${esc(w('expectedHelp'))} ${t('examWritingStorage')}</p>
        </section>
      </div>
    </div>
    <details class="panel writing-review"><summary>${t('writingReview')}</summary>
      <ul>${t('writingCriteria').map(criterion => `<li>${esc(criterion)}</li>`).join('')}</ul>
      ${sample ? `<details><summary>${t('writingExample')}</summary><div lang="de" dir="ltr">${sample.writingReply.map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}</div></details>` : ''}
    </details>
  </div>`;
}

function renderSample(part, sample) {
  if (part === 'speaking-practice') return `<section class="panel exam-sample"><p>${t('speakingHow')}</p>
    <ol lang="de" dir="ltr">${sample.speaking.map(prompt => `<li>${esc(prompt)}</li>`).join('')}</ol></section>`;
  const { audio, items, transcript } = sample.listening;
  return `<section class="panel exam-sample"><p>${t('listenFirst')}</p>
    <audio controls preload="metadata" aria-label="${esc(t('listeningSample'))}" src="${esc(audio)}"></audio>
    ${items.map((item, i) => `<fieldset><legend lang="de" dir="ltr">${esc(item.prompt)}</legend>
      ${[['true', 'correctWord'], ['false', 'incorrectWord']].map(([value, label]) =>
        `<label><input type="radio" name="listening-${i}" value="${value}"> ${t(label)}</label>`).join('')}</fieldset>`).join('')}
    ${button('check-listening-sample', t('listeningCheck'), 'primary')}
    <div id="listening-result" tabindex="-1" aria-live="polite"></div>
    <details><summary>${t('examTranscript')}</summary><p lang="de" dir="ltr">${esc(transcript)}</p></details></section>`;
}

const isGapText = section => section.id.startsWith('sprache-');

// The text of a part. In Sprachbausteine the gaps are filled in place: part 1
// with a dropdown per gap, part 2 by dragging words from the list.
function renderPassage(section, responses = {}, checked = false) {
  const gapText = isGapText(section);
  const gap = number => {
    const item = section.items.find(entry => entry.number === number);
    if (!gapText || !item) return `<strong class="exam-gap">${num(number)}</strong>`;
    const choices = examChoices(section, item);
    const value = responses[number];
    if (checked) {
      const right = value === item.answer;
      return `<span class="exam-filled ${right ? 'good' : 'bad'}"><small aria-hidden="true">${num(number)}</small>${value ? (right ? esc(choices[value]) : `<s>${esc(choices[value])}</s>`) : '—'}${right ? '' : ` <b>${esc(choices[item.answer])}</b>`}</span>`;
    }
    if (isMatching(section)) return dropGap({ key: String(number), number, value, label: value ? choices[value] : '' });
    return `<span class="gap-slot"><span class="gap-no" aria-hidden="true">${num(number)}</span><select data-exam-item="${number}" aria-label="${esc(t('blank', num(number)))}">
      <option value="">—</option>${Object.entries(choices).map(([code, label]) => `<option value="${esc(code)}" ${value === code ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></span>`;
  };
  return section.passage?.map(line => `<p>${line.split(/(\{\d+\})/g).map(piece => /^\{\d+\}$/.test(piece)
    ? gap(Number(piece.slice(1, -1))) : esc(piece)).join('')}</p>`).join('') || '';
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
  const gapText = isGapText(section);
  const draftResponses = draft.responses || {};
  const passage = renderPassage(section, draftResponses, draft.checked && examResult(section, draftResponses).total > 0);
  const used = new Set(Object.values(draftResponses));
  const bank = section.choices && gapText && !draft.checked
    ? wordChips(Object.entries(section.choices).map(([value, label]) => [value, label, used.has(value)]), t('wordBank'))
    : section.choices ? `<ul class="exam-bank" lang="de" dir="ltr">${Object.entries(section.choices).map(([value, label]) => `<li><b>${value.toUpperCase()}</b> ${esc(label)}</li>`).join('')}</ul>` : '';
  const { responses = {} } = draft;
  const score = examResult(section, responses);
  const checked = score.total > 0 && draft.checked;
  const exercise = `${gapText && !checked ? '' : `<div class="exam-questions">${section.items.map(item => renderItem(section, item, responses, checked)).join('')}</div>`}
    ${score.total ? `<div class="actions study-actions">${button(checked ? 'exam-edit' : 'exam-check', t(checked ? 'examPracticeAgain' : 'examCheck'), 'primary')}</div>` : ''}`;
  const tip = section.ads ? 'examMatchAds' : 'examMatchHelp';
  return `<div class="exam-part">
      ${listening ? `<p class="notice">${t('examNoAudio')}</p>` : ''}
      ${isMatching(section) && !checked && !gapText ? `<p class="study-meta">${t(tip)}</p>` : ''}
      ${section.ads ? renderAds(section.ads) : ''}
      <section class="panel exam-paper">
        ${checked ? `<h2 id="exam-result" tabindex="-1">${t('examScore', num(score.correct), num(score.total))}</h2>` : ''}
        ${gapText && !checked && isMatching(section) ? `<div class="drag-layout">${bank}<div class="exam-passage gap-text" lang="de" dir="ltr">${passage}</div></div>${exercise}`
          : `${passage ? `<div class="exam-passage ${gapText ? 'gap-text' : ''}" lang="de" dir="ltr">${passage}</div>` : ''}${bank}${exercise}`}
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
  updateWritingMeter(input);
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
  const section = app.ctx.modelTests.get(app.route.key).sections.find(part => part.id === app.route.section);
  updateDraft(app, draft => {
    if (isReading(section)) {
      if (checked) delete draft.readingResult;
      else if (draft.checked) draft.readingResult = lastReadingResult(section, draft);
    }
    draft.checked = checked;
  });
  app.rerender({ keepScroll: false });
  document.querySelector(checked ? '#exam-result' : '[data-exam-item]')?.focus();
}

export const actions = {
  'exam-check': app => check(app, true),
  'exam-edit': app => check(app, false),
  'check-listening-sample'(app) {
    const items = app.ctx.learning.examSample.listening.items;
    const answers = items.map((item, i) => document.querySelector(`[name="listening-${i}"]:checked`)?.value);
    const result = document.querySelector('#listening-result');
    const missing = answers.findIndex(answer => answer === undefined);
    if (missing !== -1) {
      result.textContent = t('listeningComplete');
      document.querySelector(`[name="listening-${missing}"]`)?.focus();
      return;
    }
    const right = items.filter((item, i) => item.answer === answers[i]).length;
    app.store.update(state => { state.listeningSample = { correct: right, total: items.length }; });
    result.innerHTML = `<p><strong>${t('examScore', num(right), num(items.length))}</strong></p><ol>${items.map((item, i) =>
      `<li class="exam-mark ${item.answer === answers[i] ? 'good' : 'bad'}">${t(item.answer === 'true' ? 'correctWord' : 'incorrectWord')} · ${de(item.quote)}</li>`).join('')}</ol>`;
    result.focus();
  }
};

// Sprachbausteine part 2: drag words from the list into the gaps.
export function mount(app, root, route) {
  const editor = root.querySelector('#exam-writing');
  if (editor) updateWritingMeter(editor);
  const model = app.ctx.modelTests.get(route.key);
  const section = model?.sections.find(part => part.id === route.section);
  if (!section || !isGapText(section) || !isMatching(section)) return null;
  const write = (key, value, keyboard) => {
    updateDraft(app, draft => {
      const responses = draft.responses ||= {};
      for (const [number, answer] of Object.entries(responses)) if (value && answer === value) delete responses[number];
      if (value) responses[key] = value;
      else delete responses[key];
    });
    app.rerender();
    if (keyboard) focusAfterPlacing(document.querySelector('#content'), key);
  };
  return mountDragDrop(root, { place: write, clear: (key, keyboard) => write(key, '', keyboard) });
}
