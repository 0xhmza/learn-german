// One-time conversion of the original single-file B1.1 course into the
// content format of this platform. Safe to re-run: it overwrites the 28
// B1.1 lesson files and the extracted font, and nothing else.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const legacyFile = path.join(root, 'content', 'sources', 'legacy', 'Deutsch-B1.1-Arabic.html');

// island, order inside the island, prerequisites (see docs/grammar-platform-plan.md §3.2)
export const placement = {
  'genitiv': ['nomen-kasus', 1, []],
  'genitiv-praep': ['nomen-kasus', 2, ['genitiv']],
  'lokale-praep': ['nomen-kasus', 3, []],
  'diminutiv': ['nomen-kasus', 5, []],
  'komparativ': ['adjektive', 1, []],
  'superlativ': ['adjektive', 2, ['komparativ']],
  'genitiv-adjektiv': ['adjektive', 3, ['genitiv']],
  'partizip1': ['adjektive', 4, []],
  'partizip-adjektiv': ['adjektive', 5, ['partizip1']],
  'irgendein': ['pronomen', 1, []],
  'pronominaladverbien': ['pronomen', 4, []],
  'relativ-dativ': ['relativsaetze', 1, []],
  'relativ-praep': ['relativsaetze', 2, ['relativ-dativ']],
  'relativ-einschub': ['relativsaetze', 3, ['relativ-dativ']],
  'relativ-genitiv': ['relativsaetze', 4, ['relativ-dativ', 'genitiv']],
  'relativ-ort': ['relativsaetze', 5, []],
  'infinitiv-zu': ['infinitiv-verben', 1, []],
  'statt-zu': ['infinitiv-verben', 2, ['infinitiv-zu']],
  'ohne-zu': ['infinitiv-verben', 3, ['infinitiv-zu']],
  'lassen': ['infinitiv-verben', 5, []],
  'passiv-perfekt': ['passiv', 1, []],
  'passiv-modal': ['passiv', 2, []],
  'subjektlos': ['passiv', 3, []],
  'je-desto': ['gegensatz-vergleich', 4, ['komparativ']],
  'doppelkonjunktionen': ['gegensatz-vergleich', 5, []],
  'falls': ['konjunktiv-bedingung', 1, []],
  'sonst': ['konjunktiv-bedingung', 2, []],
  'irreale-bedingung': ['konjunktiv-bedingung', 3, []]
};

export function readCourse(html) {
  const match = html.match(/<script id="course" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Course data not found in the legacy file.');
  return JSON.parse(match[1]);
}

function convertQuestion(q) {
  const out = { id: q.id, type: q.type, difficulty: q.difficulty };
  const ar = { prompt: q.prompt, explain: q.explain, hints: q.hints };
  const de = { prompt: q.de.prompt, explain: q.de.explain, hints: q.de.hints };
  if (q.type === 'cloze') {
    out.text = q.text;
    out.blanks = q.blanks;
    if (q.de.text !== undefined) de.text = q.de.text;
  }
  if (q.type === 'mcq') {
    if (q.de.options) {
      ar.options = q.options;
      de.options = q.de.options;
    } else out.options = q.options;
    if (q.de.answer !== undefined) {
      ar.answer = q.answer;
      de.answer = q.de.answer;
    } else out.answer = q.answer;
  }
  if (q.type === 'order') out.items = q.items;
  if (q.type === 'text') {
    out.answer = q.answer;
    if (q.context) out.context = q.context;
  }
  out.i18n = { ar, de };
  return out;
}

export function convertTopic(topic) {
  const where = placement[topic.id];
  if (!where) throw new Error(`No island placement for ${topic.id}`);
  const [island, order, prereqs] = where;
  const d = topic.de;
  return {
    id: topic.id,
    level: 'B1.1',
    island,
    order,
    prereqs,
    emoji: topic.emoji,
    german: topic.german,
    source: { lektion: topic.chapter, kind: topic.chapter === 3 ? 'sample' : 'toc' },
    pattern: topic.pattern,
    frames: topic.frames,
    example: topic.example,
    stepExamples: topic.steps.map(step => step.example),
    pitfallPair: topic.pitfall[0],
    links: topic.links.map(([, url]) => url),
    i18n: {
      ar: {
        title: topic.title,
        lead: topic.lead,
        translation: topic.translation,
        steps: topic.steps.map(({ text, why }) => ({ text, why })),
        explain: topic.explain,
        pitfall: topic.pitfall[1],
        recall: topic.recall,
        linkTitles: topic.links.map(([title]) => title),
        ...(topic.table ? { table: topic.table } : {})
      },
      de: {
        title: d.title,
        lead: d.lead,
        steps: d.steps.map(({ text, why }) => ({ text, why })),
        explain: d.explain,
        pitfall: d.pitfall,
        recall: d.recall,
        linkTitles: d.links,
        ...(d.table ? { table: d.table } : {})
      }
    },
    questions: topic.questions.map(convertQuestion)
  };
}

async function main() {
  const html = await readFile(legacyFile, 'utf8');
  const course = readCourse(html);
  const lessonDir = path.join(root, 'content', 'lessons');
  await mkdir(lessonDir, { recursive: true });
  const counts = {};
  let questionCount = 0;
  for (const topic of course.topics) {
    const lesson = convertTopic(topic);
    for (const q of lesson.questions) counts[q.type] = (counts[q.type] || 0) + 1;
    questionCount += lesson.questions.length;
    await writeFile(path.join(lessonDir, `${lesson.id}.json`), JSON.stringify(lesson, null, 2) + '\n');
  }

  const font = html.match(/\/\*([\s\S]*?)\*\/\s*@font-face\s*{[\s\S]*?url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/);
  if (!font) throw new Error('Embedded Arabic font not found.');
  const fontDir = path.join(root, 'src', 'fonts');
  await mkdir(fontDir, { recursive: true });
  await writeFile(path.join(fontDir, 'NotoSansArabic-Variable.woff2'), Buffer.from(font[2], 'base64'));
  await writeFile(path.join(fontDir, 'OFL.txt'), font[1].trim() + '\n');

  console.log(`Extracted ${course.topics.length} lessons and ${questionCount} questions:`, counts);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
