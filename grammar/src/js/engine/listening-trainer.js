// Hörtraining (listening trainer) logic: comparing a dictation with the original and
// naming the kind of each mistake, German number words for the number
// drills, the learner's listening level, the speed ladder, audio review
// cards and the plan of the daily listening round. Pure functions on plain
// objects; nothing here touches the page, the speech engine or the storage.
import { addDays, isDay } from '../dates.js';
import { INTERVALS } from './srs.js';

export const MODES = ['diktat', 'laute', 'zahlen', 'satzende', 'alltag', 'karten'];
export const ERROR_KINDS = ['sound', 'ending', 'segment', 'number', 'word', 'missed'];
export const REFLECT_TAGS = ['speed', 'words', 'segment', 'numbers', 'structure', 'focus'];
export const NUMBER_KINDS = ['zahl', 'preis', 'uhrzeit', 'datum', 'jahr', 'telefon'];
// Speech rates of the speed ladder. Below 1 the audio is slowed down as a
// temporary support; the trainer suggests going back to 1 once it is easy.
export const RATES = [0.75, 0.85, 1, 1.1, 1.2, 1.3];
export const LEVEL_THETA = { A1: 1.4, A2: 1.8, B1: 3, B2: 4.2, C1: 5 };
const LEVEL_BASE = { A2: 1, B1: 2.3, B2: 3.6 };
const MAX_ATTEMPTS = 300;
const MAX_CARDS = 600;
const MAX_REFLECTIONS = 60;

// ── Text comparison ─────────────────────────────────────────────────────

// Words of a sentence without punctuation; inner apostrophes and hyphens stay.
export function tokens(text) {
  return String(text ?? '').normalize('NFC')
    .replace(/[„“”"«»‚‘(),.!?:;…–—]/g, ' ')
    .replace(/(^|\s)['’-]+|['’-]+(?=\s|$)/g, ' ')
    .split(/\s+/).filter(Boolean);
}

// Lower case; `ss` for `ß` and `ae/oe/ue` for umlauts typed without a German keyboard.
const fold = word => word.toLowerCase().replace(/ß/g, 'ss').replace(/’/g, "'").replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü');

// A rough phonetic key: spellings that sound alike map to the same key.
export function soundKey(word) {
  return fold(word)
    .replace(/ie/g, 'i').replace(/ih/g, 'i').replace(/ü|y/g, 'i')
    .replace(/ä|ö/g, 'e').replace(/eh/g, 'e').replace(/ah/g, 'a').replace(/oh/g, 'o').replace(/uh/g, 'u')
    .replace(/ei|ai|ey|ay/g, 'ai').replace(/eu|äu|oi/g, 'oi')
    .replace(/sch|ch/g, 'x').replace(/ck/g, 'k').replace(/tz|z/g, 'ts').replace(/v/g, 'f').replace(/w/g, 'v').replace(/th/g, 't').replace(/ph/g, 'f')
    .replace(/b/g, 'p').replace(/d/g, 't').replace(/g/g, 'k')
    .replace(/(.)\1+/g, '$1').replace(/h/g, '');
}

export function editDistance(a, b) {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length];
}

const UNITS = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

// German number words for 0 … 999 999, written as one word.
export function numberWords(n) {
  n = Math.floor(Math.abs(n));
  if (n < 20) return UNITS[n];
  if (n < 100) {
    const unit = n % 10;
    return (unit ? `${unit === 1 ? 'ein' : UNITS[unit]}und` : '') + TENS[Math.floor(n / 10)];
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    return `${hundreds === 1 ? '' : UNITS[hundreds]}hundert${rest ? numberWords(rest) : ''}`;
  }
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  return `${thousands === 1 ? '' : numberWords(thousands).replace(/eins$/, 'ein')}tausend${rest ? numberWords(rest) : ''}`;
}

const NUMBER_WORD = /^(?:null|eins?|zwei|zwo|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|\p{L}*(?:zehn|zig|ßig|hundert|tausend)\p{L}*|halb|viertel|\p{L}*(?:ersten|zweiten|dritten|\p{L}+ten|\p{L}+sten))$/u;
const isNumberish = word => /^\d/.test(word) || NUMBER_WORD.test(fold(word));
const isNumberWord = word => /^\d/.test(word) || [...UNITS, ...TENS.filter(Boolean)].includes(fold(word)) || /(?:zehn|zig|ßig|hundert|tausend|und\p{L}*zig)$/u.test(fold(word));

// Digits typed by the learner count as the number word they stand for.
function expandDigits(words) {
  return words.map(word => (/^\d{1,6}$/.test(word) ? numberWords(Number(word)) : word));
}

// Classifies one substituted word: what kind of listening problem it shows.
export function classify(expected, heard) {
  const a = fold(expected);
  const b = fold(heard);
  if (a === b) return 'minor';
  if (isNumberWord(expected) || isNumberWord(heard)) return 'number';
  if (soundKey(expected) === soundKey(heard)) return 'sound';
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  if (prefix >= 3 && a.length - prefix <= 3 && b.length - prefix <= 3) return 'ending';
  const distance = editDistance(soundKey(expected), soundKey(heard));
  if (distance <= Math.max(1, Math.floor(Math.max(a.length, b.length) / 4))) return 'sound';
  return 'word';
}

const similarity = (a, b) => {
  const x = fold(a);
  const y = fold(b);
  if (x === y) return 0;
  const distance = editDistance(x, y) / Math.max(x.length, y.length);
  return distance <= 0.6 ? 0.4 + distance : 2;
};

// Aligns the learner's words with the original (weighted edit distance on
// words), then merges neighbours that only differ in where the word
// boundary is: "habich" for "hab ich" or "Fahr karten" for "Fahrkarten".
export function compareDictation(reference, answer) {
  const ref = tokens(reference);
  const hyp = expandDigits(tokens(answer));
  const rows = ref.length + 1;
  const cols = hyp.length + 1;
  const cost = Array.from({ length: rows }, () => new Float64Array(cols));
  for (let i = 0; i < rows; i++) cost[i][0] = i;
  for (let j = 0; j < cols; j++) cost[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      cost[i][j] = Math.min(cost[i - 1][j] + 1, cost[i][j - 1] + 1, cost[i - 1][j - 1] + similarity(ref[i - 1], hyp[j - 1]));
    }
  }
  const ops = [];
  let i = ref.length;
  let j = hyp.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && Math.abs(cost[i][j] - (cost[i - 1][j - 1] + similarity(ref[i - 1], hyp[j - 1]))) < 1e-9) {
      ops.push({ ref: [ref[i - 1]], hyp: [hyp[j - 1]] });
      i--; j--;
    } else if (i > 0 && Math.abs(cost[i][j] - (cost[i - 1][j] + 1)) < 1e-9) {
      ops.push({ ref: [ref[i - 1]], hyp: [] });
      i--;
    } else {
      ops.push({ ref: [], hyp: [hyp[j - 1]] });
      j--;
    }
  }
  ops.reverse();
  const joined = list => fold(list.join(''));
  const merged = [];
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    const next = ops[k + 1];
    if (next) {
      const ref2 = [...op.ref, ...next.ref];
      const hyp2 = [...op.hyp, ...next.hyp];
      if (ref2.length && hyp2.length && (ref2.length > 1 || hyp2.length > 1) && joined(ref2) === joined(hyp2) && !(op.ref.length === 1 && op.hyp.length === 1 && fold(op.ref[0]) === fold(op.hyp[0]))) {
        merged.push({ ref: ref2, hyp: hyp2, kind: 'segment' });
        k++;
        continue;
      }
    }
    merged.push(op);
  }
  let correct = 0;
  const errors = Object.fromEntries(ERROR_KINDS.map(kind => [kind, 0]));
  const parts = merged.map(op => {
    if (op.kind === 'segment') {
      errors.segment += 1;
      correct += op.ref.length * 0.5;
      return { kind: 'segment', expected: op.ref.join(' '), heard: op.hyp.join(' ') };
    }
    if (op.ref.length && op.hyp.length) {
      const expected = op.ref[0];
      const heard = op.hyp[0];
      if (expected === heard) {
        correct += 1;
        return { kind: 'ok', expected, heard };
      }
      const kind = classify(expected, heard);
      if (kind === 'minor') {
        correct += 1;
        return { kind: 'minor', expected, heard };
      }
      errors[kind] += 1;
      return { kind, expected, heard };
    }
    if (op.ref.length) {
      const kind = isNumberish(op.ref[0]) ? 'number' : 'missed';
      errors[kind] += 1;
      return { kind, expected: op.ref[0], heard: '' };
    }
    return { kind: 'extra', expected: '', heard: op.hyp[0] };
  });
  const accuracy = ref.length ? Math.max(0, Math.min(1, correct / ref.length)) : 0;
  return { parts, accuracy, errors, words: ref.length };
}

// Words that were not recognised, for the audio review cards.
export function missedWords(result) {
  const seen = new Set();
  return result.parts.filter(part => ['sound', 'ending', 'word', 'missed', 'number', 'segment'].includes(part.kind) && part.expected)
    .map(part => part.expected).filter(word => {
      const key = fold(word);
      if (seen.has(key) || key.length < 2) return false;
      seen.add(key);
      return true;
    });
}

// Syllables are counted as vowel groups; German diphthongs count once.
export function syllables(text) {
  return tokens(text).reduce((sum, word) => sum + Math.max(1, (word.toLowerCase().match(/[aeiouyäöü]+/g) || [])
    .reduce((n, group) => n + Math.max(1, group.length - (group.match(/ie|ei|ai|au|eu|äu|aa|ee|oo/g) || []).length), 0)), 0);
}

// ── Number drills ───────────────────────────────────────────────────────

const pick = (list, rng) => list[Math.floor(rng() * list.length)];
const int = (min, max, rng) => min + Math.floor(rng() * (max - min + 1));
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function ordinal(n) {
  const special = { 1: 'ersten', 3: 'dritten', 7: 'siebten', 8: 'achten' };
  if (special[n]) return special[n];
  if (n < 20) return `${numberWords(n)}ten`;
  return `${numberWords(n)}sten`;
}

const hourWord = h => (h === 1 ? 'eins' : numberWords(h));
const wrapHour = h => (h % 12) || 12;

// Spoken everyday times: "Viertel nach drei", "fünf vor halb neun".
export function spokenTime(h, m) {
  const next = wrapHour(h + 1);
  if (m === 0) return `${h === 1 ? 'ein' : numberWords(h)} Uhr`;
  if (m === 15) return `Viertel nach ${hourWord(h)}`;
  if (m === 30) return `halb ${hourWord(next)}`;
  if (m === 45) return `Viertel vor ${hourWord(next)}`;
  if (m < 25) return `${numberWords(m)} nach ${hourWord(h)}`;
  if (m === 25) return `fünf vor halb ${hourWord(next)}`;
  if (m === 35) return `fünf nach halb ${hourWord(next)}`;
  return `${numberWords(60 - m)} vor ${hourWord(next)}`;
}

export function spokenYear(y) {
  if (y >= 2000) return `zweitausend${y > 2000 ? numberWords(y - 2000) : ''}`;
  const hundreds = Math.floor(y / 100);
  const rest = y % 100;
  return `${numberWords(hundreds)}hundert${rest ? numberWords(rest) : ''}`;
}

const digitWord = d => (d === '2' ? 'zwo' : numberWords(Number(d)));

// One number item: what is spoken, what the learner types and the
// written form shown afterwards.
export function makeNumberItem(kind, rng = Math.random) {
  if (kind === 'preis') {
    const euros = int(1, 99, rng);
    const cents = pick([10, 19, 20, 25, 29, 30, 45, 49, 50, 59, 75, 79, 90, 95, 99], rng);
    const value = `${euros},${String(cents).padStart(2, '0')}`;
    return { kind, say: `${euros === 1 ? 'ein' : numberWords(euros)} Euro ${numberWords(cents)}`, answer: value, shown: `${value} €` };
  }
  if (kind === 'uhrzeit') {
    const h = int(1, 12, rng);
    const m = pick([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55], rng);
    const value = `${h}:${String(m).padStart(2, '0')}`;
    return { kind, say: spokenTime(h, m), answer: value, shown: value };
  }
  if (kind === 'datum') {
    const month = int(1, 12, rng);
    const day = int(1, [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1], rng);
    const value = `${day}.${month}.`;
    return { kind, say: `am ${ordinal(day)} ${MONTHS[month - 1]}`, answer: value, shown: `${value} (${day}. ${MONTHS[month - 1]})` };
  }
  if (kind === 'jahr') {
    const year = int(1950, 2035, rng);
    return { kind, say: spokenYear(year), answer: String(year), shown: String(year) };
  }
  if (kind === 'telefon') {
    const area = `0${int(2, 9, rng)}${int(0, 9, rng)}${int(0, 9, rng)}`;
    const line = Array.from({ length: int(6, 7, rng) }, () => String(int(0, 9, rng))).join('');
    const say = `${[...area].map(digitWord).join(' ')}, ${line.match(/.{1,2}/g).map(group => [...group].map(digitWord).join(' ')).join(', ')}`;
    return { kind, say, answer: area + line, shown: `${area} ${line}` };
  }
  // Mostly two-digit numbers, where the unit comes before the ten.
  const n = rng() < 0.7 ? int(2, 9, rng) * 10 + int(1, 9, rng) : int(101, 999, rng);
  return { kind: 'zahl', say: numberWords(n), answer: String(n), shown: String(n) };
}

// Compares a typed number answer, ignoring spaces, separators and units.
export function checkNumber(item, typed) {
  const clean = String(typed ?? '').replace(/\s|€|euro|uhr|\/|-/gi, '');
  if (item.kind === 'preis') return clean.replace('.', ',').replace(/,(\d)$/, ',$10') === item.answer;
  if (item.kind === 'uhrzeit') {
    const match = /^(\d{1,2})(?:[:.](\d{2}))?$/.exec(clean);
    if (!match) return false;
    const [h, m] = item.answer.split(':').map(Number);
    return (Number(match[1]) % 12 || 12) === h && Number(match[2] || 0) === m;
  }
  if (item.kind === 'datum') {
    const match = /^(\d{1,2})\.(\d{1,2})\.?(?:\d{2,4})?$/.exec(clean);
    const [d, m] = item.answer.split('.').map(Number);
    return Boolean(match) && Number(match[1]) === d && Number(match[2]) === m;
  }
  return clean.replace(/\./g, '') === item.answer;
}

// ── Learner model ───────────────────────────────────────────────────────

export function defaultTrainer() {
  return { theta: null, rate: 1, vary: true, voice: '', attempts: [], contrasts: {}, cards: {}, reflections: [], seconds: 0, texts: {}, session: null, placed: null };
}

const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const finite = (value, min, max, fallback) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);

export function normalizeTrainer(raw, ctx) {
  const state = defaultTrainer();
  if (!plain(raw)) return state;
  const listening = ctx.listenTrainer;
  state.theta = Number.isFinite(raw.theta) ? finite(raw.theta, 0, 7, null) : null;
  state.rate = RATES.includes(raw.rate) ? raw.rate : 1;
  state.vary = raw.vary !== false;
  state.voice = typeof raw.voice === 'string' ? raw.voice.slice(0, 200) : '';
  state.seconds = finite(raw.seconds, 0, 1e8, 0);
  state.placed = isDay(raw.placed) ? raw.placed : null;
  if (Array.isArray(raw.attempts)) {
    for (const entry of raw.attempts.slice(-MAX_ATTEMPTS)) {
      if (!plain(entry) || !MODES.includes(entry.mode) && entry.mode !== 'text' || !isDay(entry.day)) continue;
      const clean = { mode: entry.mode, day: entry.day, acc: finite(entry.acc, 0, 1, 0) };
      if (typeof entry.id === 'string' && entry.id.length <= 80) clean.id = entry.id;
      if (Number.isFinite(entry.replays)) clean.replays = finite(Math.round(entry.replays), 0, 99, 0);
      if (RATES.includes(entry.rate)) clean.rate = entry.rate;
      if (Number.isFinite(entry.sps)) clean.sps = finite(Math.round(entry.sps * 10) / 10, 0, 15, 0);
      if (plain(entry.err)) {
        const err = {};
        for (const kind of ERROR_KINDS) if (Number.isFinite(entry.err[kind]) && entry.err[kind] > 0) err[kind] = finite(Math.round(entry.err[kind]), 0, 99, 0);
        if (Object.keys(err).length) clean.err = err;
      }
      state.attempts.push(clean);
    }
  }
  const contrastIds = new Set((listening?.contrasts || []).map(item => item.id));
  for (const [id, value] of Object.entries(plain(raw.contrasts) ? raw.contrasts : {})) {
    if (!contrastIds.has(id) || !Array.isArray(value)) continue;
    const [right, total] = value.map(n => finite(Math.round(n), 0, 1e6, 0));
    if (total > 0) state.contrasts[id] = [Math.min(right, total), total];
  }
  for (const [text, value] of Object.entries(plain(raw.cards) ? raw.cards : {}).slice(-MAX_CARDS)) {
    if (typeof text !== 'string' || !text.trim() || text.length > 80 || !plain(value) || !isDay(value.due)) continue;
    state.cards[text] = { box: finite(Math.round(value.box), 1, 5, 1), due: value.due, ...(typeof value.from === 'string' && value.from.length <= 200 ? { from: value.from } : {}) };
  }
  if (Array.isArray(raw.reflections)) {
    for (const entry of raw.reflections.slice(-MAX_REFLECTIONS)) {
      if (!plain(entry) || !isDay(entry.day) || !Array.isArray(entry.tags)) continue;
      const tags = entry.tags.filter(tag => REFLECT_TAGS.includes(tag));
      if (tags.length) state.reflections.push({ day: entry.day, tags: [...new Set(tags)] });
    }
  }
  const textIds = new Set((listening?.texts || []).map(text => text.id));
  for (const [id, value] of Object.entries(plain(raw.texts) ? raw.texts : {})) {
    if (textIds.has(id) && plain(value) && isDay(value.day)) state.texts[id] = { day: value.day, score: finite(value.score, 0, 1, 0) };
  }
  if (plain(raw.session) && isDay(raw.session.day) && Array.isArray(raw.session.tasks) && ['runde', 'einstufung'].includes(raw.session.kind)) {
    const tasks = raw.session.tasks.filter(task => plain(task) && (MODES.includes(task.mode) || ['text', 'reflexion'].includes(task.mode)))
      .map(task => ({ mode: task.mode, n: finite(Math.round(task.n), 1, 20, 1), done: finite(Math.round(task.done), 0, 20, 0), ...(typeof task.target === 'string' && task.target.length <= 40 ? { target: task.target } : {}) }));
    if (tasks.length) state.session = { kind: raw.session.kind, day: raw.session.day, tasks, at: finite(Math.round(raw.session.at), 0, tasks.length, 0) };
  }
  return state;
}

// Estimated listening level on a 0–7 scale (A2 ≈ 2, B1 ≈ 3, B2 ≈ 4).
export const thetaOf = (listening, level = 'B1') => listening.theta ?? LEVEL_THETA[level] ?? 3;

export function thetaLevel(theta) {
  if (theta < 1.6) return 'A1';
  if (theta < 2.6) return 'A2';
  if (theta < 3.8) return 'B1';
  if (theta < 5) return 'B2';
  return 'C1';
}

// Clip difficulty from its level, length and the features that make it
// hard to hear (numbers, compounds, verbs at the end).
export function clipDifficulty(clip) {
  const words = tokens(clip.de).length;
  const hard = clip.tags.filter(tag => ['zahl', 'kompositum', 'nebensatz', 'trennbar', 'konjunktiv', 'passiv'].includes(tag)).length;
  return Math.round(((LEVEL_BASE[clip.level] ?? 2) + words * 0.09 + hard * 0.22) * 100) / 100;
}

// Faster speech makes a clip harder; slowed-down speech makes it easier.
export const effectiveDifficulty = (difficulty, rate = 1) => difficulty + (rate - 1) * 2.5;

// Expected word accuracy; about 80 % when ability and difficulty match.
export const expectedAccuracy = (theta, difficulty) => 1 / (1 + Math.exp(-(1.6 * (theta - difficulty) + 1.4)));

export function updateTheta(listening, level, difficulty, accuracy, { rate = 1, replays = 1, step = 0.5 } = {}) {
  const theta = thetaOf(listening, level);
  // Many replays mean the words were only caught with effort.
  const observed = accuracy * (replays > 3 ? 0.9 : 1);
  const next = theta + step * (observed - expectedAccuracy(theta, effectiveDifficulty(difficulty, rate)));
  listening.theta = Math.round(Math.min(7, Math.max(0, next)) * 100) / 100;
  return listening.theta;
}

// The next dictation: slightly above the current level, not heard recently.
export function pickClip(ctx, listening, level, rng = Math.random, exclude = []) {
  const clips = ctx.listenTrainer?.clips || [];
  if (!clips.length) return null;
  const theta = thetaOf(listening, level);
  const recent = new Set([...listening.attempts.filter(entry => entry.mode === 'diktat').slice(-25).map(entry => entry.id), ...exclude]);
  const target = theta + 0.25;
  const fresh = clips.filter(clip => !recent.has(clip.id));
  const pool = (fresh.length ? fresh : clips)
    .map(clip => ({ clip, gap: Math.abs(effectiveDifficulty(clipDifficulty(clip), listening.rate) - target) + rng() * 0.35 }))
    .sort((a, b) => a.gap - b.gap);
  return pool[0].clip;
}

export function recordAttempt(listening, entry) {
  listening.attempts.push(entry);
  if (listening.attempts.length > MAX_ATTEMPTS) listening.attempts.splice(0, listening.attempts.length - MAX_ATTEMPTS);
}

// Speed ladder: a step up after three easy dictations at this speed, a step
// down after two hard ones, back to normal speed when slowed audio is easy.
export function speedAdvice(listening) {
  const atRate = listening.attempts.filter(entry => entry.mode === 'diktat' && (entry.rate ?? 1) === listening.rate);
  const last = atRate.slice(-3);
  const index = RATES.indexOf(listening.rate);
  if (last.length === 3 && last.every(entry => entry.acc >= 0.9 && (entry.replays ?? 1) <= 2)) {
    if (listening.rate < 1) return { change: 'normal', rate: 1 };
    if (index < RATES.length - 1) return { change: 'up', rate: RATES[index + 1] };
  }
  const lastTwo = atRate.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every(entry => entry.acc < 0.55) && index > 0) return { change: 'down', rate: RATES[index - 1] };
  return null;
}

// ── Contrasts and review cards ──────────────────────────────────────────

export function recordContrast(listening, id, correct) {
  const [right, total] = listening.contrasts[id] || [0, 0];
  listening.contrasts[id] = [right + (correct ? 1 : 0), total + 1];
}

// Contrasts sorted from weakest to strongest; untried ones count as unsure.
export function weakContrasts(ctx, listening) {
  return (ctx.listenTrainer?.contrasts || []).map(contrast => {
    const [right, total] = listening.contrasts[contrast.id] || [0, 0];
    return { contrast, right, total, score: (right + 1) / (total + 2) };
  }).sort((a, b) => a.score - b.score || a.total - b.total);
}

// Picks one trial: a pair from the chosen (or a weak) contrast and which
// of the two words is played.
export function makeContrastTrial(ctx, listening, contrastId, rng = Math.random) {
  const contrasts = ctx.listenTrainer?.contrasts || [];
  let contrast = contrasts.find(item => item.id === contrastId);
  if (!contrast) {
    const ranked = weakContrasts(ctx, listening);
    contrast = rng() < 0.6 ? pick(ranked.slice(0, 4), rng).contrast : pick(ranked, rng).contrast;
  }
  const pair = pick(contrast.pairs, rng);
  return { contrast: contrast.id, pair, target: rng() < 0.5 ? 0 : 1 };
}

export function addCard(listening, text, day, from) {
  const word = String(text ?? '').normalize('NFC').trim();
  if (!word || word.length > 80) return false;
  if (listening.cards[word]) {
    listening.cards[word].due = day;
    listening.cards[word].box = 1;
    return false;
  }
  listening.cards[word] = { box: 1, due: day, ...(from ? { from: from.slice(0, 200) } : {}) };
  const keys = Object.keys(listening.cards);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_CARDS))) delete listening.cards[old];
  return true;
}

export function dueCards(listening, day) {
  return Object.entries(listening.cards).filter(([, card]) => card.due <= day)
    .sort(([a, x], [b, y]) => x.due.localeCompare(y.due) || x.box - y.box || a.localeCompare(b)).map(([text]) => text);
}

export function gradeCard(listening, text, correct, day) {
  const card = listening.cards[text];
  if (!card) return;
  card.box = correct ? Math.min(5, card.box + 1) : 1;
  card.due = addDays(day, INTERVALS[card.box]);
}

export const sameText = (a, b) => tokens(a).map(fold).join(' ') === tokens(b).map(fold).join(' ');

// ── Profile and daily round ─────────────────────────────────────────────

export function profile(ctx, listening, level, day) {
  const dictations = listening.attempts.filter(entry => entry.mode === 'diktat').slice(-12);
  const average = (list, key) => (list.length ? list.reduce((sum, entry) => sum + (entry[key] ?? 0), 0) / list.length : null);
  const errors = Object.fromEntries(ERROR_KINDS.map(kind => [kind, 0]));
  for (const entry of listening.attempts.slice(-40)) for (const [kind, n] of Object.entries(entry.err || {})) errors[kind] += n;
  const numbers = listening.attempts.filter(entry => entry.mode === 'zahlen').slice(-20);
  const theta = thetaOf(listening, level);
  const speeds = dictations.filter(entry => entry.sps);
  return {
    theta,
    level: thetaLevel(theta),
    measured: listening.theta !== null,
    accuracy: average(dictations, 'acc'),
    replays: average(dictations, 'replays'),
    sps: average(speeds, 'sps'),
    numbers: average(numbers, 'acc'),
    dictations: dictations.length,
    errors,
    weak: weakContrasts(ctx, listening).filter(entry => entry.total >= 3).slice(0, 3),
    due: dueCards(listening, day).length,
    cards: Object.keys(listening.cards).length,
    minutes: Math.round(listening.seconds / 60),
    today: listening.attempts.filter(entry => entry.day === day).length
  };
}

// Which drill trains the most frequent kind of mistake.
const DRILL_FOR = { sound: 'laute', number: 'zahlen', segment: 'alltag', ending: 'satzende', word: 'karten', missed: 'diktat' };

export function weakestDrill(ctx, listening, day) {
  const { errors } = profile(ctx, listening, 'B1', day);
  const ranked = Object.entries(errors).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  for (const [kind] of ranked) {
    const drill = DRILL_FOR[kind];
    if (drill === 'karten' && !dueCards(listening, day).length) continue;
    if (drill !== 'diktat') return drill;
  }
  const reflected = listening.reflections.slice(-5).flatMap(entry => entry.tags);
  if (reflected.includes('numbers')) return 'zahlen';
  if (reflected.includes('structure')) return 'satzende';
  if (reflected.includes('segment') || reflected.includes('speed')) return 'alltag';
  return 'laute';
}

// The next Hörtext: the first unheard one at or just above the level.
export function nextText(ctx, listening, level) {
  const texts = ctx.listenTrainer?.texts || [];
  const theta = thetaOf(listening, level);
  const order = { A2: 2, B1: 3, B2: 4 };
  const fitting = texts.filter(text => order[text.level] <= Math.max(2, Math.ceil(theta + 0.3)));
  return fitting.find(text => !listening.texts[text.id]) || [...fitting].sort((a, b) => listening.texts[a.id].day.localeCompare(listening.texts[b.id].day))[0] || texts[0];
}

// Daily round of about 15–20 minutes: due cards as warm-up, intensive
// dictation, the weakest area, one longer text and a short reflection.
export function planRound(ctx, listening, level, day) {
  const due = dueCards(listening, day).length;
  const drill = weakestDrill(ctx, listening, day);
  const text = nextText(ctx, listening, level);
  const tasks = [
    ...(due ? [{ mode: 'karten', n: Math.min(5, due), done: 0 }] : []),
    { mode: 'diktat', n: 3, done: 0 },
    { mode: drill, n: drill === 'karten' ? Math.min(5, Math.max(1, due)) : 6, done: 0 },
    ...(text ? [{ mode: 'text', n: 1, done: 0, target: text.id }] : []),
    { mode: 'reflexion', n: 1, done: 0 }
  ];
  return { kind: 'runde', day, tasks, at: 0 };
}

// Placement check of about 8 minutes: adaptive dictation, sound contrasts
// and numbers. The result sets the starting level and speed.
export function planPlacement(day) {
  return { kind: 'einstufung', day, at: 0, tasks: [{ mode: 'diktat', n: 6, done: 0 }, { mode: 'laute', n: 10, done: 0 }, { mode: 'zahlen', n: 5, done: 0 }] };
}

export function currentTask(listening, day) {
  const session = listening.session;
  if (!session || session.day !== day || session.at >= session.tasks.length) return null;
  return session.tasks[session.at];
}

// Counts one finished item of the session task and moves on when the task
// is complete. Returns true when the whole session is finished.
export function advanceSession(listening) {
  const session = listening.session;
  if (!session) return false;
  const task = session.tasks[session.at];
  if (!task) return true;
  task.done += 1;
  if (task.done >= task.n) session.at += 1;
  return session.at >= session.tasks.length;
}

export const sessionMinutes = session => Math.max(5, Math.round(session.tasks.reduce((sum, task) => sum + ({ diktat: 1.2, laute: 0.25, zahlen: 0.4, satzende: 0.6, alltag: 0.6, karten: 0.4, text: 6, reflexion: 1 }[task.mode] || 1) * task.n, 0)));

export const nextDueDay = (listening, day) => Object.values(listening.cards).map(card => card.due).filter(due => due > day).sort()[0] || null;
