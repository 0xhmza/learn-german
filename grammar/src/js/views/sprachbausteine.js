import { t, num, getLang } from '../i18n/index.js';
import { lessonTitle } from '../content.js';
import { esc, de, prose, link, button, crumbs } from '../components/html.js';

export const title = (app, route) => app.ctx.sprachbausteine.get(route.key)?.title[getLang()] ?? t('sprachTitle');

function attempt(set, state) {
  return state.sprach[set.id] || { answers: set.gaps.map(() => ''), finished: false };
}

const gapNumber = (set, index) => (set.bank ? 31 : 21) + index;

export function render(app, route) {
  const { ctx, state } = app;
  const lang = getLang();
  const set = ctx.sprachbausteine.get(route.key);
  if (!set) {
    return `${crumbs([['practice', t('practice')], [null, prose(t('sprachTitle'))]])}
      <section class="simple-banner practice-head"><h1>${prose(t('sprachTitle'))}</h1><p>${prose(t('sprachIntro'))}</p></section>
      <div class="study-grid">${[...ctx.sprachbausteine.values()].map(item => {
        const saved = attempt(item, state);
        const action = saved.finished ? t('showResult') : saved.answers.some(Boolean) ? t('resumeRun') : t('sprachStart');
        return `<article class="panel study-tile"><span class="study-meta">${t(item.bank ? 'sprachPart2' : 'sprachPart1')} · ${t('difficulty')[item.difficulty]}</span>
          <h2>${prose(item.title[lang])}</h2><p>${prose(item.summary[lang])}</p>${link(`sprachbausteine/${item.id}`, action)}</article>`;
      }).join('')}</div>`;
  }
  const { answers, finished } = attempt(set, state);
  const correct = set.gaps.filter((gap, index) => gap.answer === answers[index]).length;
  const bank = set.bank?.map((word, i) => `<li data-bank-word="${esc(word)}" class="${!finished && answers.includes(word) ? 'used' : ''}"><small aria-hidden="true">${String.fromCharCode(97 + i)}</small> ${esc(word)}</li>`).join('');
  return `${crumbs([['practice', t('practice')], ['sprachbausteine', prose(t('sprachTitle'))], [null, prose(set.title[lang])]])}
    <section class="simple-banner practice-head"><span class="study-meta">${t(set.bank ? 'sprachPart2' : 'sprachPart1')} · ${t('difficulty')[set.difficulty]}</span>
      <h1>${prose(set.title[lang])}</h1><p>${t(set.bank ? 'sprachBankHelp' : 'sprachChoiceHelp')}</p></section>
    <section class="panel study-page">
      ${finished ? `<h2 id="sprach-result" tabindex="-1">${t('sprachScore', num(correct), num(set.gaps.length))}</h2>` : ''}
      ${bank ? `<div class="sprach-bank"><h2>${t('wordBank')}</h2><ul lang="de" dir="ltr">${bank}</ul></div>` : ''}
      <div class="sprach-text" lang="de" dir="ltr">${set.paragraphs.map(paragraph => `<p>${paragraph.split(/(\{\d+\})/g).map((part, position, parts) => {
        if (!/^\{\d+\}$/.test(part)) return esc(part);
        const i = Number(part.slice(1, -1)) - 1;
        const gap = set.gaps[i];
        const number = gapNumber(set, i);
        if (finished) {
          const before = parts[position - 1].trimEnd();
          const startsSentence = !before || /[.!?]$/.test(before);
          const word = startsSentence ? gap.answer[0].toLocaleUpperCase('de') + gap.answer.slice(1) : gap.answer;
          return `<a href="#sprach-feedback-${number}" data-action="gap-feedback" data-gap="${number}" class="sprach-solution ${answers[i] === gap.answer ? 'good' : 'bad'}"><small aria-hidden="true">${number}</small> ${esc(word)}</a>`;
        }
        const options = (set.bank || gap.options).map((word, j) => `<option value="${esc(word)}" ${word === answers[i] ? 'selected' : ''} ${set.bank && answers[i] !== word && answers.includes(word) ? 'disabled' : ''}>${String.fromCharCode(97 + j)} · ${esc(word)}</option>`).join('');
        return `<label class="sprach-gap"><span aria-hidden="true">${number}</span><select data-sprach-gap="${i}" aria-label="${esc(t('blank', num(number)))}" required><option value="">—</option>${options}</select></label>`;
      }).join('')}</p>`).join('')}</div>
      <div class="actions study-actions">${finished ? button('sprach-reset', t('newRun'), 'primary') : button('sprach-check', t('check'), 'primary')}</div>
      <p id="sprach-status" class="study-status" role="status"></p>
    </section>
    ${finished ? `<section class="panel study-page study-followup"><h2>${t('answersTitle')}</h2>${set.gaps.map((gap, i) => `<section class="sprach-feedback" id="sprach-feedback-${gapNumber(set, i)}" tabindex="-1">
      <h3>${num(gapNumber(set, i))} · ${de(gap.answer)}</h3>
      <p class="${answers[i] === gap.answer ? 'sprach-good' : 'sprach-bad'}">${answers[i] === gap.answer ? t('correct') : `${t('yourAnswer')} · ${de(answers[i])}`}</p>
      <p>${prose(gap.explain[lang])}</p>${gap.lesson ? `<a href="#lesson/${gap.lesson}">${prose(lessonTitle(ctx.lessons.get(gap.lesson), lang))}</a>` : ''}
    </section>`).join('')}</section>` : ''}`;
}

export const actions = {
  'sprach-check'(app) {
    const incomplete = document.querySelector('[data-sprach-gap]:invalid');
    if (incomplete) {
      incomplete.reportValidity();
      const status = document.querySelector('#sprach-status');
      if (status) status.textContent = t('sprachIncomplete');
      return;
    }
    const set = app.ctx.sprachbausteine.get(app.route.key);
    app.store.update(state => { state.sprach[set.id].finished = true; });
    app.rerender({ keepScroll: false });
    document.querySelector('#sprach-result')?.focus();
  },
  'sprach-reset'(app) {
    app.store.update(state => { delete state.sprach[app.route.key]; });
    app.rerender();
    document.querySelector('[data-sprach-gap]')?.focus();
  },
  'gap-feedback'(app, target) {
    document.getElementById(`sprach-feedback-${target.dataset.gap}`)?.focus();
  }
};

export function onChange(app, event) {
  const select = event.target;
  if (!select.matches('[data-sprach-gap]')) return;
  const set = app.ctx.sprachbausteine.get(app.route.key);
  const data = app.store.update(state => {
    const current = state.sprach[set.id] ||= attempt(set, state);
    current.answers[Number(select.dataset.sprachGap)] = select.value;
    return current;
  });
  const status = document.querySelector('#sprach-status');
  if (status) status.textContent = '';
  if (!set.bank) return;
  for (const control of document.querySelectorAll('[data-sprach-gap]')) {
    for (const option of control.options) {
      option.disabled = Boolean(option.value && option.value !== control.value && data.answers.includes(option.value));
    }
  }
  for (const word of document.querySelectorAll('[data-bank-word]')) word.classList.toggle('used', data.answers.includes(word.dataset.bankWord));
}
