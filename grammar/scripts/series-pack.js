import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateListening } from './validate-listening.js';

export const seriesDirectory = fileURLToPath(new URL('../listening-clips/', import.meta.url));
export const privateSeriesDirectory = fileURLToPath(new URL('../.listening-private/clips/', import.meta.url));

export async function readSeriesPack(directory = seriesDirectory) {
  if (!directory) return null;
  let raw;
  try {
    raw = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const { course, timings } = raw ?? {};
  const failures = validateListening(course, timings, { minimumTasks: 3, minimumLines: 1 });
  if (failures.length) throw new Error(failures.join('\n'));
  const chapters = course.chapters;
  const validChapters = chapters.length && chapters.every(chapter =>
    /^serie-(simpsons|spongebob)$/.test(chapter.id) && chapter.scenes.every(scene => scene.id.startsWith(chapter.id + '-')));
  if (!validChapters || course.assessment.length) throw new Error('The series pack needs practice scenes grouped by series.');
  return { course, timings };
}
