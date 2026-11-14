'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const S = require('../public/subtitles');
const root = path.join(__dirname,'..','media');
const report = {verifiedAt:new Date().toISOString(),episodes:[],missingVideos:[],errors:[]};
let status;
try {status = JSON.parse(fs.readFileSync(path.join(root,'download-status.json'),'utf8'));} catch {status = {episodes:{}};}
for (let number = 1;number <= 25;number++) {
  const id = `s06e${String(number).padStart(2,'0')}`;
  const file = path.join(root,`simpsons.${id}.mp4`);
  const episode = {id,tracks:[]};
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate','-of','json',file],{encoding:'utf8',windowsHide:true,timeout:30000}));
      episode.duration = Number(data.format.duration);episode.bytes = Number(data.format.size);episode.streams = data.streams;
      if (episode.duration < 900 || episode.duration > 2000 || !data.streams.some(s=>s.codec_type === 'video' && s.codec_name === 'h264') || !data.streams.some(s=>s.codec_type === 'audio' && s.codec_name === 'aac')) throw new Error('Unexpected duration or codecs.');
      const descriptor = fs.openSync(file,'r');
      try {
        let position = 0, moov = -1, mdat = -1;
        const header = Buffer.alloc(16);
        for (let box = 0;box < 12 && position < episode.bytes;box++) {
          const length = fs.readSync(descriptor,header,0,16,position);if (length < 8) break;
          let size = header.readUInt32BE(0);const kind = header.toString('ascii',4,8);
          if (size === 1) size = Number(header.readBigUInt64BE(8));
          if (kind === 'moov') moov = position;if (kind === 'mdat') mdat = position;
          if (size < 8) break;position += size;
        }
        episode.fastStart = moov >= 0 && mdat >= 0 && moov < mdat;
        if (!episode.fastStart) throw new Error('MP4 metadata should precede media data for efficient playback.');
      } finally {fs.closeSync(descriptor);}
      status.episodes[id] = {...status.episodes[id],status:'complete',file:path.basename(file),duration:episode.duration,bytes:episode.bytes,streams:episode.streams,fastStart:episode.fastStart};
      delete status.episodes[id].error;
      status.episodes[id].downloaded_bytes = episode.bytes;
      status.episodes[id].total_bytes_estimate = episode.bytes;
    } catch (error) {report.errors.push(`${id}: ${error.message}`);}
  } else {
    report.missingVideos.push(id);
    if (status.episodes[id]?.error?.includes('player configuration')) status.episodes[id] = {...status.episodes[id],status:'verification_required',error:'The source requires browser verification before exposing this playback link.'};
  }
  for (const language of ['de','ar']) {
    const subtitle = path.join(root,`simpsons.${id}.${language}.srt`);
    try {
      const cues = S.parse(fs.readFileSync(subtitle,'utf8'));
      if (cues.length < 100) throw new Error('Incomplete subtitle track.');
      const last = cues.at(-1).end;
      if (episode.duration && last > episode.duration + 5) throw new Error(`Subtitle timing exceeds video duration by ${(last-episode.duration).toFixed(1)} seconds.`);
      episode.tracks.push({language,cues:cues.length,last});
    } catch (error) {report.errors.push(`${id} ${language}: ${error.message}`);}
  }
  report.episodes.push(episode);
}
const complete = report.episodes.filter(episode=>episode.duration && episode.fastStart).length;
report.summary = {videos:complete,german:report.episodes.filter(episode=>episode.tracks.some(track=>track.language === 'de')).length,arabic:report.episodes.filter(episode=>episode.tracks.some(track=>track.language === 'ar')).length,bytes:report.episodes.reduce((sum,episode)=>sum+(episode.bytes || 0),0)};
status.updated = report.verifiedAt;
fs.writeFileSync(path.join(root,'download-status.json'),JSON.stringify(status,null,2));
fs.writeFileSync(path.join(root,'media-validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({summary:report.summary,missingVideos:report.missingVideos,errors:report.errors},null,2));
if (report.errors.length) process.exitCode = 1;
