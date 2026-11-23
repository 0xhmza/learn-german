// Visual and layout tests in a real browser, in German (LTR) and Arabic
// (RTL), on phone, tablet and desktop widths, light and dark.
//
//   npm run test:visual               check every screen, compare with baselines
//   npm run test:visual -- --update   accept the current screenshots as baselines
//   npm run test:visual -- --only=home,lesson
//
// Starts the dev server and a headless Chromium browser (Chrome, Edge, Brave
// or Chromium; set BROWSER=<path> to choose) with a temporary profile, and
// talks to it over the DevTools protocol. Every screen is loaded with the
// same seeded learner, checked in the page, and saved as a PNG. Results go
// to visual-report/index.html. Exits with 1 when a check fails.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir, platform } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server.js';
import { assembleContent } from './assemble-content.js';
import { indexContent } from '../src/js/content.js';
import { defaultState, normalizeState } from '../src/js/engine/migrate.js';
import { award } from '../src/js/engine/gamification.js';
import { addWord } from '../src/js/engine/words.js';
import { today, addDays } from '../src/js/dates.js';
import { decodePng, pixelDifference } from './png.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = path.join(root, 'visual-report');
const baselineDir = path.join(reportDir, 'baseline');
const args = process.argv.slice(2);
const update = args.includes('--update');
const only = args.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
const DIFF_LIMIT = 0.005;

const DEVICES = {
  phone: { width: 375, height: 812, mobile: true },
  tablet: { width: 900, height: 1100, mobile: false },
  desktop: { width: 1366, height: 900, mobile: false }
};

// [name, hash, steps run in the page before the checks, full-page capture]
const SCREENS = [
  ['home', 'home', null, true],
  ['home-reading-retake', 'model-exams/petra/lesen-1', 'reading-retake'],
  ['module', 'island/relativsaetze', null, true],
  ['topics', 'topics'],
  ['grammar', 'grammatik', null, true],
  ['levels', 'level'],
  ['home-b2', 'home', 'switch-b2'],
  ['vocab', 'vokabeln'],
  ['writing', 'schreiben'],
  ['listening', 'hoeren'],
  ['listening-practice', 'hoeren/treffpunkt', 'listen-practice', true],
  ['listening-check', 'hoeren/check-firma', 'listen-check', true],
  ['listening-library', 'hoeren/serien', 'listen-local'],
  ['writing-chapter', 'schreiben/persoenliche-mail'],
  ['writing-feedback', 'schreiben/besuch-planen', 'writing-feedback', true],
  ['writing-timed', 'schreiben/bereit', 'writing-timed-flow', true],
  ['writing-expired', 'schreiben/bereit', 'writing-expired-away'],
  ['writing-blank', 'schreiben/probe-bibliothek', 'writing-blank-mock'],
  ['writing-resume', 'home', 'resume-draft'],
  ['practice', 'practice'],
  ['exams', 'model-exams'],
  ['profile', 'progress', null, true],
  ['settings', 'settings'],
  ['lesson-intro', 'lesson/genitiv'],
  ['lesson-rule', 'lesson/genitiv', 'continue:1'],
  ['lesson-question', 'lesson/genitiv', 'continue:2'],
  ['lesson-wrong', 'lesson/genitiv', 'continue:2,wrong'],
  ['lesson-finish', 'lesson/genitiv', 'walk'],
  ['practice-question', 'practice/genitiv'],
  ['cards', 'cards/genitiv'],
  ['sprach-part1', 'sprachbausteine/bibliothek', 'choose:3'],
  ['sprach-part2', 'sprachbausteine/gartenverein', 'place:3'],
  ['exam-part1', 'model-exams/petra/sprache-1', 'choose:3'],
  ['exam-part2', 'model-exams/petra/sprache-2', 'place:3'],
  ['word-pick', 'lesson/genitiv', 'pick']
];
const DARK = new Set(['home', 'lesson-question', 'lesson-wrong', 'lesson-finish', 'profile', 'sprach-part2', 'vocab']);

// A learner with some progress: one island done, one exam, a mistake and a
// short streak, so every widget has something to show.
async function seedState() {
  const ctx = indexContent(await assembleContent());
  const day = today();
  const state = normalizeState(defaultState(day), ctx, day);
  state.settings.dailyGoal = 30;
  for (const back of [2, 1]) award(ctx, state, { kind: 'lessonLearned', lesson: ctx.islandLessons('nomen-kasus')[back].id }, addDays(day, -back));
  for (const lesson of ctx.islandLessons('passiv')) award(ctx, state, { kind: 'lessonLearned', lesson: lesson.id }, day);
  award(ctx, state, { kind: 'exam', island: 'passiv', correct: 9, total: 10 }, day);
  award(ctx, state, { kind: 'answer', q: ctx.route[0].questions[0], correct: false }, day);
  const second = [...ctx.modelTests.values()][1];
  state.last = { grammar: { hash: `lesson/${ctx.islandLessons('nomen-kasus')[3].id}`, day }, writing: { hash: 'model-exams/petra/schreiben', day }, tests: { hash: `model-exams/${second.id}/lesen-1`, day } };
  state.modelExams.petra = { schreiben: { writing: 'Liebe Petra, vielen Dank für deine Nachricht.' } };
  state.modelExams[second.id] = { 'lesen-1': { checked: true, responses: {} } };
  for (const word of ['Gebäudes', 'Umzug', 'Ausweis', 'Bushaltestelle', 'Nachbarschaftsgarten', 'trotzdem']) addWord(state, word, day);
  return JSON.stringify(state);
}

function findBrowser() {
  if (process.env.BROWSER) return process.env.BROWSER;
  const local = process.env.LOCALAPPDATA || '';
  const candidates = platform() === 'win32' ? [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    `${local}/Google/Chrome/Application/chrome.exe`,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
    `${local}/BraveSoftware/Brave-Browser/Application/brave.exe`
  ] : platform() === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/usr/bin/brave-browser'];
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) throw new Error('No Chromium-based browser found. Set BROWSER to the path of Chrome, Edge, Brave or Chromium.');
  return found;
}

async function launchBrowser(profile) {
  const child = spawn(findBrowser(), [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required',
    '--force-device-scale-factor=1', '--font-render-hinting=none', '--disable-features=Translate', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error('The browser did not start within 20 seconds.')), 20000);
    child.stderr.on('data', chunk => {
      text += chunk;
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(text);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.on('exit', code => reject(new Error(`The browser exited with code ${code}.`)));
  });
  return { child, url };
}

// A tiny DevTools protocol client with flattened sessions.
function connect(url) {
  const socket = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} (${message.error.data || ''})`));
      else resolve(message.result);
    } else if (message.method) for (const listener of listeners) listener(message);
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return {
    ready,
    send(method, params = {}, sessionId) {
      const message = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) };
      return new Promise((resolve, reject) => {
        pending.set(message.id, { resolve, reject });
        socket.send(JSON.stringify(message));
      });
    },
    on(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() { socket.close(); }
  };
}

// Steps that drive the lesson player like a learner would.
const STEPS = String(async function steps(plan) {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const click = selector => { const el = document.querySelector(selector); if (!el) throw new Error(`missing ${selector}`); el.click(); };
  const fire = el => el.dispatchEvent(new Event('input', { bubbles: true }));
  const open = async selector => { click(selector); await wait(80); };
  const level = () => document.querySelector('.level-card-code')?.textContent;
  for (const step of plan.split(',')) {
    const [name, count] = step.split(':');
    if (name === 'continue') for (let i = 0; i < Number(count); i++) { click('[data-continue]'); await wait(80); }
    if (name === 'wrong') {
      for (const blank of document.querySelectorAll('input.blank')) { blank.value = 'xyz'; fire(blank); }
      const area = document.querySelector('#written');
      if (area) { area.value = 'xyz'; fire(area); }
      click('[data-check]');
      await wait(120);
    }
    if (name === 'switch-b2') {
      await open('.level-widget');
      await open('[data-level="B2"]');
      if (level() !== 'B2') throw new Error('the dashboard did not switch to B2');
    }
    if (name === 'reading-retake') {
      if (document.querySelector('[data-action="exam-check"]')) click('[data-action="exam-check"]');
      click('[data-action="exam-edit"]');
      location.hash = 'home';
      await wait(150);
      if (!document.querySelector('.skills-radar li:first-child strong')) throw new Error('the last reading score disappeared during a retake');
    }
    if (name === 'resume-draft') {
      await open('.progress-card.writing');
      await open('.resume-card .btn');
      const draft = 'Liebe Petra, ich schreibe morgen weiter.';
      const editor = document.querySelector('#exam-writing');
      if (!editor?.value) throw new Error('the writing draft was not restored');
      editor.value = draft;
      fire(editor);
      const otherTask = document.querySelector('.exam-menu a[href$="/lesen-1"]').hash;
      await open('.crumb a[href="#schreiben"]');
      await open(document.querySelector('#bottom-nav').clientWidth ? '#bottom-nav [href="#home"]' : '#rail-nav [href="#home"]');
      await open('.level-widget');
      await open('[data-level="B2"]');
      location.hash = otherTask;
      await wait(80);
      if (!document.querySelector('.level-soon') || document.querySelector('.exam-part')) throw new Error('a B1 deep link opened under B2');
      await open('.level-soon a[href="#level"]');
      await open('[data-level="B1"]');
      if (level() !== 'B1') throw new Error('the dashboard did not switch back to B1');
      await open('.progress-card.writing');
      await open('.resume-card .btn');
      if (document.querySelector('#exam-writing')?.value !== draft) throw new Error('switching levels lost the draft');
      await wait(170);
      if (JSON.parse(localStorage.getItem('gi-state-v1')).modelExams.petra.schreiben.writing !== draft) throw new Error('the writing draft was not persisted');
    }
    if (name === 'listen-practice' || name === 'listen-check') {
      const media = document.querySelector('[data-listening-audio]');
      if (!media) throw new Error('missing audio element');
      media.muted = true;
      const play = async () => {
        click('[data-action="listen-play"]');
        for (let i = 0; i < 40 && (media.paused || media.currentTime < .05); i++) await wait(75);
        if (media.paused || media.currentTime < .05) throw new Error('the B1 recording did not play');
        click('[data-action="listen-stop"]');
        await wait(80);
      };
      if (!document.querySelector('[data-action="listen-submit"]').disabled) throw new Error('empty listening answers could be checked');
      await play();
      if (name === 'listen-check') {
        await play();
        if (!document.querySelector('[data-action="listen-play"]').disabled || document.querySelector('[data-action="listen-excerpt"]')) {
          throw new Error('the Hörcheck did not enforce two full plays');
        }
      }
      const id = location.hash.split('/').at(-1);
      const content = await (await fetch('/content.json')).json();
      const authored = [...content.listeningCourse.assessment, ...content.listeningCourse.chapters.flatMap(chapter => chapter.scenes)].find(scene => scene.id === id);
      for (const [i, task] of authored.tasks.entries()) {
        const field = document.querySelector(task.options ? `[name="listening-answer-${i}"][value="${task.answer}"]` : `#listening-answer-${i}`);
        if (task.options) field.click();
        else { field.value = task.answer; fire(field); }
      }
      click('[data-action="listen-submit"]');
      await wait(150);
      if (!document.querySelector('#listening-result') || !document.body.textContent.includes(authored.lines[0].text)) {
        throw new Error('the score or transcript was not shown after submission');
      }
      const saved = JSON.parse(localStorage.getItem('gi-state-v1')).listening.runs[id];
      if (!saved?.submitted || (name === 'listen-check' && saved.plays !== 2)) throw new Error('the listening submission was not saved');
    }
    if (name === 'listen-local') {
      const library = await (await fetch('/api/hoeren')).json();
      if (library.episodes.length) {
        for (const series of ['simpsons', 'spongebob']) {
          const episode = library.episodes.find(item => item.series === series);
          if (!episode) continue;
          for (let i = 0; i < 24 && !document.querySelector('[data-listening-episode]'); i++) await wait(100);
          const picker = document.querySelector('[data-listening-episode]');
          picker.value = episode.id;
          picker.dispatchEvent(new Event('change', { bubbles: true }));
          for (let i = 0; i < 24 && !document.querySelector('[data-listening-audio]'); i++) await wait(100);
          const clip = (await (await fetch(`/api/hoeren/${episode.id}`)).json()).clips[0];
          const media = document.querySelector('[data-listening-audio]');
          media.muted = true;
          click('[data-action="listen-play"]');
          for (let i = 0; i < 72 && (media.paused || media.currentTime < clip.start); i++) await wait(75);
          if (media.paused || media.currentTime < clip.start || media.currentTime >= clip.end + .3) throw new Error(`episode seek failed: ${episode.id}`);
          media.currentTime = clip.end + .05;
          for (let i = 0; i < 15 && !media.paused; i++) await wait(80);
          if (!media.paused) throw new Error('episode continued past the clip boundary');
        }
      }
      const folder = document.querySelector('[data-listening-folder]');
      const example = await (await fetch('/listening-audio/treffpunkt.mp3')).blob();
      const transfer = new DataTransfer();
      const sentence = 'Wenn du etwas später kommst, warte ich direkt neben dem Stadtplan.';
      transfer.items.add(new File([example], 'simpsons.s06e04.mp4', { type: example.type }));
      transfer.items.add(new File([`1\n00:00:01,000 --> 00:00:06,500\n${sentence}\n`], 'simpsons.s06e04.de.srt', { type: 'text/plain' }));
      folder.files = transfer.files;
      folder.dispatchEvent(new Event('change', { bubbles: true }));
      for (let i = 0; i < 24 && !document.querySelector('[data-listening-audio]')?.src.startsWith('blob:'); i++) await wait(100);
      const local = document.querySelector('[data-listening-audio]');
      if (!local?.src.startsWith('blob:')) throw new Error('the selected folder did not load an audio clip locally');
      local.muted = true;
      click('[data-action="listen-play"]');
      for (let i = 0; i < 40 && (local.paused || local.currentTime < 1); i++) await wait(75);
      if (local.paused || local.currentTime < 1) throw new Error('the imported audio clip did not seek');
      click('[data-action="listen-stop"]');
      const field = document.querySelector('#tv-answer');
      field.value = 'Wenn';
      fire(field);
      click('[data-action="listen-tv-check"]');
      if (!document.querySelector('.listening-task.yes')) throw new Error('the first gap was not graded');
      click('[data-action="listen-tv-longer"]');
      if (!document.querySelector('.listening-modes [data-mode="phrase"][aria-pressed="true"]')) throw new Error('the gap did not grow');
    }
    if (name === 'writing-feedback') {
      const editor = document.querySelector('#writing-draft-0');
      const draft = 'Liebe Lea,\nich komme gern mit.';
      editor.value = draft;
      fire(editor);
      const meter = document.querySelector('#writing-draft-0-meter');
      if (!meter.textContent.includes('~') || !editor.closest('.writing-editor').classList.contains('has-writing')) {
        throw new Error('writing counters did not update');
      }
      if (document.querySelector('.writing-model')) throw new Error('reference shown before writing');
      window.scrollTo(0, document.documentElement.scrollHeight);
      click('[data-action="writing-submit"]');
      await wait(80);
      const firstFeedback = document.querySelector('#writing-feedback');
      const feedbackTop = firstFeedback.getBoundingClientRect().top;
      if (feedbackTop < 0 || feedbackTop >= innerHeight / 2) throw new Error('self-check is out of view after submission');
      const frozen = document.querySelector('#writing-before-0');
      document.querySelector('#writing-pre-revision').open = true;
      frozen.focus();
      frozen.setSelectionRange(0, 9);
      click('[data-evidence-id="0-0"]');
      if (!document.querySelector('.writing-evidence blockquote')?.textContent.includes('Liebe Lea')) throw new Error('evidence was not saved');
      if (!document.querySelector('#writing-pre-revision').open) throw new Error('editing panel closed while marking evidence');
      click('[data-action="writing-reveal"]');
      await wait(80);
      if (document.querySelector('.writing-manuscript.original').textContent !== draft || !document.querySelector('.writing-model')) {
        throw new Error('the model and original should appear together');
      }
      const revision = document.querySelector('#writing-revision-0');
      revision.value = 'Liebe Lea,\n\nich würde dich gern am Samstag besuchen!';
      fire(revision);
      click('[data-action="writing-finish"]');
      await wait(200);
      const saved = JSON.parse(localStorage.getItem('gi-state-v1')).writingCourse['besuch-planen'];
      if (saved.answers[0] !== draft || saved.revision[0] !== revision.value || !saved.done) throw new Error('revision overwrote or failed to save the original');
    }
    if (name === 'writing-expired-away') {
      const { setClock } = await import('/js/dates.js');
      let time = Date.now();
      setClock(() => new Date(time));
      await open('[data-action="writing-start-readiness"]');
      const editor = document.querySelector('#writing-draft-0');
      editor.value = 'Mein gespeicherter Entwurf.';
      fire(editor);
      location.hash = 'home';
      await wait(80);
      time += 1801000;
      location.hash = 'schreiben/bereit';
      await wait(150);
      const saved = JSON.parse(localStorage.getItem('gi-state-v1')).writingCourse['schreibprobe-1'];
      if (!saved?.submitted || saved.answers[0] !== editor.value || !document.querySelector('[data-action="writing-start-readiness"]')) {
        throw new Error('the readiness list did not finalize the expired attempt');
      }
    }
    if (name === 'writing-blank-mock') {
      const { setClock } = await import('/js/dates.js');
      let time = Date.now();
      setClock(() => new Date(time));
      click('[data-action="writing-start"]');
      time += 1801000;
      await wait(350);
      click('[data-action="writing-reveal"]');
      if (!document.querySelector('.writing-model') || document.querySelector('.writing-ready-callout')) {
        throw new Error('a blank mock must show the model without completion credit');
      }
      click('[data-action="writing-start"]');
      if (!document.querySelector('[data-writing-timer]')) throw new Error('blank mock could not be restarted');
    }
    if (name === 'writing-timed-flow') {
      const { setClock } = await import('/js/dates.js');
      let time = Date.now();
      setClock(() => new Date(time));
      await open('[data-action="writing-start-readiness"]');
      const editor = document.querySelector('#writing-draft-0');
      if (!editor || editor.spellcheck || !document.querySelector('[data-writing-timer]')) throw new Error('the timed editor is missing or allows spellcheck');
      editor.value = 'Lieber Milan, ich komme gern mit.';
      fire(editor);
      time += 1801000;
      await wait(480);
      if (document.querySelector('[data-writing-timer]') || document.querySelector('#writing-before-0')?.value !== editor.value) throw new Error('deadline did not submit the stored draft');
      click('[data-action="writing-reveal"]');
      const form = document.querySelector('[data-writing-review]');
      for (const select of form.querySelectorAll('select')) select.value = 'A';
      for (const input of form.querySelectorAll('input[name^="reason-"]')) input.value = 'Ein Beispiel aus der Antwort.';
      click('[data-action="writing-save-review"]');
      await wait(200);
      const saved = JSON.parse(localStorage.getItem('gi-state-v1')).writingCourse['schreibprobe-1'];
      if (saved.review?.grades.task !== 'A') throw new Error('teacher review was not saved');
    }
    if (name === 'choose') {
      for (const select of [...document.querySelectorAll('select[data-sprach-gap], select[data-exam-item]')].slice(0, Number(count))) {
        select.selectedIndex = 1;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    if (name === 'place') {
      for (let i = 0; i < Number(count); i++) {
        click('.bank-chip:not(:disabled)');
        await wait(30);
        const gap = [...document.querySelectorAll('[data-drop-gap]')].find(item => !item.dataset.value);
        gap.click();
        await wait(80);
      }
      document.activeElement?.blur();
    }
    if (name === 'pick') {
      const word = document.querySelector('.example .de');
      const range = document.createRange();
      range.setStart(word.firstChild, word.textContent.lastIndexOf(' ') + 1);
      range.setEnd(word.firstChild, word.textContent.length);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      await wait(250);
      if (document.querySelector('.word-pop').hidden) throw new Error('the word button did not appear');
      continue;
    }
    if (name === 'walk') {
      for (let guard = 0; guard < 80 && !document.querySelector('.lesson-complete'); guard++) {
        if (document.querySelector('[data-check]')) {
          const radio = document.querySelector('input[name="choice"]');
          if (radio) { radio.checked = true; fire(radio); }
          for (const blank of document.querySelectorAll('input.blank')) { blank.value = 'x'; fire(blank); }
          for (let i = 0; i < 12 && document.querySelector('[data-action="add-piece"]'); i++) { click('[data-action="add-piece"]'); await wait(5); }
          const area = document.querySelector('#written');
          if (area) { area.value = 'Test'; fire(area); }
          click('[data-check]');
          await wait(40);
          if (document.querySelector('[data-action="self-yes"]')) { click('[data-action="self-yes"]'); await wait(40); }
        }
        click('[data-continue]');
        await wait(60);
      }
    }
  }
  window.scrollTo(0, 0);
});

// Checks run inside the page. Returns failures and warnings as text.
const CHECKS = String(function checks(expectDir) {
  const problems = [];
  const warnings = [];
  const W = innerWidth;
  const H = innerHeight;
  const seen = new Set();
  const add = (list, text) => { if (!seen.has(text) && list.length < 12) { seen.add(text); list.push(text); } };
  const visible = el => {
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  const hidden = el => {
    if (el.closest('.sr-only, .skip, .toasts, [aria-hidden="true"]')) return true;
    // Content of a closed <details> keeps its boxes in Chromium but is not shown.
    const closed = el.closest('details:not([open])');
    return Boolean(closed && !closed.querySelector(':scope > summary')?.contains(el));
  };
  const clipped = el => {
    for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowX)) return true;
    }
    return false;
  };
  const name = el => {
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    const text = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32);
    return `${el.tagName.toLowerCase()}${cls}${text ? ` “${text}”` : ''}`;
  };

  if (document.documentElement.dir !== expectDir) problems.push(`page direction is ${document.documentElement.dir}, expected ${expectDir}`);
  if (document.documentElement.scrollWidth > W + 1) problems.push(`page scrolls sideways (${document.documentElement.scrollWidth}px wide)`);

  const outside = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || hidden(el) || clipped(el) || outside.some(parent => parent.contains(el))) continue;
    const box = el.getBoundingClientRect();
    if (box.right > W + 1 || box.left < -1) {
      outside.push(el);
      add(problems, `sticks out of the viewport: ${name(el)} (${Math.round(box.left)}–${Math.round(box.right)}px)`);
    }
  }

  for (const el of document.querySelectorAll('button, .btn, h1, h2, h3, label, .tab-link, .rail-link, .level-chip, .chip, .slot')) {
    if (!visible(el) || hidden(el)) continue;
    const style = getComputedStyle(el);
    if (style.textOverflow === 'ellipsis') continue;
    const cutX = /(hidden|clip)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
    const cutY = /(hidden|clip)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 2;
    if (cutX || cutY) add(problems, `text cut off: ${name(el)}`);
  }

  const bars = [...document.querySelectorAll('.topbar, .player-bar, .bottom-nav, .action-bar, .answer-sheet')].filter(visible).map(el => el.getBoundingClientRect());
  const top = Math.max(0, ...bars.filter(box => box.top < H / 2).map(box => box.bottom));
  const bottom = Math.min(H, ...bars.filter(box => box.top >= H / 2).map(box => box.top));
  const controls = 'a[href], button, input:not([type="hidden"]), select, textarea, summary';
  for (const el of document.querySelectorAll(controls)) {
    if (!visible(el) || hidden(el) || el.disabled) continue;
    const box = el.getBoundingClientRect();
    if (box.top < top || box.bottom > bottom || box.left < 0 || box.right > W) continue;
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    // A sticky header over a scrolled list is fine: scrolling brings the control back.
    const sticky = node => { for (; node && node !== document.body; node = node.parentElement) if (/sticky|fixed/.test(getComputedStyle(node).position)) return true; return false; };
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !sticky(hit)) add(problems, `covered control: ${name(el)} under ${name(hit)}`);
  }

  for (const el of document.querySelectorAll(controls)) {
    if (!visible(el) || hidden(el)) continue;
    if (el.tagName === 'INPUT' && el.closest('label')) continue;
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue;
    const box = el.getBoundingClientRect();
    if (box.width < 24 || box.height < 24) add(el.tagName === 'BUTTON' ? problems : warnings, `small target ${Math.round(box.width)}×${Math.round(box.height)}: ${name(el)}`);
  }

  // Text contrast (WCAG AA) where the background is a plain colour.
  const rgba = value => {
    let m = /rgba?\(([^)]+)\)/.exec(value);
    if (m) { const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [r, g, b, a]; }
    m = /color\(srgb ([^)]+)\)/.exec(value);
    if (m) { const [r, g, b, a = 1] = m[1].split(/[\s/]+/).filter(Boolean).map(Number); return [r * 255, g * 255, b * 255, a]; }
    return null;
  };
  const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const blend = (fg, bg) => [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
  const background = el => {
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none' || Number(style.opacity) < 1) return null;
      const colour = rgba(style.backgroundColor);
      if (colour && colour[3] > 0) { layers.push(colour); if (colour[3] >= 1) break; }
    }
    if (!layers.length) return null;
    return layers.reverse().reduce((under, layer) => blend(layer, under));
  };
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || hidden(el) || el.closest('[disabled], .soon, svg, .cal-cell')) continue;
    if (![...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) continue;
    const style = getComputedStyle(el);
    const fg = rgba(style.color);
    const bg = background(el);
    if (!fg || !bg) continue;
    const ratioOf = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const ratio = ratioOf(blend(fg, bg), bg);
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.6 && Number(style.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) add(problems, `low contrast ${ratio.toFixed(2)}:1 on ${name(el)}`);
  }

  const radar = document.querySelector('.skills-radar svg');
  if (radar) {
    for (const label of radar.querySelectorAll('text')) {
      const { x, width } = label.getBBox();
      if (x < 0 || x + width > radar.viewBox.baseVal.width) problems.push(`radar label clipped: ${label.textContent}`);
    }
  }

  // Mirroring: navigation and the player follow the reading direction.
  const rtl = expectDir === 'rtl';
  const rail = document.querySelector('.rail');
  if (rail && visible(rail)) {
    const box = rail.getBoundingClientRect();
    if (rtl !== box.left > W / 2) problems.push(`navigation rail is on the ${box.left > W / 2 ? 'right' : 'left'} side`);
  }
  const tabs = [...document.querySelectorAll('.tab-link')].filter(visible);
  if (tabs.length > 1 && rtl !== tabs[0].getBoundingClientRect().left > tabs.at(-1).getBoundingClientRect().left) problems.push('tab bar order does not follow the reading direction');
  const close = document.querySelector('.player-close');
  const track = document.querySelector('.player-track');
  if (close && track && rtl !== close.getBoundingClientRect().left > track.getBoundingClientRect().left) problems.push('close button is on the wrong side of the progress bar');
  return { problems, warnings };
});

async function main() {
  await mkdir(baselineDir, { recursive: true });
  for (const file of await readdir(reportDir)) if (file.endsWith('.png') || file === 'index.html' || file === 'report.json') await rm(path.join(reportDir, file));
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = await mkdtemp(path.join(tmpdir(), 'deutschpfad-visual-'));
  const { child, url } = await launchBrowser(profile);
  const cdp = connect(url);
  await cdp.ready;
  const results = [];
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => cdp.send(method, params, sessionId);
    let errors = [];
    cdp.on(message => {
      if (message.sessionId !== sessionId) return;
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '));
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text + (message.params.entry.url ? ` ${message.params.entry.url}` : ''));
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    const loaded = () => new Promise(resolve => {
      const off = cdp.on(message => { if (message.sessionId === sessionId && message.method === 'Page.loadEventFired') { off(); resolve(); } });
    });
    const evaluate = async (expression, awaitPromise = true) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const state = await seedState();
    let navigation = loaded();
    await send('Page.navigate', { url: `${origin}/` });
    await navigation;

    const runs = [];
    for (const lang of ['de', 'ar']) {
      for (const [device, size] of Object.entries(DEVICES)) {
        for (const [name, hash, steps, full] of SCREENS) {
          if (only && !only.some(part => name.startsWith(part))) continue;
          runs.push({ lang, device, size, name, hash, steps, full, theme: 'light' });
          if (DARK.has(name) && device !== 'tablet') runs.push({ lang, device, size, name, hash, steps, full, theme: 'dark' });
        }
      }
    }
    for (const run of runs) {
      const { lang, device, size, name, hash, steps, full, theme } = run;
      const id = `${name}--${device}--${theme}--${lang}`;
      await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: size.mobile });
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: theme }] });
      await evaluate(`localStorage.clear(); localStorage.setItem('gi-state-v1', ${JSON.stringify(state)}); localStorage.setItem('gi-lang', '${lang}'); localStorage.setItem('gi-theme', '${theme}'); history.replaceState(null, '', '/#${hash}');`);
      errors = [];
      navigation = loaded();
      await send('Page.reload', { ignoreCache: false });
      await navigation;
      await evaluate(`(async () => { for (let i = 0; i < 100 && !document.querySelector('#content').children.length; i++) await new Promise(r => setTimeout(r, 50)); await document.fonts.ready; document.head.insertAdjacentHTML('beforeend', '<style>.toasts{visibility:hidden!important}*{caret-color:transparent!important}</style>'); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); })()`);
      const record = { id, lang, device, theme, name, problems: [], warnings: [], diff: null };
      try {
        if (steps) await evaluate(`(${STEPS})(${JSON.stringify(steps)})`);
        await evaluate('new Promise(r => setTimeout(r, 120))');
        const checked = await evaluate(`(${CHECKS})(${JSON.stringify(lang === 'ar' ? 'rtl' : 'ltr')})`, false);
        record.problems.push(...checked.problems);
        record.warnings.push(...checked.warnings);
      } catch (error) {
        record.problems.push(`could not run the screen: ${error.message}`);
      }
      record.problems.push(...errors.map(text => `console: ${text}`));
      let clip;
      if (full) {
        const height = Math.min(5000, await evaluate('document.documentElement.scrollHeight', false));
        clip = { x: 0, y: 0, width: size.width, height, scale: 1 };
      }
      const shot = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) });
      const png = Buffer.from(shot.data, 'base64');
      await writeFile(path.join(reportDir, `${id}.png`), png);
      const baseline = path.join(baselineDir, `${id}.png`);
      if (update || !existsSync(baseline)) await copyFile(path.join(reportDir, `${id}.png`), baseline);
      else {
        record.diff = pixelDifference(decodePng(png), decodePng(await readFile(baseline)));
        if (record.diff > DIFF_LIMIT) record.problems.push(`looks different from the baseline (${(record.diff * 100).toFixed(2)} % of pixels)`);
      }
      results.push(record);
      process.stdout.write(record.problems.length ? '✗' : '.');
    }
  } finally {
    cdp.close();
    child.kill();
    server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
  }
  process.stdout.write('\n');
  await writeFile(path.join(reportDir, 'report.json'), JSON.stringify(results, null, 2));
  await writeFile(path.join(reportDir, 'index.html'), gallery(results));
  const failed = results.filter(result => result.problems.length);
  for (const result of failed) console.log(`✗ ${result.id}\n  ${result.problems.join('\n  ')}`);
  const warned = results.reduce((sum, result) => sum + result.warnings.length, 0);
  console.log(`${results.length - failed.length} of ${results.length} screens passed${warned ? `, ${warned} warnings` : ''}${update ? ', baselines updated' : ''}. Report: ${path.relative(process.cwd(), path.join(reportDir, 'index.html'))}`);
  if (failed.length) process.exitCode = 1;
}

const escape = value => String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// One row per screen and device, German and Arabic side by side.
function gallery(results) {
  const groups = new Map();
  for (const result of results) {
    const key = `${result.name} · ${result.device} · ${result.theme}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }
  const rows = [...groups].map(([key, items]) => `<section class="${items.some(item => item.problems.length) ? 'fail' : 'pass'}">
    <h2>${escape(key)}</h2><div class="pair">${items.map(item => `<figure>
      <figcaption>${item.lang === 'ar' ? 'العربية (RTL)' : 'Deutsch (LTR)'}${item.diff !== null ? ` · Δ ${(item.diff * 100).toFixed(2)} %` : ''}</figcaption>
      <a href="${item.id}.png"><img src="${item.id}.png" loading="lazy" alt="${escape(item.id)}"></a>
      ${item.problems.length ? `<ul class="problems">${item.problems.map(text => `<li>${escape(text)}</li>`).join('')}</ul>` : '<p class="ok">All checks passed</p>'}
      ${item.warnings.length ? `<details><summary>${item.warnings.length} warnings</summary><ul>${item.warnings.map(text => `<li>${escape(text)}</li>`).join('')}</ul></details>` : ''}
    </figure>`).join('')}</div></section>`).join('');
  const failed = results.filter(result => result.problems.length).length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Visual test report</title>
<style>
:root { color-scheme: light dark; --bg: #f3f5f9; --card: #fff; --ink: #1a2232; --muted: #667185; --bad: #b3263a; --good: #16794c; --line: #e1e6ee; }
@media (prefers-color-scheme: dark) { :root { --bg: #0f131b; --card: #171c26; --ink: #e8ecf4; --muted: #8e98ad; --bad: #ff9eab; --good: #6fdaa8; --line: #29313f; } }
body { margin: 0; padding: 24px 16px; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, sans-serif; }
h1 { margin: 0 0 4px; font-size: 24px; } .summary { color: var(--muted); margin: 0 0 20px; }
section { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin-bottom: 16px; }
section.fail { border-color: var(--bad); } h2 { margin: 0 0 10px; font-size: 16px; }
.pair { display: flex; flex-wrap: wrap; gap: 16px; } figure { margin: 0; flex: 1 1 300px; max-width: 700px; min-width: 0; }
figcaption { font-weight: 700; margin-bottom: 6px; color: var(--muted); } img { width: 100%; border: 1px solid var(--line); border-radius: 8px; display: block; }
.problems { color: var(--bad); padding-inline-start: 18px; } .ok { color: var(--good); margin: 6px 0 0; }
</style></head><body><h1>Visual test report</h1>
<p class="summary">${results.length - failed} of ${results.length} screens passed · German (LTR) and Arabic (RTL) · ${Object.entries(DEVICES).map(([name, size]) => `${name} ${size.width}×${size.height}`).join(', ')}</p>
${rows}</body></html>`;
}

main().catch(error => {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
});
