// Settings: language, theme, daily goal, level, motion, backup,
// restore and resets.
import { t, num, getLang } from '../i18n/index.js';
import { currentLevel, LEVELS } from '../engine/areas.js';
import { DAILY_GOALS } from '../engine/gamification.js';
import { defaultState, normalizeState, exportBackup, importBackup, importLegacyExport } from '../engine/migrate.js';
import { esc, button, prose } from '../components/html.js';

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
  const { state } = app;
  const lang = getLang();
  const theme = app.themeMode();
  const option = (value, label, current) => `<option value="${value}" ${String(current) === String(value) ? 'selected' : ''}>${esc(label)}</option>`;
  const level = currentLevel(state);
  const levels = LEVELS.filter(id => id !== 'C2' || id === level);
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
        <select id="set-level" lang="de" dir="ltr" data-setting="level">${levels.map(id => option(id, id, level)).join('')}</select></label></section>
      <section class="panel"><label class="check-field"><input type="checkbox" data-setting="motion" ${state.settings.reduceMotion ? 'checked' : ''}><span><strong>${t('setMotion')}</strong><small>${t('setMotionText')}</small></span></label></section>
    </div>
    <div class="section-heading"><h2>${t('dataTitle')}</h2></div>
    <div class="settings-grid">
      <section class="panel"><h3>${t('backup')}</h3><p class="muted">${prose(t('backupText'))}</p><div class="actions">${button('backup', t('backup'), 'primary')}</div></section>
      <section class="panel"><h3>${t('restore')}</h3><p class="muted">${prose(t('restoreText'))}</p>
        <label class="btn secondary file-btn">${t('restore')}<input type="file" accept="application/json,.json" data-setting="restore" class="sr-only"></label></section>
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
  if (setting === 'level' && app.setLevel(target.value)) document.querySelector('#set-level')?.focus({ preventScroll: true });
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
