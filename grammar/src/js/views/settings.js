// Settings: language, theme, daily goal, level filter, motion, backup,
// restore and resets.
import { t, num, getLang } from '../i18n/index.js';
import { lessonTitle, islandName } from '../content.js';
import { DAILY_GOALS } from '../engine/gamification.js';
import { defaultState, normalizeState, exportBackup, importBackup, importLegacyExport } from '../engine/migrate.js';
import { esc, button, plainText, prose } from '../components/html.js';

export const title = () => t('settings');

export function downloadBackup(app) {
  const data = exportBackup(app.state, app.ctx);
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Grammatikinseln-${app.day()}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let message = '';

export function render(app) {
  const { ctx, state } = app;
  const lang = getLang();
  const theme = app.themeMode();
  const option = (value, label, current) => `<option value="${value}" ${String(current) === String(value) ? 'selected' : ''}>${esc(label)}</option>`;
  const lessons = ctx.islands.map(island => `<optgroup label="${esc(islandName(island, lang))}">${ctx.islandLessons(island.id)
    .map(lesson => option(lesson.id, plainText(lessonTitle(lesson, lang)), '')).join('')}</optgroup>`).join('');
  const shown = message;
  message = '';
  return `
    <section class="simple-banner practice-head"><h1>${t('settingsTitle')}</h1><p>${t('settingsText')}</p></section>
    <p id="settings-status" class="${shown ? 'notice' : 'sr-only'}" role="status">${esc(shown)}</p>
    <div class="settings-grid">
      <section class="panel"><h2>${t('setLang')}</h2>
        <div class="seg big" role="group" aria-label="${esc(t('setLang'))}">
          <button type="button" data-action="lang" data-value="ar" lang="ar" aria-pressed="${lang === 'ar'}">العربية</button>
          <button type="button" data-action="lang" data-value="de" lang="de" aria-pressed="${lang === 'de'}">Deutsch</button>
        </div>
      </section>
      <section class="panel"><label class="field" for="set-theme"><span>${t('setTheme')}</span>
        <select id="set-theme" data-setting="theme">${option('auto', t('themeAuto'), theme)}${option('light', t('themeLight'), theme)}${option('dark', t('themeDark'), theme)}</select></label></section>
      <section class="panel"><label class="field" for="set-goal"><span>${t('setGoal')}</span>
        <select id="set-goal" data-setting="goal">${DAILY_GOALS.map(goal => option(goal, t('goalOpt', num(goal)), state.settings.dailyGoal)).join('')}</select></label></section>
      <section class="panel"><label class="field" for="set-level"><span>${t('setLevel')}</span>
        <select id="set-level" data-setting="level">${option('all', t('filterAll'), state.settings.levelFilter)}${ctx.levels.map(level => option(level.id, level.id, state.settings.levelFilter)).join('')}</select></label>
        <p class="muted">${t('setLevelText')}</p></section>
      <section class="panel"><label class="check-field"><input type="checkbox" data-setting="motion" ${state.settings.reduceMotion ? 'checked' : ''}><span><strong>${t('setMotion')}</strong><small>${t('setMotionText')}</small></span></label></section>
    </div>
    <div class="section-heading"><h2>${t('dataTitle')}</h2></div>
    <div class="settings-grid">
      <section class="panel"><h3>${t('backup')}</h3><p class="muted">${prose(t('backupText'))}</p><div class="actions">${button('backup', t('backup'), 'primary')}</div></section>
      <section class="panel"><h3>${t('restore')}</h3><p class="muted">${prose(t('restoreText'))}</p>
        <label class="btn secondary file-btn">${t('restore')}<input type="file" accept="application/json,.json" data-setting="restore" class="sr-only"></label></section>
      <section class="panel"><h3>${t('resetLesson')}</h3><p class="muted">${t('resetLessonText')}</p>
        <div class="form-row"><label for="reset-lesson">${t('chooseLesson')}<select id="reset-lesson">${lessons}</select></label>${button('reset-lesson', t('resetLessonBtn'))}</div></section>
      <section class="panel danger"><h3>${t('resetAll')}</h3><p class="muted">${t('resetAllText')}</p>
        <div class="form-row"><label for="reset-word">${t('resetConfirm', t('resetWord'))}<input id="reset-word" class="text-input" autocomplete="off" data-setting="reset-word"></label>
        ${button('reset-all', t('resetAll'), 'danger', 'disabled')}</div></section>
    </div>`;
}

function say(app, text) {
  message = text;
  app.rerender();
  document.querySelector('#settings-status')?.focus?.();
}

export const actions = {
  lang: (app, target) => app.setLanguage(target.dataset.value),
  backup: app => downloadBackup(app),
  'reset-lesson'(app) {
    const id = document.querySelector('#reset-lesson').value;
    const lesson = app.ctx.lessons.get(id);
    app.store.update(state => {
      delete state.completed[id];
      delete state.viewed[id];
      delete state.transfer[id];
      delete state.stars[id];
      delete state.lessonBonus[id];
      delete state.runs[id];
      delete state.runs[`apply-${id}`];
      delete state.runs[`quick-${id}`];
      delete state.runs[`repair-${id}`];
      delete state.runs[`write-${id}`];
      if (state.runs.daily?.ids.some(questionId => app.ctx.questions.get(questionId)?.lesson === id)) delete state.runs.daily;
      delete state.results[`apply-${id}`];
      delete state.results[`write-${id}`];
      for (const q of lesson.questions) delete state.results[q.id];
      for (const card of app.ctx.cards.values()) if (card.lesson === id) delete state.cards[card.id];
      if (!state.runs[state.lastRun]) state.lastRun = null;
    });
    say(app, t('resetLessonDone'));
  },
  'reset-all'(app) {
    if (document.querySelector('#reset-word').value.trim() !== t('resetWord')) return;
    const fresh = normalizeState(defaultState(app.day()), app.ctx, app.day());
    fresh.settings = { ...app.state.settings };
    app.store.replace(fresh);
    say(app, t('resetDone'));
  }
};

export function onInput(app, event) {
  if (event.target.dataset.setting === 'reset-word') {
    document.querySelector('[data-action="reset-all"]').disabled = event.target.value.trim() !== t('resetWord');
  }
}

export async function onChange(app, event) {
  const target = event.target;
  const setting = target.dataset.setting;
  if (setting === 'theme') app.setTheme(target.value);
  if (setting === 'goal') app.store.update(state => { state.settings.dailyGoal = Number(target.value); });
  if (setting === 'level') app.store.update(state => { state.settings.levelFilter = target.value; });
  if (setting === 'motion') app.store.update(state => { state.settings.reduceMotion = target.checked; });
  if (setting === 'restore' && target.files?.[0]) {
    let text = '';
    try {
      const json = JSON.parse(await target.files[0].text());
      if (json?.app === 'grammatikinseln') {
        app.store.replace(importBackup(json, app.ctx, app.day()));
        text = t('restoreBackupDone');
      } else {
        const count = app.store.update(state => importLegacyExport(json, app.ctx, state, app.day()));
        text = t('restoreDone', num(count));
      }
    } catch {
      text = t('restoreFail');
    }
    say(app, text);
  }
}
