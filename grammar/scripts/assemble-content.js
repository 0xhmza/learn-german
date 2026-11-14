// Merges levels, islands, badges and every lesson file into the single
// content object the app loads.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const contentDir = path.join(root, 'content');

const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

export async function assembleContent(dir = contentDir) {
  const [levels, islands, badges] = await Promise.all(
    ['levels.json', 'islands.json', 'badges.json'].map(name => readJson(path.join(dir, name)))
  );
  const lessonDir = path.join(dir, 'lessons');
  const files = (await readdir(lessonDir)).filter(name => name.endsWith('.json')).sort();
  const lessons = [];
  for (const file of files) {
    let lesson;
    try {
      lesson = await readJson(path.join(lessonDir, file));
    } catch (error) {
      throw new Error(`${file}: ${error.message}`);
    }
    Object.defineProperty(lesson, 'file', { value: file, enumerable: false });
    lessons.push(lesson);
  }
  const islandOrder = new Map(islands.map(island => [island.id, island.order]));
  islands.sort((a, b) => a.order - b.order);
  lessons.sort((a, b) => (islandOrder.get(a.island) ?? 99) - (islandOrder.get(b.island) ?? 99) || a.order - b.order);
  const body = { levels, islands, badges, lessons };
  const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
  return { version, ...body };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const content = await assembleContent();
  process.stdout.write(JSON.stringify(content));
}
