'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const C = require('../public/catalog');
const S = require('../public/subtitles');
const {scanLibrary} = require('../lib/library');
const collection = C.collections.find(item => item.id === (process.argv[2] || 'spongebob-s03'));
if (!collection) throw new Error('Choose a configured collection.');
const root = path.join(__dirname,'..','media');
const read = file => JSON.parse(fs.readFileSync(file,'utf8'));
const digest = data => createHash('sha256').update(data).digest('hex');
async function fileDigest(file) {const hash = createHash('sha256');for await (const chunk of fs.createReadStream(file)) hash.update(chunk);return hash.digest('hex');}
function fastStart(file,bytes) {
  const descriptor = fs.openSync(file,'r'),header = Buffer.alloc(16);let position = 0,moov = -1,mdat = -1;
  try {
    for (let box = 0;box < 24 && position < bytes;box++) {
      if (fs.readSync(descriptor,header,0,16,position) < 8) break;
      let size = header.readUInt32BE(0);const kind = header.toString('ascii',4,8);
      if (size === 1) size = Number(header.readBigUInt64BE(8));
      if (kind === 'moov') moov = position;if (kind === 'mdat') mdat = position;
      if (size < 8) break;position += size;
    }
    return moov >= 0 && mdat >= 0 && moov < mdat;
  } finally {fs.closeSync(descriptor);}
}
(async () => {
  const manifest = read(path.join(root,'dub-transcripts','manifest.json')),library = await scanLibrary(root);
  const translationFile = path.join(root,'translations','manifest.json');
  const translations = fs.existsSync(translationFile) ? read(translationFile).episodes : {};
  const report = {checkedAt:new Date().toISOString(),collection:collection.id,episodes:[],missingVideos:[],missingGerman:[],errors:[]};
  for (const entry of C.inCollection(collection.id)) {
    const {id,file} = entry,video = path.join(root,`${file}.mp4`),episode = {id,tracks:[]};
    if (!fs.existsSync(video)) {report.missingVideos.push(id);continue;}
    try {
      const info = JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration,size:stream=codec_type,codec_name,width,height','-of','json',video],{encoding:'utf8',windowsHide:true,timeout:30000}));
      episode.duration = Number(info.format.duration);episode.bytes = Number(info.format.size);episode.streams = info.streams;episode.fastStart = fastStart(video,episode.bytes);
      if (episode.duration < 300 || episode.duration > 4000 || !info.streams.some(s => s.codec_type === 'video' && s.codec_name === 'h264') || !info.streams.some(s => s.codec_type === 'audio' && s.codec_name === 'aac')) throw new Error('Unexpected duration or media codecs.');
      if (!episode.fastStart) throw new Error('MP4 metadata follows its media data; optimize for streaming.');
      for (const code of ['de','ar','en']) {
        const subtitle = path.join(root,`${file}.${code}.srt`);
        if (!fs.existsSync(subtitle)) {if (code === 'de') report.missingGerman.push(id);continue;}
        const data = fs.readFileSync(subtitle),cues = S.parse(data.toString('utf8'));
        if (cues.length < 50 || cues.some(cue => cue.start < 0 || cue.end > episode.duration+0.3)) throw new Error(`${code}: invalid cue count or out-of-bounds subtitle timing.`);
        episode.tracks.push({code,cues:cues.length,first:cues[0].start,last:cues.at(-1).end});
        if (code === 'de') {
          const source = manifest.episodes[id],raw = read(path.join(root,'dub-transcripts',`${id}.words.json`));
          const track = library.find(item => item.id === id)?.tracks.find(item => item.code === 'de');
          if (!source || source.status !== 'complete' || source.kind !== 'audio-transcript' || source.cue_count !== cues.length || source.srt_sha256 !== digest(data) || source.video_sha256 !== await fileDigest(video) || raw.video_sha256 !== source.video_sha256 || !raw.complete || raw.pipeline_version !== 3 || raw.language !== 'de' || raw.task !== 'transcribe' || track?.kind !== 'audio-transcript' || track.revision !== source.srt_sha256) throw new Error('German subtitles do not match their actual German-audio provenance.');
          episode.humanVerified = false;episode.recognizedWords = source.word_count;episode.reviewPassages = source.review_flags;
        }
        if (code === 'ar' && translations[id]) {
          const source=translations[id],germanData=fs.readFileSync(path.join(root,`${file}.de.srt`));
          const german=S.parse(germanData.toString('utf8')),track=library.find(item=>item.id===id)?.tracks.find(item=>item.code==='ar');
          if (source.status!=='complete' || source.kind!=='ai-translation' || source.language!=='ar' || source.srt_sha256!==digest(data) || source.source_sha256!==digest(germanData) || source.cue_count!==cues.length || source.source_cues!==german.length || track?.kind!=='ai-translation' || !cues.every(cue=>german.some(g=>Math.abs(g.start-cue.start)<0.002) && german.some(g=>Math.abs(g.end-cue.end)<0.002))) throw new Error('Arabic translation hash, German source or cue boundaries do not match.');
          episode.arabicKind=source.kind;episode.arabicModel=source.model.repository;
        }
      }
    } catch (error) {report.errors.push({id,error:error.message});}
    report.episodes.push(episode);
  }
  report.summary = {videos:report.episodes.length,german:report.episodes.filter(e => e.tracks.some(t => t.code === 'de')).length,arabic:report.episodes.filter(e => e.tracks.some(t => t.code === 'ar')).length,fastStart:report.episodes.filter(e => e.fastStart).length,bytes:report.episodes.reduce((sum,e) => sum+(e.bytes || 0),0),humanVerified:false};
  fs.writeFileSync(path.join(root,`${collection.series}.s${String(collection.season).padStart(2,'0')}.validation.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify({summary:report.summary,missingVideos:report.missingVideos,missingGerman:report.missingGerman,errors:report.errors},null,2));
  if (report.errors.length || report.missingVideos.length || report.missingGerman.length) process.exitCode = 1;
})().catch(error => {console.error(error.message);process.exitCode = 1;});
