'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const catalog = require('../public/catalog');
const languages = {ar:'Arabic',en:'English',fr:'French',es:'Spanish',tr:'Turkish',fa:'Persian',ur:'Urdu',ru:'Russian',uk:'Ukrainian',it:'Italian',pt:'Portuguese',pl:'Polish',hi:'Hindi',zh:'Chinese',ja:'Japanese',ko:'Korean',de:'German'};
async function scanLibrary(directory) {
  const entries = await fs.readdir(directory,{withFileTypes:true}).catch(err => {if (err.code === 'ENOENT') return []; throw err;});
  const episodes = new Map();
  let transcriptManifest;
  try {transcriptManifest = JSON.parse(await fs.readFile(path.join(directory,'dub-transcripts','manifest.json'),'utf8'));} catch {transcriptManifest = {};}
  let translationManifest;
  try {translationManifest = JSON.parse(await fs.readFile(path.join(directory,'translations','manifest.json'),'utf8'));} catch {translationManifest = {};}
  for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile()) continue;
    const match = catalog.fromFile(entry.name);
    if (!match) continue;
    const {id} = match.episode;
    const episode = episodes.get(id) || {...match.episode,tracks:[]};
    const url = `/media/${encodeURIComponent(entry.name)}`;
    if (/^(mp4|webm|m4v)$/i.test(match.extension)) episode.video = url;
    else if (match.language) {
      const code = match.language;
      if (!episode.tracks.some(track => track.code === code)) {
        const track = {code,name:languages[code] || code.toUpperCase(),url,source:'Imported file'};
        const transcript = transcriptManifest?.episodes?.[id];
        if (code === 'de' && transcript?.status === 'complete' && transcript.kind === 'audio-transcript' && transcript.file === entry.name && /^[a-f0-9]{64}$/.test(transcript.srt_sha256 || '')) {
          const digest = createHash('sha256').update(await fs.readFile(path.join(directory,entry.name))).digest('hex');
          if (digest === transcript.srt_sha256) {
            track.kind = 'audio-transcript';track.revision = digest;
            track.timingReference = /^[a-f0-9]{64}$/.test(transcript.video_sha256 || '') ? transcript.video_sha256 : digest;
            track.source = 'German audio transcript · AI generated';
            track.url += `?v=${digest.slice(0,16)}`;
            track.humanVerified = false;
          }
        }
        const translated = translationManifest?.episodes?.[id];
        if (code !== 'de' && translated?.language === code && translated.status === 'complete' && translated.kind === 'ai-translation' && translated.file === entry.name && /^[a-f0-9]{64}$/.test(translated.srt_sha256 || '')) {
          const digest = createHash('sha256').update(await fs.readFile(path.join(directory,entry.name))).digest('hex');
          if (digest === translated.srt_sha256) {
            track.kind = 'ai-translation';track.revision = digest;track.sourceRevision = translated.source_sha256;
            track.source = 'AI translated from German · local NLLB';track.humanVerified = false;track.url += `?v=${digest.slice(0,16)}`;
          }
        }
        episode.tracks.push(track);
      }
    }
    episodes.set(id,episode);
  }
  return [...episodes.values()];
}
async function safeFile(root, relative) {
  const file = path.resolve(root,relative);
  if (!file.startsWith(path.resolve(root) + path.sep)) return null;
  try {
    const real = await fs.realpath(file);
    if (!real.startsWith(await fs.realpath(root) + path.sep)) return null;
    return (await fs.stat(real)).isFile() ? real : null;
  } catch {return null;}
}
module.exports = {scanLibrary,safeFile,languages};
