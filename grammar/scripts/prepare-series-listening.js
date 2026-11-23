// Cut the selected short ranges out of the private local German dubs.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, copyFile, writeFile, rm, rmdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadListeningLibrary } from '../listening-library.js';
import { validateListening } from './validate-listening.js';
import { privateSeriesDirectory as seriesDirectory } from './series-pack.js';

const run = promisify(execFile);
const project = fileURLToPath(new URL('../../', import.meta.url));
const privateDir = path.dirname(seriesDirectory.replace(/[\\/]$/, ''));
const editorial = JSON.parse(await readFile(path.join(privateDir, 'editorial.json'), 'utf8'));
const library = await loadListeningLibrary(['media-player/media', 'media'].map(directory => path.join(project, directory)));
const descriptions = {
  simpsons: { name: 'The Simpsons', de: 'Hör auf Entscheidungen, Reaktionen und genaue Details.', ar: 'استمع إلى القرارات وردود الأفعال والتفاصيل الدقيقة.' },
  spongebob: { name: 'SpongeBob Schwammkopf', de: 'Versteh Bitten, Folgen und Bedingungen in kurzen Dialogen.', ar: 'افهم الطلبات والنتائج والشروط في حوارات قصيرة.' }
};
const chapters = Object.entries(descriptions).map(([key, copy]) => ({
  id: `serie-${key}`, title: { de: copy.name, ar: copy.name },
  description: { de: copy.de, ar: copy.ar }, scenes: []
}));
const timings = {};
const cuts = editorial.map((entry, index) => {
  if (typeof entry.clip !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) || entry.questions?.length !== 2) {
    throw new Error('Each series entry needs a clip ID, a slug and two comprehension questions.');
  }
  const episode = library.get(entry.clip.split('-')[0]);
  const clip = episode?.clips.find(candidate => candidate.id === entry.clip);
  if (!clip) throw new Error(`Source cue unavailable: ${entry.clip}`);
  const id = `serie-${episode.series}-${entry.id}`;
  const choice = (row, i) => {
    const [prompt, correct, first, second, note] = row;
    const options = [first, second];
    const answer = (index + i) % 3;
    options.splice(answer, 0, correct);
    return { kind: i ? 'detail' : 'gist', prompt, options, answer, note };
  };
  const kind = entry.kind === 'dictation' ? 'dictation' : 'gap';
  const sentence = clip.text;
  const answer = kind === 'dictation' ? sentence : clip.phrase.answer;
  const note = kind === 'dictation' ? 'Vergleiche den Satz mit dem Originalton.' : 'Hör den Satzteil noch einmal im Zusammenhang.';
  chapters.find(chapter => chapter.id === `serie-${episode.series}`).scenes.push({
    id, title: entry.title, source: episode.label, lines: [{ text: sentence, voice: 'Originalton' }],
    tasks: [...entry.questions.map(choice), { kind, segment: 0, answer, note }]
  });
  // The clip is a single utterance. Each typing task reuses its time range.
  const duration = Number((clip.end - clip.start).toFixed(3));
  timings[id] = [[0, duration]];
  return { id, clip, episode, duration };
});
const course = { chapters, assessment: [] };
const failures = validateListening(course, timings, { minimumTasks: 3, minimumLines: 1 });
if (failures.length) throw new Error(failures.join('\n'));

await mkdir(seriesDirectory, { recursive: true });
const work = await mkdtemp(path.join(privateDir, 'render-'));
try {
  for (let start = 0; start < cuts.length; start += 4) {
    const batch = await Promise.allSettled(cuts.slice(start, start + 4).map(({ id, clip, episode, duration }) =>
      run(process.env.DEUTSCHPFAD_FFMPEG || 'ffmpeg', [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-ss', String(clip.start), '-i', episode.video,
        '-t', String(duration), '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '24000',
        '-af', 'loudnorm=I=-19:TP=-2:LRA=9', '-c:a', 'libmp3lame', '-b:a', '48k', path.join(work, `${id}.mp3`)
      ])
    ));
    const failure = batch.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
  for (const { id } of cuts) await copyFile(path.join(work, `${id}.mp3`), path.join(seriesDirectory, `${id}.mp3`));
  await writeFile(path.join(seriesDirectory, 'manifest.json'), JSON.stringify({ course, timings }, null, 2) + '\n');
  console.log(`Prepared ${cuts.length} audio excerpts for the static series edition.`);
} finally {
  // Only the temporary directory and the explicitly named files created above.
  for (const { id } of cuts) await rm(path.join(work, `${id}.mp3`), { force: true });
  await rmdir(work);
}
