'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {randomBytes} = require('node:crypto');
const format = require('../public/secure-format');
const codec = require('../public/lock-codec');
const {createGateway} = require('../gateway');
const {pack} = require('../scripts/pack-encrypted-media');
const {executable,credentials,sftpPath,serveSftp} = require('./support/sftp.cjs');

test('one access code carries the key and authenticates the connection profile',async () => {
  const secret = randomBytes(32).toString('hex');
  const profile = {mode:'storage-box',root:'https://test.your-storagebox.de/',username:'test',password:'with spaces',
    catalogFile:`${randomBytes(16).toString('hex')}.szi`};
  const code = await codec.makeCode(secret,profile);
  assert.doesNotMatch(code,/\s/);
  assert.deepEqual(await codec.readCode(code),{secret,profile});
  const [version,,payload] = code.split('.');
  await assert.rejects(codec.readCode([version,randomBytes(32).toString('base64url'),payload].join('.')));
});

test('media blocks authenticate their content, file identity and position',async () => {
  const key = await format.importKey(randomBytes(32).toString('hex'));
  const plaintext = Buffer.from('sample');
  const cipher = await format.seal(key,'asset',3,plaintext);
  assert.deepEqual(Buffer.from(await format.open(key,'asset',3,cipher)),plaintext);
  await assert.rejects(format.open(key,'another',3,cipher));
  await assert.rejects(format.open(key,'asset',4,cipher));
  cipher[cipher.length-1] ^= 1;
  await assert.rejects(format.open(key,'asset',3,cipher));
  assert.equal(format.byteRange('bytes=-0',90),null);
  assert.deepEqual(format.byteRange('bytes=-5',90),{start:85,end:89,partial:true});
});

test('bridge reads encrypted ranges and atomically syncs progress over OpenSSH SFTP',{skip:!executable,timeout:30000},async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'sprechzimmer-sftp-test-'));
  const source = path.join(root,'source'), library = path.join(root,'encrypted'), progress = path.join(root,'progress');
  const keyFile = path.join(root,'key');
  await fs.mkdir(source);await fs.mkdir(progress);
  const sourceBytes = randomBytes(format.chunkBytes+93);
  await fs.writeFile(path.join(source,'spongebob.s03e01.mp4'),sourceBytes);
  const packed = await pack({source,output:library,keyFile,log:() => {}});
  const key = await format.importKey((await fs.readFile(keyFile,'utf8')).trim());
  const catalogName = (await fs.readdir(library)).find(name => format.catalogFilename.test(name));
  assert.ok(catalogName);
  assert.match(catalogName,/^[a-f0-9]{32}\.szi$/);
  assert.match(packed[0].video.id,/^[a-f0-9]{32}$/);
  assert.equal(packed[0].video.name,'spongebob.s03e01.mp4');
  assert.deepEqual((await fs.readdir(library)).sort(),[catalogName,`${packed[0].video.id}.szc`].sort());
  const sftp = await serveSftp();
  const origin = 'https://studio.example.test';
  const config = {sftp:format.sftpAddress(sftp.address),hostKey:sftp.hostKey,origins:new Set([origin]),library:sftpPath(library),progress:sftpPath(progress)};
  const bridge = createGateway(config);
  await new Promise(resolve => bridge.listen(0,'127.0.0.1',resolve));
  t.after(async () => {
    await new Promise(resolve => bridge.close(resolve));
    await sftp.close();
    await fs.rm(root,{recursive:true,force:true});
  });
  const url = `http://127.0.0.1:${bridge.address().port}`;
  const login = {method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({...credentials,address:sftp.address})};
  assert.equal((await fetch(`${url}/v1/session`,{...login,headers:{...login.headers,Origin:'https://other.example.test'}})).status,403);
  assert.equal((await fetch(`${url}/v1/session`,{...login,body:JSON.stringify({...credentials,address:'sftp://other.example.test'})})).status,400);
  const trustedKey = config.hostKey;
  config.hostKey = randomBytes(32);
  assert.equal((await fetch(`${url}/v1/session`,login)).status,401);
  config.hostKey = trustedKey;
  const session = await fetch(`${url}/v1/session`,login);
  assert.equal(session.status,201);
  const {token} = await session.json();
  const headers = {Origin:origin,Authorization:`Bearer ${token}`};
  const get = (file,extra = {}) => fetch(`${url}/v1/${file}`,{headers:{...headers,...extra}});
  const index = await get('assets/library');
  assert.equal(index.status,200);
  assert.equal(index.headers.get('Cache-Control'),'no-store');
  assert.deepEqual((await format.openJSON(key,'library',await index.arrayBuffer())).episodes,packed);
  const {video} = packed[0];
  for (let i = 0; i < 2; i++) {
    const range = format.chunkRange(video.size,i);
    const part = await get(`assets/${video.id}`,{Range:`bytes=${range.start}-${range.end}`});
    assert.equal(part.status,206);
    assert.equal(part.headers.get('Content-Range'),`bytes ${range.start}-${range.end}/${range.total}`);
    const plaintext = await format.open(key,video.id,i,await part.arrayBuffer());
    assert.deepEqual(Buffer.from(plaintext),sourceBytes.subarray(i*format.chunkBytes,i*format.chunkBytes+range.length));
  }
  assert.equal((await get(`assets/${video.id}`)).status,416);
  const empty = await get('progress');
  assert.equal(empty.status,204);
  const put = async (etag,time) => {
    const bytes = await format.sealJSON(key,'test-progress',{time});
    return fetch(`${url}/v1/progress`,{method:'PUT',headers:{...headers,'If-Match':etag,'Content-Type':'application/octet-stream'},body:bytes});
  };
  const first = await put(empty.headers.get('ETag'),27);
  assert.equal(first.status,204);
  const writes = await Promise.all([put(first.headers.get('ETag'),33),put(first.headers.get('ETag'),38)]);
  assert.deepEqual(writes.map(write => write.status).sort(),[204,412]);
  const latest = await get('progress');
  const saved = await format.openJSON(key,'test-progress',await latest.arrayBuffer());
  assert.ok([33,38].includes(saved.time));
  const files = await fs.readdir(progress);
  assert.equal(files.length,1);
  assert.match(files[0],/^[a-f0-9]{64}\.szc$/);
  assert.equal((await fetch(`${url}/v1/session`,{method:'DELETE',headers})).status,204);
  assert.equal((await get('progress')).status,401);
});
