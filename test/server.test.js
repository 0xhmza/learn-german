'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createApp} = require('../server');
const {scanLibrary,safeFile} = require('../lib/library');
const {createHash} = require('node:crypto');

async function fixture(t,options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'sprechzimmer-test-'));
  const media = path.join(root,'media');await fs.mkdir(media);
  await fs.writeFile(path.join(media,'simpsons.s06e01.mp4'),'0123456789');
  await fs.writeFile(path.join(media,'simpsons.s06e01.de.srt'),'1\n00:00:00,100 --> 00:00:01,000\nHallo');
  await fs.writeFile(path.join(media,'simpsons.s06e01.ar.srt'),'1\n00:00:00,100 --> 00:00:01,000\nمرحبا');
  await fs.writeFile(path.join(media,'private.txt'),'private');
  const server = createApp({mediaDirectory:media,...options});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(async () => {await new Promise(resolve => server.close(resolve));await fs.rm(root,{recursive:true,force:true});});
  return {base:`http://127.0.0.1:${server.address().port}`,media,root};
}
test('library reports actual video and language availability',async t => {
  const {base,media} = await fixture(t);
  const response = await fetch(`${base}/api/library`),data = await response.json();
  assert.equal(response.status,200);assert.equal(data.episodes.length,1);assert.equal(data.episodes[0].id,'s06e01');
  assert.deepEqual(data.episodes[0].tracks.map(track => track.code),['ar','de']);
  await fs.writeFile(path.join(media,'ignore.s06e26.mp4'),'invalid');assert.equal((await scanLibrary(media)).length,1);
});

test('audio transcript provenance is advertised only when the actual file matches its hash',async t => {
  const {media} = await fixture(t);
  const file = 'simpsons.s06e01.de.srt';
  const digest = createHash('sha256').update(await fs.readFile(path.join(media,file))).digest('hex');
  await fs.mkdir(path.join(media,'dub-transcripts'));
  await fs.writeFile(path.join(media,'dub-transcripts','manifest.json'),JSON.stringify({episodes:{s06e01:{status:'complete',kind:'audio-transcript',file,srt_sha256:digest}}}));
  let track = (await scanLibrary(media))[0].tracks.find(track=>track.code === 'de');
  assert.equal(track.kind,'audio-transcript');assert.equal(track.humanVerified,false);assert.match(track.url,/\?v=/);
  await fs.appendFile(path.join(media,file),'\nChanged');
  track = (await scanLibrary(media))[0].tracks.find(track=>track.code === 'de');
  assert.equal(track.kind,undefined);assert.equal(track.source,'Imported file');
});

test('multiple series expose independent media and audio transcript provenance',async t => {
  const {base,media} = await fixture(t);
  const id = 'spongebob.s03e01',file = `${id}.de.srt`;
  await fs.writeFile(path.join(media,`${id}.mp4`),'SpongeBob video');
  await fs.writeFile(path.join(media,file),'1\n00:00:00,100 --> 00:00:01,000\nHallo SpongeBob');
  await fs.mkdir(path.join(media,'dub-transcripts'));
  const digest = createHash('sha256').update(await fs.readFile(path.join(media,file))).digest('hex');
  await fs.writeFile(path.join(media,'dub-transcripts','manifest.json'),JSON.stringify({episodes:{[id]:{status:'complete',kind:'audio-transcript',file,srt_sha256:digest}}}));
  const data = await (await fetch(`${base}/api/library`)).json();
  assert.equal(data.episodes.length,2);
  const sponge = data.episodes.find(episode => episode.id === id),simpsons = data.episodes.find(episode => episode.id === 's06e01');
  assert.equal(sponge.series,'spongebob');assert.equal(sponge.season,3);assert.equal(sponge.number,1);
  assert.equal(sponge.tracks[0].kind,'audio-transcript');assert.equal(sponge.tracks[0].humanVerified,false);
  assert.match(sponge.video,/spongebob/);assert.match(simpsons.video,/simpsons/);
});
test('Arabic translation provenance requires the installed Arabic hash to match',async t => {
  const {media} = await fixture(t),id='s06e01',file='simpsons.s06e01.ar.srt';
  const hash=createHash('sha256').update(await fs.readFile(path.join(media,file))).digest('hex');
  await fs.mkdir(path.join(media,'translations'));
  await fs.writeFile(path.join(media,'translations','manifest.json'),JSON.stringify({episodes:{[id]:{status:'complete',language:'ar',kind:'ai-translation',file,srt_sha256:hash,source_sha256:'a'.repeat(64)}}}));
  let track=(await scanLibrary(media))[0].tracks.find(t=>t.code==='ar');
  assert.equal(track.kind,'ai-translation');assert.equal(track.humanVerified,false);assert.equal(track.sourceRevision,'a'.repeat(64));assert.match(track.url,/\?v=/);
  await fs.appendFile(path.join(media,file),'\nEdited Arabic');
  track=(await scanLibrary(media))[0].tracks.find(t=>t.code==='ar');assert.equal(track.kind,undefined);assert.equal(track.source,'Imported file');
});
test('offline player styles use the response CSP nonce without allowing inline scripts',async t => {
  const {base}=await fixture(t),page=await fetch(base),policy=page.headers.get('Content-Security-Policy');
  const nonce=policy.match(/style-src 'self' 'nonce-([^']+)'/)[1];
  assert.match(policy,/script-src 'self';/);assert.doesNotMatch(policy,/unsafe-inline/);
  const bundle=await fetch(`${base}/vendor/media-chrome.js`),text=await bundle.text();
  assert.equal(bundle.status,200);assert.ok(text.includes(`<style nonce=${nonce}>`));assert.ok(!text.includes('<style>'));
  assert.equal(bundle.headers.get('Content-Length'),String(Buffer.byteLength(text)));
  const head=await fetch(`${base}/vendor/media-chrome.js`,{method:'HEAD'});assert.equal(await head.text(),'');assert.equal(head.headers.get('Content-Length'),bundle.headers.get('Content-Length'));
});
test('video streaming supports bounded, suffix and open byte ranges plus HEAD',async t => {
  const {base} = await fixture(t);const url = `${base}/media/simpsons.s06e01.mp4`;
  for (const [range,expected,contentRange] of [['bytes=2-5','2345','bytes 2-5/10'],['bytes=-3','789','bytes 7-9/10'],['bytes=8-','89','bytes 8-9/10'],['bytes=8-999','89','bytes 8-9/10']]) {
    const response = await fetch(url,{headers:{Range:range}});assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),contentRange);assert.equal(await response.text(),expected);
  }
  const head = await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('Content-Length'),'10');assert.equal(await head.text(),'');
});
test('invalid ranges return 416 without reading the full video',async t => {
  const {base} = await fixture(t);
  for (const Range of ['bytes=10-','bytes=7-2','bytes=0-1,4-5','bytes=-0','bytes=-']) {
    const response = await fetch(`${base}/media/simpsons.s06e01.mp4`,{headers:{Range}});assert.equal(response.status,416,Range);assert.equal(response.headers.get('Content-Range'),'bytes */10');
  }
});
test('static app is served with local assets and private media files stay inaccessible',async t => {
  const {base,root,media} = await fixture(t);
  const page = await fetch(base);assert.equal(page.status,200);assert.match(await page.text(),/Sprechzimmer/);assert.match(page.headers.get('Content-Security-Policy'),/default-src 'self'/);
  assert.equal((await fetch(`${base}/app.js`)).status,200);
  assert.equal((await fetch(`${base}/media/private.txt`)).status,404);
  assert.equal((await fetch(`${base}/%ZZ`)).status,400);
  assert.equal(await safeFile(media,'../private.txt'),null);
  await fs.writeFile(path.join(root,'outside.mp4'),'secret');assert.equal(await safeFile(media,path.join(root,'outside.mp4')),null);
});
test('cross-origin POST and unsupported methods are rejected',async t => {
  const {base} = await fixture(t);
  assert.equal((await fetch(`${base}/api/translate`,{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(base,{method:'DELETE'})).status,405);
});
test('AI endpoint validates input and reports unconfigured local service truthfully',async t => {
  const {base} = await fixture(t,{fetcher:async () => {throw new Error('offline');}});
  const status = await (await fetch(`${base}/api/ai/status`)).json();assert.equal(status.available,false);
  for (const body of [{language:'ar',texts:[]},{language:'de',texts:['Hallo']},{language:'bad',texts:['Hallo']},{language:'constructor',texts:['Hallo']},{language:'ar',texts:[null]},null]) {
    assert.equal((await fetch(`${base}/api/translate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,400);
  }
  const response = await fetch(`${base}/api/translate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'ar',texts:['Hallo']})});assert.equal(response.status,503);
});
test('local AI translation preserves input ordering and uses JSON schema output',async t => {
  let request;
  const {base} = await fixture(t,{fetcher:async (url,options) => {
    if (url.endsWith('/api/tags')) return Response.json({models:[{name:'test-multilingual'}]});
    request = JSON.parse(options.body);
    return Response.json({message:{content:JSON.stringify({translations:['مرحبًا','شكرًا']})}});
  }});
  const response = await fetch(`${base}/api/translate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'ar',texts:['Hallo','Danke']})});
  assert.equal(response.status,200);assert.deepEqual((await response.json()).translations,['مرحبًا','شكرًا']);
  assert.equal(request.stream,false);assert.equal(request.format.properties.translations.minItems,2);assert.deepEqual(JSON.parse(request.messages[1].content),['Hallo','Danke']);
});
test('incomplete AI output is rejected instead of corrupting the subtitle track',async t => {
  const {base} = await fixture(t,{fetcher:async url => Response.json(url.endsWith('/api/tags') ? {models:[{name:'test'}]} : {message:{content:'{"translations":[]}'}})});
  const response = await fetch(`${base}/api/translate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'ar',texts:['Hallo']})});assert.equal(response.status,503);assert.match((await response.json()).error,/incomplete/);
});
