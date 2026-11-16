import { t, getLang } from '../i18n/index.js';
import { lessonTitle } from '../content.js';
import { esc, de, prose, link, crumbs } from '../components/html.js';
import { readingWords } from '../reading-words.js';

export const title = (app, route) => app.ctx.readings.get(route.key)?.title[getLang()] ?? t('readingsTitle');

export function render(app, route) {
  const { ctx } = app;
  const reading = ctx.readings.get(route.key);
  const lang = getLang();
  if (!reading) {
    return `${crumbs([['practice', t('practice')], [null, prose(t('readingsTitle'))]])}
      <section class="simple-banner practice-head"><h1>${prose(t('readingsTitle'))}</h1><p>${t('readingsIntro')}</p></section>
      <div class="study-grid">${[...ctx.readings.values()].map(item => `<article class="panel study-tile">
        <h2>${prose(item.title[lang])}</h2>${lang === 'ar' ? `<p>${de(item.title.de)}</p>` : ''}
        <p>${prose(item.summary[lang])}</p>${link(`readings/${item.id}`, t('openReading'))}</article>`).join('')}</div>`;
  }
  return `${crumbs([['practice', t('practice')], ['readings', prose(t('readingsTitle'))], [null, prose(reading.title[lang])]])}
    <section class="simple-banner practice-head"><h1>${prose(reading.title[lang])}</h1><p>${prose(t('wordHelp'))}</p></section>
    <article class="panel study-page passage-panel" aria-label="${esc(reading.title[lang])}">
      ${lang === 'ar' ? `<h2 class="passage-title" lang="de" dir="ltr">${esc(reading.title.de)}</h2>` : ''}
      <div class="gloss-box" role="status" aria-live="polite" aria-atomic="true">
        <bdi id="gloss-word" dir="ltr" lang="de" hidden></bdi><span id="gloss-meaning" lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">${t('wordPlaceholder')}</span>
      </div>
      ${reading.paragraphs.map(({ de: line, ar }, paragraph) => {
        let index = 0;
        const words = readingWords(line, ctx.glossary).map(({ text, gloss }) => gloss
          ? `<button type="button" class="gloss-word" data-action="gloss" data-gloss="${esc(gloss)}" aria-pressed="false" tabindex="${index++ === 0 ? '0' : '-1'}">${esc(text)}</button>`
          : esc(text)).join('');
        return `<section class="passage-section"><p class="passage-text" lang="de" dir="ltr">${words}</p>
          <details class="passage-translation"><summary>${t('paragraphTranslation', paragraph + 1)}</summary><p lang="ar" dir="rtl">${esc(ar)}</p></details></section>`;
      }).join('')}
    </article>
    <section class="panel study-page study-followup"><h2>${t('readingCheck')}</h2>
      ${reading.checks.map(item => `<details class="result-row"><summary>${prose(item.prompt[lang])}</summary><p>${prose(item.answer[lang])}</p></details>`).join('')}
    </section>
    <section class="panel study-page study-followup"><h2>${t('readingRules')}</h2><ul class="study-rules">
      ${reading.lessons.map(id => `<li><a href="#lesson/${id}">${prose(lessonTitle(ctx.lessons.get(id), lang))}</a></li>`).join('')}</ul></section>`;
}

function showGloss(target) {
  const previous = document.querySelector('.gloss-word[aria-pressed="true"]');
  if (previous) previous.setAttribute('aria-pressed', 'false');
  const paragraph = target.closest('.passage-text');
  paragraph.querySelector('[tabindex="0"]').tabIndex = -1;
  target.tabIndex = 0;
  target.setAttribute('aria-pressed', 'true');
  const word = document.querySelector('#gloss-word');
  word.textContent = target.textContent;
  word.hidden = false;
  const meaning = document.querySelector('#gloss-meaning');
  meaning.lang = 'ar';
  meaning.dir = 'rtl';
  meaning.textContent = target.dataset.gloss;
}

export const actions = { gloss: (app, target) => showGloss(target) };

export function onKey(app, event) {
  const word = event.target.closest('.gloss-word');
  if (!word || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const words = [...word.closest('p').querySelectorAll('.gloss-word')];
  const next = words[words.indexOf(word) + (event.key === 'ArrowRight' ? 1 : -1)];
  if (next) {
    event.preventDefault();
    showGloss(next);
    next.focus();
  }
}
