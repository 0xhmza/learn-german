// The level picker and the Vokabeln and Schreiben pages. Only B1 has
// content so far: grammar, writing tasks and the telc exam trainer.
import { t, num, getLang } from '../i18n/index.js';
import { CEFR } from '../cefr.js';
import { islandName } from '../content.js';
import { currentLevel, levelHasContent, writingTasks, writingProgress, vocabProgress } from '../engine/areas.js';
import { resumeCard, levelSoonCard } from '../components/widgets.js';
import { stopFor } from '../components/stops.js';
import { icons } from '../components/icons.js';
import { esc, prose, link, button, crumbs, formatDay } from '../components/html.js';
import { wordList, removeWord } from '../engine/words.js';

const art = {
  vocab: `<svg viewBox="0 0 160 120" aria-hidden="true"><rect x="38" y="22" width="76" height="86" rx="10" fill="var(--t-sky)" transform="rotate(-8 76 65)"/>
    <rect x="48" y="16" width="76" height="86" rx="10" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="2"/>
    <rect x="60" y="34" width="40" height="8" rx="4" fill="var(--brand)"/><rect x="60" y="52" width="52" height="6" rx="3" fill="var(--line-strong)"/>
    <rect x="60" y="66" width="34" height="6" rx="3" fill="var(--line-strong)"/><circle cx="118" cy="96" r="16" fill="#ffd54a"/><path d="M111 96h14M118 89v14" stroke="#7a5a00" stroke-width="3" stroke-linecap="round"/></svg>`,
  writing: `<svg viewBox="0 0 160 120" aria-hidden="true"><rect x="30" y="14" width="86" height="96" rx="10" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="2"/>
    <rect x="44" y="32" width="50" height="7" rx="3.5" fill="var(--brand)"/><rect x="44" y="50" width="58" height="5" rx="2.5" fill="var(--line-strong)"/>
    <rect x="44" y="62" width="48" height="5" rx="2.5" fill="var(--line-strong)"/><rect x="44" y="74" width="54" height="5" rx="2.5" fill="var(--line-strong)"/>
    <path d="M104 98 136 60l10 9-32 37-13 4z" fill="#ffd54a" stroke="#7a5a00" stroke-width="2.5" stroke-linejoin="round"/></svg>`
};

function levelRows(kind) {
  return `<ul class="soon-list">${CEFR.map(level => `<li class="soon-row">
    <span class="level-code small ${level.tone}" lang="de" dir="ltr">${level.id}</span>
    <span class="soon-text"><strong>${esc(t('levelNames')[level.id])}</strong><small>${t(kind === 'vocab' ? 'vocabEmpty' : 'writingEmpty')}</small></span>
    <span class="soon-chip">${t('comingSoon')}</span></li>`).join('')}</ul>`;
}

function area(kind, extra = '') {
  const vocab = kind === 'vocab';
  return `<section class="area-hero ${vocab ? 'sky' : 'peach'}">
      <span class="area-icon" aria-hidden="true">${vocab ? icons.vocab : icons.writing}</span>
      <div><h1>${t(vocab ? 'navVocab' : 'navWriting')}</h1><p>${t(vocab ? 'vocabIntro' : 'writingIntro')}</p></div>
    </section>
    ${extra}
    <div class="area-grid">
      <section class="panel empty-state">
        <div class="empty-art">${art[kind]}</div>
        <h2>${t(vocab ? 'vocabEmpty' : 'writingEmpty')}</h2>
        <p>${t(vocab ? 'vocabEmptyText' : 'writingEmptyText')}</p>
        ${vocab ? link('cards', t('vocabBridge'), 'secondary') : link('model-exams/petra/schreiben', t('writingBridge'), 'secondary')}
      </section>
      <section class="panel"><h2>${t('levelsTitle')}</h2>${levelRows(kind)}</section>
    </div>`;
}

// The learner's saved words, newest first.
function myWords(app) {
  const words = wordList(app.state);
  const list = words.length
    ? `<ul class="my-words" lang="de" dir="ltr">${words.map(([word, day]) => `<li>
        <span class="my-word">${esc(word)}</span><small lang="${getLang()}" dir="auto">${esc(formatDay(day, { day: 'numeric', month: 'short' }))}</small>
        <button type="button" class="icon-btn word-remove" data-action="word-remove" data-word="${esc(word)}" aria-label="${esc(t('wordRemove', word))}" title="${esc(t('wordRemove', word))}">${icons.close}</button>
      </li>`).join('')}</ul>`
    : `<p class="muted">${t('myWordsEmpty')}</p>`;
  return `<section class="panel my-words-panel" aria-labelledby="my-words-title">
      <div class="section-row"><h2 id="my-words-title">${t('myWords')} <span class="count-chip">${num(words.length)}</span></h2>
        ${words.length ? button('words-copy', t('wordsCopy'), 'quiet') : ''}</div>
      <p class="muted my-words-how">${t('myWordsHow')}</p>
      ${list}
    </section>`;
}

export const vocab = {
  title: () => t('navVocab'),
  render(app) {
    const { last, words } = vocabProgress(app.state);
    const resume = last ? resumeCard({ eyebrow: t('lastWordSaved'), stop: {
      title: `<bdi lang="de" dir="ltr">${esc(last.word)}</bdi>`,
      meta: `${t('lastOn', formatDay(last.day, { day: 'numeric', month: 'long' }))} · ${t('wordsSavedCount', num(words))}`,
      action: ''
    } }) : '';
    return area('vocab', resume + myWords(app));
  },
  actions: {
    'word-remove'(app, target) {
      const word = target.dataset.word;
      app.store.update(state => removeWord(state, word));
      app.rerender();
      document.querySelector('.word-remove')?.focus({ preventScroll: true });
    },
    async 'words-copy'(app, target) {
      const text = wordList(app.state).map(([word]) => word).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        target.textContent = t('wordsCopied');
      } catch {
        target.textContent = t('wordsCopyFailed');
      }
    }
  }
};

// Schreiben: where the learner stopped, then every writing task with its
// status: the everyday task of each grammar island and the writing part of
// each mock exam.
function writingPage(app) {
  const { ctx, state } = app;
  const lang = getLang();
  const level = currentLevel(state);
  const hero = `<section class="area-hero peach">
      <span class="area-icon" aria-hidden="true">${icons.writing}</span>
      <div><h1>${t('navWriting')}</h1><p>${t('writingIntro')}</p></div>
    </section>`;
  if (!levelHasContent(level)) return hero + levelSoonCard(level);
  const { exams, everyday } = writingTasks(ctx, state);
  const progress = writingProgress(ctx, state);
  const percent = Math.round((progress.done / Math.max(1, progress.total)) * 100);
  const islandOf = task => ctx.islandById.get(task.id);
  const open = everyday.find(task => !task.done) || exams.find(task => !task.done);
  const startOpen = open && (open.kind === 'exam'
    ? { title: esc(`${t('examModel', num(open.model.number))} · ${open.model.title[lang]}`), action: link(open.hash, t('startHere'), 'primary') }
    : { title: prose(open.task[lang]), action: button('run', t('startHere'), 'primary', `data-key="${open.key}"`) });
  const status = done => `<span class="task-status ${done ? 'done' : ''}">${done ? `${icons.check}${t('taskDone')}` : t('topicNew')}</span>`;
  return `${hero}
    ${resumeCard({ stop: stopFor(app, 'writing'), empty: startOpen ? { title: startOpen.title, action: startOpen.action } : { title: t('studyCaughtUp') } })}
    <div class="area-progress"><span>${t('writingDone', num(progress.done), num(progress.total))}</span><span class="bar" aria-hidden="true"><i style="inline-size:${percent}%"></i></span></div>
    <section class="panel task-panel" aria-labelledby="everyday-tasks">
      <h2 id="everyday-tasks">${t('writingEverydayTasks')}</h2>
      <ul class="task-list">${everyday.map(task => `<li class="task-row">
        <span class="sum-emoji ${islandOf(task).palette}" aria-hidden="true">${islandOf(task).emoji}</span>
        <span class="task-main"><strong>${esc(islandName(islandOf(task), lang))}</strong><small>${prose(task.task[lang])}</small></span>
        ${status(task.done)}${button('run', t(task.done ? 'writeAgain' : 'startHere'), task.done ? 'quiet' : 'secondary', `data-key="${task.key}"`)}
      </li>`).join('')}</ul>
    </section>
    <section class="panel task-panel" aria-labelledby="exam-tasks">
      <h2 id="exam-tasks">${t('writingExamTasks')}</h2>
      <ul class="task-list">${exams.map(task => `<li class="task-row">
        <span class="task-number" aria-hidden="true">${num(task.model.number)}</span>
        <span class="task-main"><strong>${esc(task.model.title[lang])}</strong><small>${esc(t('examModel', num(task.model.number)))}</small></span>
        <span class="task-status ${task.done ? 'draft' : ''}">${task.done ? t('taskDraft') : t('topicNew')}</span>
        ${link(task.hash, t(task.done ? 'resumeWriting' : 'startHere'), task.done ? 'quiet' : 'secondary')}
      </li>`).join('')}</ul>
    </section>`;
}

export const writing = {
  title: () => t('navWriting'),
  render: app => writingPage(app)
};

// Choosing the level. The dashboard, grammar, writing and exam pages follow
// the chosen level; progress on other levels is kept.
export const level = {
  title: () => t('levelPickTitle'),
  render(app, route) {
    const current = currentLevel(app.state);
    const options = CEFR.map(info => {
      const ready = levelHasContent(info.id);
      const isCurrent = info.id === current;
      return `<li><button type="button" class="level-option ${isCurrent ? 'current' : ''} ${route.key === info.slug ? 'focus' : ''}" data-action="pick-level" data-level="${info.id}" aria-pressed="${isCurrent}">
        <span class="level-code level-option-code ${info.tone}" lang="de" dir="ltr">${info.id}</span>
        <span class="level-option-text"><strong>${esc(t('levelNames')[info.id])}</strong><small>${esc(t('levelCan')[info.id])}</small>
          <span class="level-option-state ${ready ? 'ready' : ''}">${ready ? t('levelAvailable') : t('comingSoon')}</span></span>
        ${isCurrent ? `<span class="level-option-check">${icons.check}<span>${t('currentLevel')}</span></span>` : ''}
      </button></li>`;
    }).join('');
    return `${crumbs([['home', t('tabHome')], [null, t('levelPickTitle')]])}
      <section class="page-head"><h1>${t('levelPickTitle')}</h1><p>${t('levelPickIntro')}</p></section>
      <ul class="level-options">${options}</ul>`;
  },
  actions: {
    'pick-level'(app, target) {
      const chosen = target.dataset.level;
      app.store.update(state => { state.settings.level = chosen; });
      app.notify(t('levelChosen', chosen));
      app.navigate('home');
    }
  }
};
