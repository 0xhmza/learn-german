import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { context, freshState } from './support/context.js';
import { createApp } from '../server.js';
import { loadListeningLibrary } from '../listening-library.js';
import subtitles from '../../public/subtitles.js';
import { buildListeningClips } from '../src/js/engine/listening-clips.js';
import { checkListening, listeningAssessment, makeListeningRun, normalizeListening } from '../src/js/engine/listening.js';
import { skillResults } from '../src/js/components/skills-radar.js';
import { parse } from '../src/js/router.js';
import { setLang } from '../src/js/i18n/index.js';
import { render } from '../src/js/views/listening.js';

const transcript = [
  '1\n00:00:00,000 --> 00:00:03,000\n[Musik im Hintergrund]',
  '2\n00:00:03,500 --> 00:00:07,500\nWenn du die richtige Adresse hast, kannst du am Vormittag vorbeikommen.',
  '3\n00:00:08,000 --> 00:00:11,000\nIch bin da.',
  '4\n00:00:12,000 --> 00:00:16,000\nWenn du die richtige Adresse hast, kannst du am Vormittag vorbeikommen.',
  '5\n00:00:17,000 --> 00:00:24,000\nIch melde mich später, weil die Besprechung heute länger dauert.'
].join('\n\n');

test('the clip filter keeps clean, complete sentences with B1 language and their source offsets', () => {
  const clips = buildListeningClips('simpsons.s06e01', subtitles.parse(transcript), 'abc');
  assert.equal(clips.length, 2);
  assert.deepEqual(clips.map(clip => clip.id), ['simpsons.s06e01-abc-3500', 'simpsons.s06e01-abc-17000']);
  assert.equal(clips[0].word.answer, 'Wenn');
  assert.equal(clips[1].phrase.before + clips[1].phrase.answer + clips[1].phrase.after, clips[1].text);
  assert.ok(clips[0].start >= 3 && clips[0].start <= 3.5 && clips[0].end > 7.5 && clips[0].end < 8);
});

test('grading distinguishes plausible hearing from standard German spelling', () => {
  assert.deepEqual(checkListening({ answer: 'fünfzehn Grüße' }, '15 Gruesse!'), { correct: true, spelling: false });
  assert.deepEqual(checkListening({ answer: 'heute später' }, 'Heute später.'), { correct: true, spelling: true });
  assert.equal(checkListening({ answer: 'nicht mehr' }, 'noch mehr').correct, false);
  assert.equal(checkListening({ options: ['A', 'B', 'C'], answer: 1 }, '1').correct, true);
});

test('Hörcheck results survive reload, and only assessed work reaches the radar', () => {
  const ctx = context();
  const state = freshState(ctx);
  const scene = ctx.listeningAssessment[0];
  const everyday = ctx.listeningChapters[0].scenes[0];
  const perfect = item => ({ answers: item.tasks.map(task => String(task.answer)), submitted: true, plays: 2 });
  const initial = { runs: { [scene.id]: perfect(scene), [everyday.id]: perfect(everyday) },
    clips: { 'simpsons.s06e01-abc-3500': 'skipped', invalid: 'done' } };
  state.listening = normalizeListening(initial, ctx.listeningScenes);
  assert.equal(Object.keys(state.listening.clips).length, 1);
  assert.deepEqual(listeningAssessment(ctx, state), { correct: 4, total: 4 });
  assert.deepEqual(skillResults(ctx, state)[3], { value: 100, count: 4 });
  initial.runs[scene.id].plays = 0;
  state.listening = normalizeListening(initial, ctx.listeningScenes);
  assert.equal(listeningAssessment(ctx, state).total, 0);
});

test('the B1 route hides the transcript and targeted replay before grading a Hörcheck', () => {
  const ctx = context();
  const state = freshState(ctx);
  setLang('de');
  for (const chapter of ctx.listeningChapters) assert.equal(parse(`#hoeren/${chapter.id}`, ctx).view, 'listening');
  const scene = ctx.listeningAssessment[0];
  const route = parse(`#hoeren/${scene.id}`, ctx);
  const app = { ctx, state };
  const before = render(app, route);
  assert.match(before, /2 Wiedergaben übrig/);
  assert.doesNotMatch(before, /Gesamten Text lesen|data-action="listen-excerpt"/);
  state.listening.runs[scene.id] = { ...makeListeningRun(scene), plays: 2, submitted: true, answers: scene.tasks.map(task => String(task.answer)) };
  const reviewed = render(app, route);
  assert.match(reviewed, /Gesamten Text lesen/);
  assert.match(reviewed, /4 \/ 4/);
});

test('local episode discovery uses a hashed German transcript and serves byte ranges', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'deutschpfad-listening-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const german = 'simpsons.s06e01.de.srt';
  await mkdir(path.join(root, 'dub-transcripts'));
  await writeFile(path.join(root, german), transcript);
  await writeFile(path.join(root, 'simpsons.s06e01.mp4'), Buffer.alloc(96));
  await writeFile(path.join(root, 'simpsons.s06e02.de.srt'), transcript);
  await writeFile(path.join(root, 'simpsons.s06e02.mp4'), Buffer.alloc(96));
  const srt_sha256 = createHash('sha256').update(transcript).digest('hex');
  await writeFile(path.join(root, 'dub-transcripts', 'manifest.json'), JSON.stringify({ episodes: {
    s06e01: { file: german, status: 'complete', kind: 'audio-transcript', srt_sha256 },
    s06e02: { file: 'simpsons.s06e02.de.srt', status: 'complete', kind: 'audio-transcript', srt_sha256: '0'.repeat(64) }
  } }));
  const library = await loadListeningLibrary([root]);
  assert.deepEqual([...library.keys()], ['simpsons.s06e01']);
  const app = createApp({ listeningMediaRoots: [root] }).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => app.close(resolve)));
  await new Promise(resolve => app.once('listening', resolve));
  const origin = `http://127.0.0.1:${app.address().port}`;
  const list = await (await fetch(origin + '/api/hoeren')).json();
  assert.equal(list.episodes[0].count, 2);
  assert.equal(Object.hasOwn(list.episodes[0], 'video'), false);
  const episode = await (await fetch(origin + '/api/hoeren/simpsons.s06e01')).json();
  assert.equal(episode.clips.length, 2);
  const audio = await fetch(origin + '/api/hoeren/simpsons.s06e01/audio', { headers: { Range: 'bytes=1-11' } });
  assert.equal(audio.status, 206);
  assert.equal(audio.headers.get('content-range'), 'bytes 1-11/96');
  assert.equal((await audio.arrayBuffer()).byteLength, 11);
  const recording = await fetch(origin + '/listening-audio/treffpunkt.mp3', { headers: { Range: 'bytes=0-40' } });
  assert.equal(recording.status, 206);
  assert.equal(recording.headers.get('content-type'), 'audio/mpeg');
  assert.equal((await recording.arrayBuffer()).byteLength, 41);
  const blocked = await fetch(origin + '/api/hoeren', { headers: { Origin: 'https://example.test' } });
  assert.equal(blocked.status, 403);
});
