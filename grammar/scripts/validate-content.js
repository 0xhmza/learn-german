// Structural checks for all content. Grammar correctness still needs a
// human reviewer; this catches broken references and malformed data.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assembleContent } from './assemble-content.js';
import { readingWords } from '../src/js/reading-words.js';
import { validateModelTests } from './validate-model-tests.js';

const LANGS = ['ar', 'de'];
const FRAME_KINDS = new Set(['main', 'sub', 'rel', 'inf', 'np']);
const ROLES = new Set(['vf', 'v', 'mf', 've', 'c', 'n', 'hl']);
const TYPES = new Set(['cloze', 'mcq', 'order', 'text']);
const PALETTES = new Set(['lilac', 'peach', 'mint', 'blue', 'pink', 'yellow', 'sky', 'sand', 'coral', 'teal']);
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const isText = value => typeof value === 'string' && value.length > 0 && value === value.trim();
const ticksBalanced = value => (String(value).match(/`/g) || []).length % 2 === 0;

export function validateContent(content) {
  const errors = [];
  const fail = (where, message) => errors.push(`${where}: ${message}`);
  const text = (where, value) => {
    if (!isText(value)) fail(where, 'must be non-empty text without surrounding spaces');
    else if (!ticksBalanced(value)) fail(where, 'unbalanced backticks');
  };
  const textList = (where, list, min = 1, max = 99) => {
    if (!Array.isArray(list) || list.length < min || list.length > max) return fail(where, `needs ${min}–${max} entries`);
    list.forEach((value, i) => text(`${where}[${i}]`, value));
  };
  const bilingual = (where, value) => LANGS.forEach(lang => text(`${where}.${lang}`, value?.[lang]));
  const table = (where, rows) => {
    if (rows === undefined || rows === null) return;
    if (!Array.isArray(rows) || rows.length < 2) return fail(where, 'table needs a header and at least one row');
    const width = rows[0].length;
    rows.forEach((row, i) => {
      if (!Array.isArray(row) || row.length !== width) fail(`${where}[${i}]`, `row must have ${width} cells`);
      else row.forEach((cell, j) => { if (typeof cell !== 'string') fail(`${where}[${i}][${j}]`, 'cell must be text'); });
    });
  };

  const levels = new Map((content.levels || []).map(level => [level.id, level]));
  if (!levels.size) fail('levels', 'no levels');

  const islands = new Map();
  for (const island of content.islands || []) {
    const where = `island ${island.id}`;
    if (!ID.test(island.id || '')) fail(where, 'invalid id');
    if (islands.has(island.id)) fail(where, 'duplicate id');
    islands.set(island.id, island);
    if (!PALETTES.has(island.palette)) fail(where, `unknown palette ${island.palette}`);
    for (const field of ['name', 'nickname', 'blurb']) for (const lang of LANGS) text(`${where}.${field}.${lang}`, island[field]?.[lang]);
    for (const layout of ['wide', 'tall']) {
      const point = island.pos?.[layout];
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) fail(where, `pos.${layout} must be [x, y]`);
    }
  }
  const orders = [...islands.values()].map(island => island.order).sort((a, b) => a - b);
  if (orders.some((order, i) => order !== i + 1)) fail('islands', 'order must run 1…n without gaps');

  for (const badge of content.badges || []) {
    for (const field of ['name', 'text']) for (const lang of LANGS) text(`badge ${badge.id}.${field}.${lang}`, badge[field]?.[lang]);
  }

  const lessons = new Map();
  const questionIds = new Set();
  const placeholders = (value, at, where) => {
    if (typeof value === 'string') {
      if (/\bTODO\b|example\.org/.test(value)) fail(where, `unfinished placeholder at ${at}`);
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) placeholders(item, at ? `${at}.${key}` : key, where);
    }
  };

  for (const lesson of content.lessons || []) {
    const where = `lesson ${lesson.id}`;
    placeholders(lesson, '', where);
    if (!ID.test(lesson.id || '')) fail(where, 'invalid id');
    if (lesson.file && lesson.file !== `${lesson.id}.json`) fail(where, `file name ${lesson.file} does not match the id`);
    if (lessons.has(lesson.id)) fail(where, 'duplicate id');
    lessons.set(lesson.id, lesson);

    const level = levels.get(lesson.level);
    if (!level) fail(where, `unknown level ${lesson.level}`);
    if (!islands.has(lesson.island)) fail(where, `unknown island ${lesson.island}`);
    if (!Number.isInteger(lesson.order) || lesson.order < 1) fail(where, 'order must be a positive integer');
    if (!Array.isArray(lesson.prereqs)) fail(where, 'prereqs must be a list');
    const lektion = lesson.source?.lektion;
    if (!Number.isInteger(lektion) || (level && (lektion < level.lektionen[0] || lektion > level.lektionen[1]))) fail(where, `source.lektion ${lektion} does not fit ${lesson.level}`);
    if (!['toc', 'sample'].includes(lesson.source?.kind)) fail(where, 'source.kind must be toc or sample');
    text(`${where}.emoji`, lesson.emoji);
    text(`${where}.german`, lesson.german);
    text(`${where}.example`, lesson.example);
    if (!Array.isArray(lesson.pattern) || lesson.pattern.length < 2 || lesson.pattern.length > 12 || !lesson.pattern.every(isText)) fail(where, 'pattern needs 2–12 tokens');
    if (!Array.isArray(lesson.frames) || !lesson.frames.length) fail(where, 'frames missing');
    else lesson.frames.forEach((frame, i) => {
      if (!FRAME_KINDS.has(frame.k)) fail(`${where}.frames[${i}]`, `unknown kind ${frame.k}`);
      if (!Array.isArray(frame.parts) || !frame.parts.length) fail(`${where}.frames[${i}]`, 'parts missing');
      else frame.parts.forEach(([role, value], j) => {
        if (!ROLES.has(role)) fail(`${where}.frames[${i}].parts[${j}]`, `unknown role ${role}`);
        if (!isText(value)) fail(`${where}.frames[${i}].parts[${j}]`, 'empty text');
      });
    });
    if ((String(lesson.pitfallPair).match(/ → /g) || []).length !== 1) fail(where, 'pitfallPair needs exactly one " → "');
    if (!Array.isArray(lesson.links) || lesson.links.length < 1 || lesson.links.length > 4) fail(where, 'links needs 1–4 URLs');
    else lesson.links.forEach((url, i) => { if (!/^https:\/\/\S+$/.test(url)) fail(`${where}.links[${i}]`, 'must be an https URL'); });

    const stepCount = lesson.stepExamples?.length;
    if (!Array.isArray(lesson.stepExamples) || stepCount < 3 || stepCount > 6) fail(where, 'stepExamples needs 3–6 entries');
    else lesson.stepExamples.forEach((value, i) => text(`${where}.stepExamples[${i}]`, value));

    for (const lang of LANGS) {
      const t = lesson.i18n?.[lang];
      const at = `${where}.i18n.${lang}`;
      if (!t) { fail(at, 'missing'); continue; }
      for (const field of ['title', 'lead', 'pitfall']) text(`${at}.${field}`, t[field]);
      if (!Array.isArray(t.steps) || t.steps.length !== stepCount) fail(at, `steps must have ${stepCount} entries`);
      else t.steps.forEach((step, i) => { text(`${at}.steps[${i}].text`, step.text); text(`${at}.steps[${i}].why`, step.why); });
      textList(`${at}.explain`, t.explain, 1, 3);
      textList(`${at}.recall`, t.recall, 2, 2);
      if (!Array.isArray(t.linkTitles) || t.linkTitles.length !== lesson.links?.length) fail(at, 'linkTitles must match links');
      else t.linkTitles.forEach((value, i) => text(`${at}.linkTitles[${i}]`, value));
      table(`${at}.table`, t.table);
    }
    text(`${where}.i18n.ar.translation`, lesson.i18n?.ar?.translation);

    const questions = lesson.questions || [];
    if (questions.length < 9 || questions.length > 12) fail(where, `needs 9–12 questions, has ${questions.length}`);
    for (const difficulty of [1, 2, 3]) if (!questions.some(q => q.difficulty === difficulty)) fail(where, `no question of difficulty ${difficulty}`);
    questions.forEach((q, i) => {
      const at = `question ${q.id}`;
      if (q.id !== `${lesson.id}-${i + 1}`) fail(at, `id must be ${lesson.id}-${i + 1}`);
      if (questionIds.has(q.id)) fail(at, 'duplicate id');
      questionIds.add(q.id);
      if (!TYPES.has(q.type)) fail(at, `unknown type ${q.type}`);
      if (![1, 2, 3].includes(q.difficulty)) fail(at, 'difficulty must be 1, 2 or 3');
      for (const lang of LANGS) {
        const t = q.i18n?.[lang];
        if (!t) { fail(at, `i18n.${lang} missing`); continue; }
        text(`${at}.${lang}.prompt`, t.prompt);
        text(`${at}.${lang}.explain`, t.explain);
        textList(`${at}.${lang}.hints`, t.hints, 1, 3);
        if (q.type === 'cloze') {
          const source = t.text ?? q.text;
          const marks = [...String(source).matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
          if (!Array.isArray(q.blanks) || !q.blanks.length) fail(at, 'blanks missing');
          else {
            if (marks.join() !== q.blanks.map((_, n) => n + 1).join()) fail(at, `${lang} text must contain {{1}}…{{${q.blanks.length}}} in order`);
            q.blanks.forEach((variants, n) => {
              if (!Array.isArray(variants) || !variants.length || !variants.every(isText)) fail(`${at}.blanks[${n}]`, 'needs accepted answers');
            });
          }
        }
        if (q.type === 'mcq') {
          const options = t.options ?? q.options;
          const answer = t.answer ?? q.answer;
          if (!Array.isArray(options) || options.length < 2 || options.length > 5 || !options.every(isText)) fail(at, `${lang} options need 2–5 entries`);
          else if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) fail(at, `${lang} answer index out of range`);
        }
      }
      if (q.type === 'order') {
        if (!Array.isArray(q.items) || q.items.length < 3 || q.items.length > 10 || !q.items.every(isText)) fail(at, 'order needs 3–10 items');
        else if (new Set(q.items).size !== q.items.length) fail(at, 'order items must be distinct');
      }
      if (q.type === 'text') {
        text(`${at}.answer`, q.answer);
        if (q.context !== undefined) text(`${at}.context`, q.context);
      }
    });
  }

  for (const island of islands.values()) {
    const own = [...lessons.values()].filter(lesson => lesson.island === island.id).map(lesson => lesson.order).sort((a, b) => a - b);
    if (!own.length) fail(`island ${island.id}`, 'has no lessons');
    if (own.some((order, i) => order !== i + 1)) fail(`island ${island.id}`, `lesson order must run 1…${own.length}, found ${own.join(',')}`);
  }
  for (const lesson of lessons.values()) {
    for (const id of lesson.prereqs || []) {
      if (id === lesson.id) fail(`lesson ${lesson.id}`, 'lists itself as prerequisite');
      else if (!lessons.has(id)) fail(`lesson ${lesson.id}`, `unknown prerequisite ${id}`);
    }
  }
  const state = new Map();
  const visit = (id, trail) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'open') return fail(`lesson ${id}`, `prerequisite cycle ${[...trail, id].join(' → ')}`);
    state.set(id, 'open');
    for (const next of lessons.get(id)?.prereqs || []) if (lessons.has(next)) visit(next, [...trail, id]);
    state.set(id, 'done');
  };
  for (const id of lessons.keys()) visit(id, []);

  const study = content.lessonStudy || {};
  for (const id of Object.keys(study)) if (!lessons.has(id)) fail('lessonStudy', `unknown lesson ${id}`);
  for (const id of lessons.keys()) {
    const where = `lessonStudy.${id}`;
    const entry = study[id];
    if (!entry) { fail(where, 'missing'); continue; }
    bilingual(where, entry);
    bilingual(`${where}.task`, entry.task);
    bilingual(`${where}.hint`, entry.hint);
    text(`${where}.correct`, entry.correct);
    text(`${where}.alternative`, entry.alternative);
    if (entry.correct === entry.alternative) fail(where, 'examples must be distinct');
  }

  const validateItem = (where, item, ids) => {
    if (!ID.test(item.id || '') || ids.has(item.id)) fail(where, 'invalid or duplicate id');
    ids.add(item.id);
    bilingual(`${where}.title`, item.title);
    bilingual(`${where}.summary`, item.summary);
  };
  const lessonRefs = (where, ids, min) => {
    if (!Array.isArray(ids) || ids.length < min || new Set(ids).size !== ids.length || ids.some(id => !lessons.has(id))) {
      fail(where, `needs at least ${min} distinct lesson ids`);
    }
  };

  const practiceSetIds = new Set();
  const setCoverage = new Set();
  for (const set of content.practiceSets || []) {
    const where = `practice set ${set.id}`;
    validateItem(where, set, practiceSetIds);
    if (!set.id?.startsWith('set-')) fail(where, 'id must start with set-');
    lessonRefs(`${where}.lessons`, set.lessons, 2);
    if (Array.isArray(set.lessons)) for (const id of set.lessons) setCoverage.add(id);
    if (!Array.isArray(set.additionalQuestions) || new Set(set.additionalQuestions).size !== set.additionalQuestions.length) {
      fail(where, 'additional questions must be a list of distinct ids');
    } else {
      for (const id of set.additionalQuestions) if (!questionIds.has(id)) fail(where, `unknown question ${id}`);
    }
  }
  for (const id of lessons.keys()) if (!setCoverage.has(id)) fail('practice sets', `no set covers ${id}`);

  const readingIds = new Set();
  const glossary = new Map(Object.entries(content.readings?.glossary || {}));
  for (const [word, gloss] of glossary) text(`glossary.${word}`, gloss);
  for (const reading of content.readings?.texts || []) {
    const where = `reading ${reading.id}`;
    validateItem(where, reading, readingIds);
    lessonRefs(`${where}.lessons`, reading.lessons, 2);
    let words = 0;
    const paragraphs = Array.isArray(reading.paragraphs) ? reading.paragraphs : [];
    for (const [i, paragraph] of paragraphs.entries()) {
      bilingual(`${where}.paragraphs[${i}]`, paragraph);
      if (!isText(paragraph.de)) continue;
      for (const part of readingWords(paragraph.de, glossary)) {
        if (part.gloss !== undefined) {
          words++;
          text(`${where} gloss for ${part.text}`, part.gloss);
          if (!/\p{Script=Arabic}/u.test(part.gloss)) fail(where, `missing Arabic meaning for ${part.text}`);
        } else if (/[{}]/.test(part.text)) fail(where, 'malformed word annotation');
      }
    }
    if (words < 190) fail(where, 'needs at least 190 German words');
    const checks = Array.isArray(reading.checks) ? reading.checks : [];
    if (checks.length < 2) fail(where, 'needs at least two comprehension checks');
    for (const [i, check] of checks.entries()) {
      bilingual(`${where}.checks[${i}].prompt`, check.prompt);
      bilingual(`${where}.checks[${i}].answer`, check.answer);
    }
  }
  if (readingIds.size < 3) fail('readings', 'needs at least three B1 texts');

  const sprachIds = new Set();
  const formats = new Map([[1, new Set()], [2, new Set()]]);
  for (const set of content.sprachbausteine || []) {
    const where = `Sprachbausteine ${set.id}`;
    validateItem(where, set, sprachIds);
    if (![1, 2, 3].includes(set.difficulty)) fail(where, 'unknown difficulty');
    formats.get(set.bank ? 2 : 1).add(set.difficulty);
    textList(`${where}.paragraphs`, set.paragraphs, 2);
    const paragraphs = Array.isArray(set.paragraphs) ? set.paragraphs : [];
    const marks = [...paragraphs.join('\n').matchAll(/\{(\d+)\}/g)].map(match => Number(match[1]));
    if (marks.join() !== '1,2,3,4,5,6,7,8,9,10') fail(where, 'must use {1} through {10} once, in order');
    if (!Array.isArray(set.gaps) || set.gaps.length !== 10) { fail(where, 'needs exactly ten gaps'); continue; }
    if (set.bank) {
      textList(`${where}.bank`, set.bank, 15, 15);
      if (!Array.isArray(set.bank) || new Set(set.bank).size !== 15 || new Set(set.gaps.map(gap => gap.answer)).size !== 10) fail(where, 'bank entries and answers must be distinct');
    }
    for (const [i, gap] of set.gaps.entries()) {
      const at = `${where}.gaps[${i}]`;
      text(`${at}.answer`, gap.answer);
      bilingual(`${at}.explain`, gap.explain);
      if (gap.lesson && !lessons.has(gap.lesson)) fail(at, `unknown lesson ${gap.lesson}`);
      const options = set.bank || gap.options;
      if (!set.bank) {
        textList(`${at}.options`, options, 3, 3);
        if (Array.isArray(options) && new Set(options).size !== 3) fail(at, 'choices must be distinct');
      }
      if (!Array.isArray(options) || !options.includes(gap.answer)) fail(at, 'answer is missing from choices');
    }
  }
  for (const [part, difficulties] of formats) if (difficulties.size < 2) fail('Sprachbausteine', `part ${part} needs multiple difficulties`);
  return errors.concat(validateModelTests(content.modelTests));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const content = await assembleContent();
  const errors = validateContent(content);
  const questionCount = content.lessons.reduce((sum, lesson) => sum + lesson.questions.length, 0);
  if (errors.length) {
    for (const error of errors) console.error(`✗ ${error}`);
    console.error(`\n${errors.length} problem(s) in ${content.lessons.length} lessons.`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${content.islands.length} islands, ${content.lessons.length} lessons, ${questionCount} core questions and ${Object.keys(content.lessonStudy).length} extra questions, ${content.practiceSets.length} practice sets, ${content.readings.texts.length} readings, ${content.sprachbausteine.length} Sprachbausteine sets. Content version ${content.version}.`);
  }
}
