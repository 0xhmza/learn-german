import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream';
import path from 'node:path';
import catalog from '../public/catalog.js';
import subtitles from '../public/subtitles.js';
import library from '../lib/library.js';
import { buildListeningClips, transcriptRevision } from './src/js/engine/listening-clips.js';

const { safeFile } = library;
const readManifest = root => readFile(path.join(root, 'dub-transcripts', 'manifest.json'), 'utf8')
  .then(JSON.parse).then(manifest => manifest.episodes).catch(() => ({}));

export async function loadListeningLibrary(roots) {
  const pairs = await Promise.all(roots.map(async root => ({ root, records: await readManifest(root) })));
  const available = await Promise.all(catalog.episodes.map(async episode => {
    for (const { root, records } of pairs) {
      const german = `${episode.file}.de.srt`;
      const info = records?.[episode.id] ?? records?.[episode.file];
      if (info?.status !== 'complete' || info.kind !== 'audio-transcript' || info.file !== german || !/^[0-9a-f]{64}$/.test(info.srt_sha256)) continue;
      const [video, transcript] = await Promise.all([
        safeFile(root, `${episode.file}.mp4`), safeFile(root, german)
      ]);
      if (!video || !transcript) continue;
      try {
        const text = await readFile(transcript, 'utf8');
        if (createHash('sha256').update(text).digest('hex') !== info.srt_sha256) continue;
        const clips = buildListeningClips(episode.file, subtitles.parse(text), transcriptRevision(text));
        if (clips.length) return [episode.file, { id: episode.file, label: episode.label, series: episode.series, video, clips }];
      } catch { /* Skip a sidecar that cannot be read or parsed. */ }
    }
    return null;
  }));
  return new Map(available.filter(Boolean));
}

export async function streamListeningAudio(req, res, file) {
  const { size } = await stat(file);
  let start = 0;
  let end = size - 1;
  const headers = {
    'Content-Type': file.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4',
    'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff'
  };
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }).end();
    start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    if (match[1] && match[2]) end = Math.min(end, Number(match[2]));
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
      return res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }).end();
    }
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  res.writeHead(range ? 206 : 200, { ...headers, 'Content-Length': Math.max(0, end - start + 1) });
  if (req.method === 'HEAD' || !size) return res.end();
  pipeline(createReadStream(file, { start, end }), res, () => {});
}

export function createListeningApi(roots) {
  let loading;
  let staleAt = 0;
  const json = (res, value, status = 200, head = false) =>
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      .end(head ? '' : JSON.stringify(value));
  return async function handle(req, res, pathname) {
    if (!/^\/(?:api\/hoeren)(?:\/|$)/.test(pathname)) return false;
    const host = req.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host) || (req.headers.origin && req.headers.origin !== `http://${host}`) ||
      ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])) {
      json(res, { error: 'Local listening library.' }, 403);
      return true;
    }
    const route = /^\/api\/hoeren(?:\/((?:simpsons|spongebob)\.s\d{2}e\d{2})(\/audio)?)?$/.exec(pathname);
    if (!route) { json(res, { error: 'Unknown listening resource.' }, 404); return true; }
    if (!loading || Date.now() >= staleAt) {
      staleAt = Date.now() + 30000;
      loading = loadListeningLibrary(roots);
    }
    const episodes = await loading;
    const head = req.method === 'HEAD';
    if (!route[1]) {
      const result = [...episodes.values()].map(({ id, label, series, clips }) => ({ id, label, series, count: clips.length }));
      json(res, { episodes: result }, 200, head);
    } else {
      const episode = episodes.get(route[1]);
      if (!episode) json(res, { error: 'Episode unavailable.' }, 404, head);
      else if (route[2]) await streamListeningAudio(req, res, episode.video);
      else json(res, { clips: episode.clips }, 200, head);
    }
    return true;
  };
}
