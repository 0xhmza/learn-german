'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
const {parseArgs} = require('node:util');
const {scanLibrary,safeFile} = require('../lib/library');
const format = require('../public/secure-format');

const MIME = {mp4:'video/mp4',m4v:'video/mp4',webm:'video/webm',srt:'text/plain',vtt:'text/plain'};

async function encryptAsset(source,output,key) {
  const id = randomBytes(16).toString('hex');
  const input = await fs.open(source,'r');
  try {
    const {size} = await input.stat();
    if (!size) throw new Error(`Empty media file: ${path.basename(source)}`);
    const target = await fs.open(path.join(output,`${id}.szc`),'wx',0o600);
    try {
      const buffer = Buffer.allocUnsafe(format.chunkBytes);
      for (let offset = 0; offset < size; offset += buffer.length) {
        const length = Math.min(buffer.length,size-offset);
        const {bytesRead} = await input.read(buffer,0,length,offset);
        if (bytesRead !== length) throw new Error(`Media changed while packing: ${path.basename(source)}`);
        const encrypted = await format.seal(key,id,offset/buffer.length,buffer.subarray(0,length));
        await target.writeFile(encrypted);
      }
    } finally {await target.close();}
    return {id,size,type:MIME[path.extname(source).slice(1).toLowerCase()]};
  } finally {await input.close();}
}

async function pack({source,output,keyFile,log = console.log}) {
  const episodes = (await scanLibrary(source)).filter(episode => episode.video);
  if (!episodes.length) throw new Error('The source folder has no recognized episode videos.');
  const absoluteOutput = path.resolve(output);
  const keyPath = path.resolve(keyFile);
  if (keyPath === absoluteOutput || keyPath.startsWith(absoluteOutput+path.sep)) throw new Error('Keep the key file outside the upload directory.');
  const publicPath = path.resolve(__dirname,'../public');
  const distPath = path.resolve(__dirname,'../dist');
  for (const served of [publicPath,distPath]) {
    if ([absoluteOutput,keyPath].some(target => target === served || target.startsWith(served+path.sep))) throw new Error('Keep media and keys outside the static site.');
  }
  let keyText;
  try {keyText = (await fs.readFile(keyFile,'utf8')).trim();}
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.mkdir(path.dirname(keyFile),{recursive:true});
    keyText = randomBytes(32).toString('hex');
    await fs.writeFile(keyFile,keyText+'\n',{flag:'wx',mode:0o600});
  }
  const key = await format.importKey(keyText);
  await fs.mkdir(output,{recursive:true});
  const result = [];
  async function asset(url) {
    const name = decodeURIComponent(url.split('?')[0].slice('/media/'.length));
    const file = await safeFile(source,name);
    if (!file) throw new Error(`Media file is missing: ${name}`);
    return encryptAsset(file,output,key);
  }
  for (const episode of episodes) {
    const video = await asset(episode.video);
    const tracks = [];
    for (const {url,...track} of episode.tracks) tracks.push({...track,asset:await asset(url)});
    result.push({id:episode.id,video,tracks});
    log(`Packed ${episode.id} with ${tracks.length} subtitle tracks.`);
  }
  const index = await format.sealJSON(key,'library', {version:1,episodes:result});
  if (index.length > format.chunkBytes) throw new Error('Encrypted library index is too large.');
  const temporary = path.join(output,`library.${randomBytes(8).toString('hex')}.tmp`);
  await fs.writeFile(temporary,index,{flag:'wx',mode:0o600});
  await fs.rename(temporary,path.join(output,'library.szc'));
  return result;
}

if (require.main === module) {
  const {values} = parseArgs({options:{source:{type:'string',default:'media'},output:{type:'string',default:'encrypted-library'},'key-file':{type:'string',default:'.keys/media.key'}}});
  pack({source:values.source,output:values.output,keyFile:values['key-file']}).then(episodes => {
    console.log(`Packed ${episodes.length} episodes. Upload ${path.resolve(values.output)}. Keep ${path.resolve(values['key-file'])} private.`);
  }).catch(error => {console.error(error.message);process.exitCode = 1;});
}

module.exports = {pack};
