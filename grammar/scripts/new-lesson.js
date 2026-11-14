// Creates a lesson file with every required field, ready to fill in.
// Usage: npm run new:lesson -- <id> <island> <B1.1|B1.2> <lektion> [order]
// The placeholders fail validation on purpose until they are replaced.
import { writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assembleContent, contentDir } from './assemble-content.js';

const [id, island, level, lektionText, orderText] = process.argv.slice(2);
const usage = 'Usage: npm run new:lesson -- <id> <island> <B1.1|B1.2> <lektion> [order]';

async function main() {
  if (!id || !island || !level || !lektionText) throw new Error(usage);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw new Error('The id must be lowercase words joined by hyphens.');
  const content = await assembleContent();
  if (!content.islands.some(item => item.id === island)) throw new Error(`Unknown island. Choose one of: ${content.islands.map(item => item.id).join(', ')}`);
  if (!content.levels.some(item => item.id === level)) throw new Error('Level must be B1.1 or B1.2.');
  const file = path.join(contentDir, 'lessons', `${id}.json`);
  if (await access(file).then(() => true, () => false)) throw new Error(`${id}.json already exists.`);
  const order = Number(orderText) || content.lessons.filter(lesson => lesson.island === island).length + 1;
  const TODO = 'TODO';
  const step = { text: TODO, why: TODO };
  const question = (n, type, difficulty) => {
    const q = { id: `${id}-${n}`, type, difficulty };
    if (type === 'cloze') Object.assign(q, { text: `${TODO} {{1}}.`, blanks: [[TODO]] });
    if (type === 'mcq') Object.assign(q, { options: [TODO, `${TODO} 2`, `${TODO} 3`], answer: 0 });
    if (type === 'order') q.items = [TODO, `${TODO} 2`, `${TODO} 3`, `${TODO} 4`];
    if (type === 'text') q.answer = TODO;
    if (n === 8) q.context = TODO;
    const words = { prompt: TODO, explain: TODO, hints: [TODO] };
    q.i18n = { ar: { ...words }, de: { ...words } };
    return q;
  };
  const template = [['cloze', 1], ['cloze', 1], ['mcq', 1], ['cloze', 2], ['order', 2], ['mcq', 2], ['text', 3], ['text', 3], ['text', 2]];
  const texts = { title: TODO, lead: TODO, steps: [step, step, step, step], explain: [TODO], pitfall: TODO, recall: [TODO, TODO], linkTitles: [TODO] };
  const lesson = {
    id, level, island, order, prereqs: [], emoji: '📌', german: TODO,
    source: { lektion: Number(lektionText), kind: 'toc' },
    pattern: [TODO, '+', TODO],
    frames: [{ k: 'main', parts: [['vf', TODO], ['v', TODO], ['mf', TODO]] }],
    example: TODO,
    stepExamples: [TODO, TODO, TODO, TODO],
    pitfallPair: `${TODO} → ${TODO}`,
    links: ['https://example.org/TODO'],
    i18n: { ar: { ...texts, translation: TODO }, de: { ...texts } },
    questions: template.map(([type, difficulty], i) => question(i + 1, type, difficulty))
  };
  await writeFile(file, JSON.stringify(lesson, null, 2) + '\n');
  console.log(`Created content/lessons/${id}.json (island ${island}, order ${order}). Replace every TODO, then run npm run validate.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
