'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {scanLibrary} = require('../lib/library');
const S = require('../public/subtitles');
const root = path.join(__dirname,'..','media');
const work = path.join(root,'dub-transcripts');
const digest = buffer => createHash('sha256').update(buffer).digest('hex');
async function fileDigest(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(work,'manifest.json'),'utf8'));
  const episodes = await scanLibrary(root);
  const report = {checkedAt:new Date().toISOString(),episodes:[],errors:[]};
  for (let number = 1;number <= 25;number++) {
    const id = `s06e${String(number).padStart(2,'0')}`;
    try {
      const meta = manifest.episodes[id];
      if (!meta || meta.status !== 'complete') throw new Error('Audio transcription has not completed.');
      const raw = JSON.parse(fs.readFileSync(path.join(work,`${id}.words.json`),'utf8'));
      if (!raw.complete || raw.language !== 'de' || raw.task !== 'transcribe' || raw.pipeline_version !== 3) throw new Error('The cached recognition task is incomplete or is not German transcription.');
      if (raw.video_sha256 !== meta.video_sha256 || await fileDigest(path.join(root,`simpsons.${id}.mp4`)) !== raw.video_sha256) throw new Error('The transcript was generated from a different video file.');
      const file = path.join(root,`simpsons.${id}.de.srt`);
      const data = fs.readFileSync(file), cues = S.parse(data.toString('utf8'));
      if (digest(data) !== meta.srt_sha256) throw new Error('The SRT hash does not match the audio-transcript manifest.');
      if (cues.length !== meta.cue_count || cues.some(cue=>cue.start < 0 || cue.end > raw.duration+0.2)) throw new Error('Invalid cue count or timing.');
      const advertised = episodes.find(episode=>episode.id === id)?.tracks.find(track=>track.code === 'de');
      if (advertised?.kind !== 'audio-transcript' || advertised.revision !== meta.srt_sha256) throw new Error('The library did not select the corrected track.');
      const backup = path.join(work,'previous-subtitles',path.basename(file));
      if (!fs.existsSync(backup)) throw new Error('The previous German subtitle file was not backed up.');
      if (digest(fs.readFileSync(backup)) === meta.srt_sha256) throw new Error('The old subtitle file is still installed.');
      if (!fs.existsSync(path.join(root,`simpsons.${id}.ar.srt`))) throw new Error('The Arabic subtitle file is missing.');
      report.episodes.push({id,cues:cues.length,recognizedWords:meta.word_count,reviewPassages:meta.review_flags,humanVerified:meta.human_verified,source:advertised.source});
    } catch (error) {report.errors.push({id,error:error.message});}
  }
  report.summary = {audioTranscripts:report.episodes.length,recognizedWords:report.episodes.reduce((sum,episode)=>sum+episode.recognizedWords,0),cues:report.episodes.reduce((sum,episode)=>sum+episode.cues,0),reviewPassages:report.episodes.reduce((sum,episode)=>sum+episode.reviewPassages,0),humanVerified:false};
  fs.writeFileSync(path.join(work,'validation.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({summary:report.summary,errors:report.errors},null,2));
  if (report.errors.length) process.exitCode = 1;
})().catch(error=>{console.error(error.message);process.exitCode = 1;});
