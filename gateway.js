'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const {posix:path} = require('node:path');
const {createHash,randomBytes,timingSafeEqual} = require('node:crypto');
const {Client} = require('ssh2');
const format = require('./public/secure-format');

const maxAssetRead = format.chunkBytes + format.overhead;
const maxProgress = 256 * 1024;
const sessionIdle = 45 * 60 * 1000;
const sessionLifetime = 12 * 60 * 60 * 1000;
const digest = data => createHash('sha256').update(data).digest('hex');
const call = (sftp,method,...args) => new Promise((resolve,reject) => {
  sftp[method](...args,(error,result) => error ? reject(error) : resolve(result));
});
const failure = (status,message) => Object.assign(new Error(message),{status});

function openSftp(config,username,password) {
  return new Promise((resolve,reject) => {
    const connection = new Client();
    connection.on('error',reject);
    connection.once('close',() => reject(new Error('SFTP connection closed.')));
    connection.once('ready',() => {
      connection.sftp((error,sftp) => {
        if (error) {connection.end();reject(error);return;}
        resolve({sftp,connection});
      });
    });
    connection.connect({
      host:config.sftp.host,port:config.sftp.port,username,password,
      readyTimeout:8000,keepaliveInterval:20000,keepaliveCountMax:2,
      ...(config.hostKeyAlgorithm ? {algorithms:{serverHostKey:[config.hostKeyAlgorithm]}} : {}),
      hostVerifier: key => timingSafeEqual(createHash('sha256').update(key).digest(),config.hostKey)
    });
  });
}

async function readBytes(sftp,handle,start,length) {
  const bytes = Buffer.allocUnsafe(length);
  const reads = [];
  // SFTP servers often cap packets at 32 KiB. Pipeline a bounded block's reads.
  for (let offset = 0; offset < length; offset += 32 * 1024) {
    reads.push((async () => {
      const end = Math.min(length,offset+32*1024);
      for (let cursor = offset; cursor < end;) {
        const count = await call(sftp,'read',handle,bytes,cursor,end-cursor,start+cursor);
        if (!count) throw new Error('SFTP file ended early.');
        cursor += count;
      }
    })());
  }
  const results = await Promise.allSettled(reads);
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  return bytes;
}

async function withFile(sftp,file,run) {
  const handle = await call(sftp,'open',file,'r');
  try {
    const stat = await call(sftp,'fstat',handle);
    if (!stat.isFile()) throw failure(404,'Encrypted file unavailable.');
    return await run(handle,stat.size);
  } finally {await call(sftp,'close',handle);}
}

async function readProgress(sftp,file) {
  try {
    return await withFile(sftp,file,async (handle,size) => {
      if (size < format.overhead || size > maxProgress) throw failure(422,'Invalid encrypted progress file.');
      const bytes = await readBytes(sftp,handle,0,size);
      return {bytes,etag:`"${digest(bytes)}"`};
    });
  } catch (error) {
    if (error.code === 2) return {bytes:null,etag:'"empty"'};
    throw error;
  }
}

async function writeProgress(sftp,file,bytes) {
  const temp = `${file}.${randomBytes(12).toString('hex')}.tmp`;
  try {
    await call(sftp,'writeFile',temp,bytes,{flag:'wx',mode:0o600});
    // OpenSSH's POSIX rename replaces the prior file atomically.
    await call(sftp,'ext_openssh_rename',temp,file);
  } catch (error) {
    await call(sftp,'unlink',temp).catch(() => {});
    throw error;
  }
}

async function body(req,limit) {
  if (Number(req.headers['content-length']) > limit) throw failure(413,'Request too large.');
  const chunks = [];
  let length = 0;
  for await (const chunk of req.iterator({destroyOnReturn:false})) {
    length += chunk.length;
    if (length > limit) throw failure(413,'Request too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function send(res,status,value,headers = {}) {
  if (value && !Buffer.isBuffer(value)) {
    value = Buffer.from(JSON.stringify(value));
    headers['Content-Type'] = 'application/json; charset=utf-8';
  }
  res.writeHead(status,headers).end(value);
}

function createGateway(config,{connect = openSftp,tls} = {}) {
  const sessions = new Map(), attempts = new Map(), progressWrites = new Map();
  let connecting = 0;
  function remove(token) {
    const session = sessions.get(token);
    sessions.delete(token);
    session?.connection.end();
  }
  function expired(session,now = Date.now()) {
    return now-session.touched > sessionIdle || now-session.created > sessionLifetime;
  }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [token,session] of sessions) if (expired(session,now)) remove(token);
    for (const [ip,attempt] of attempts) if (now-attempt.since > 60000) attempts.delete(ip);
  },60000).unref();

  async function login(req,res) {
    const ip = req.socket.remoteAddress;
    const now = Date.now();
    let attempt = attempts.get(ip);
    if (!attempt || now-attempt.since > 60000) attempts.set(ip,attempt = {since:now,count:0});
    if (++attempt.count > 12) throw failure(429,'Too many connection attempts. Try again in a minute.');
    if (sessions.size+connecting >= 32 || connecting >= 4) throw failure(503,'The bridge is busy. Try again shortly.');
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw failure(415,'Expected JSON.');
    const raw = await body(req,8192);
    let input,address;
    try {input = JSON.parse(raw);address = format.sftpAddress(input.address).address;}
    catch {throw failure(400,'Enter an SFTP address and credentials.');}
    if (address !== config.sftp.address) throw failure(400,'This bridge is configured for a different SFTP address.');
    if (typeof input.username !== 'string' || !/^[a-zA-Z0-9_.@-]{1,128}$/.test(input.username) ||
        typeof input.password !== 'string' || !input.password.length || input.password.length > 4096) {
      throw failure(400,'Enter a valid SFTP username and password.');
    }
    if (sessions.size+connecting >= 32 || connecting >= 4) throw failure(503,'The bridge is busy. Try again shortly.');
    let ssh;
    connecting++;
    try {ssh = await connect(config,input.username,input.password);}
    catch {throw failure(401,'SFTP sign-in failed. Check your credentials and the bridge host key.');}
    finally {connecting--;}
    if (res.destroyed) {ssh.connection.end();return;}
    const token = randomBytes(32).toString('base64url');
    const profile = digest(input.username);
    const session = {...ssh,profile,created:Date.now(),touched:Date.now(),inflight:0};
    sessions.set(token,session);
    ssh.connection.once('close',() => sessions.delete(token));
    send(res,201,{token,idleSeconds:sessionIdle/1000});
  }

  async function assets(req,res,session,id) {
    const file = path.join(config.library,`${id}.szc`);
    const result = await withFile(session.sftp,file,async (handle,size) => {
      const range = format.byteRange(req.headers.range,size);
      if (!range || (!range.partial && id !== 'library') || range.end-range.start+1 > maxAssetRead) return {size};
      const bytes = await readBytes(session.sftp,handle,range.start,range.end-range.start+1);
      return {size,range,bytes};
    });
    if (!result.bytes) return send(res,416,null,{'Content-Range':`bytes */${result.size}`});
    const headers = {'Content-Type':'application/octet-stream','Content-Length':result.bytes.length,'Accept-Ranges':'bytes'};
    if (result.range.partial) headers['Content-Range'] = `bytes ${result.range.start}-${result.range.end}/${result.size}`;
    send(res,result.range.partial ? 206 : 200,result.bytes,headers);
  }

  async function progress(req,res,session) {
    const file = path.join(config.progress,`${session.profile}.szc`);
    if (req.method === 'GET') {
      const {bytes,etag} = await readProgress(session.sftp,file);
      return send(res,bytes ? 200 : 204,bytes,{'ETag':etag,'Content-Type':'application/octet-stream'});
    }
    if (!req.headers['if-match']) throw failure(428,'A progress revision is required.');
    if (req.headers['content-type'] !== 'application/octet-stream') throw failure(415,'Expected encrypted progress.');
    const bytes = await body(req,maxProgress);
    if (bytes.length < format.overhead) throw failure(400,'Invalid encrypted progress.');
    const previous = progressWrites.get(file) || Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      const current = await readProgress(session.sftp,file);
      if (current.etag !== req.headers['if-match']) throw failure(412,'Progress changed on another device.');
      await writeProgress(session.sftp,file,bytes);
      send(res,204,null,{'ETag':`"${digest(bytes)}"`});
    });
    progressWrites.set(file,write);
    try {await write;} finally {if (progressWrites.get(file) === write) progressWrites.delete(file);}
  }

  async function handle(req,res) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Vary','Origin');
    if (!config.origins.has(req.headers.origin)) return send(res,403,{error:'This site origin is not configured for the bridge.'});
    res.setHeader('Access-Control-Allow-Origin',req.headers.origin);
    res.setHeader('Access-Control-Expose-Headers','Content-Range, ETag');
    if (req.method === 'OPTIONS') return send(res,204,null,{
      'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':'Authorization, Content-Type, If-Match, Range',
      'Access-Control-Max-Age':'600'
    });
    try {
      if (req.method === 'POST' && req.url === '/v1/session') return await login(req,res);
      const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '')?.[1];
      const session = sessions.get(token);
      if (!session || expired(session)) {if (session) remove(token);throw failure(401,'Connect to the SFTP bridge again.');}
      session.touched = Date.now();
      if (req.method === 'DELETE' && req.url === '/v1/session') {remove(token);return send(res,204);}
      if (session.inflight >= 8) throw failure(429,'Too many concurrent SFTP reads.');
      session.inflight++;
      try {
        const asset = /^\/v1\/assets\/(library|[a-f0-9]{32})$/.exec(req.url)?.[1];
        if (asset && req.method === 'GET') return await assets(req,res,session,asset);
        if (req.url === '/v1/progress' && ['GET','PUT'].includes(req.method)) return await progress(req,res,session);
        throw failure(404,'Unknown bridge endpoint.');
      } finally {session.inflight--;}
    } catch (error) {
      if (res.destroyed || res.headersSent) return;
      const status = error.status || (error.code === 2 ? 404 : 502);
      send(res,status,{error:error.status ? error.message : status === 404 ? 'Encrypted file unavailable.' : 'The SFTP operation failed.'});
    }
  }

  const server = tls ? https.createServer(tls,handle) : http.createServer(handle);
  server.on('close',() => {clearInterval(sweep);for (const token of sessions.keys()) remove(token);});
  return server;
}

function loadConfig(env) {
  const sftp = format.sftpAddress(env.SFTP_ADDRESS || '');
  const fingerprint = (env.SFTP_HOST_KEY_SHA256 || '').replace(/^SHA256:/,'');
  const hostKey = Buffer.from(fingerprint,'base64');
  if (hostKey.length !== 32 || !/^[A-Za-z0-9+/]{43}=?$/.test(fingerprint)) throw new Error('Set SFTP_HOST_KEY_SHA256 to the trusted OpenSSH SHA256 fingerprint.');
  const origins = new Set((env.FRONTEND_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
  const loopback = host => ['localhost','127.0.0.1','[::1]','::1'].includes(host);
  if (!origins.size || [...origins].some(origin => {
    const url = new URL(origin);
    return url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback(url.hostname)));
  })) throw new Error('Set FRONTEND_ORIGINS to the exact HTTPS site origin.');
  if (!env.SFTP_LIBRARY_DIR || !env.SFTP_PROGRESS_DIR) throw new Error('Set SFTP_LIBRARY_DIR and SFTP_PROGRESS_DIR.');
  const host = env.GATEWAY_BIND || '127.0.0.1', port = Number(env.GATEWAY_PORT || 4174);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid bridge port.');
  let tls;
  if (env.GATEWAY_TLS_KEY && env.GATEWAY_TLS_CERT) tls = {key:fs.readFileSync(env.GATEWAY_TLS_KEY),cert:fs.readFileSync(env.GATEWAY_TLS_CERT),minVersion:'TLSv1.2'};
  else if (!loopback(host) || env.GATEWAY_TLS_KEY || env.GATEWAY_TLS_CERT) throw new Error('The bridge requires TLS when listening outside loopback.');
  return {config:{sftp,hostKey,hostKeyAlgorithm:env.SFTP_HOST_KEY_ALGORITHM || 'ssh-ed25519',origins,library:env.SFTP_LIBRARY_DIR,progress:env.SFTP_PROGRESS_DIR},tls,host,port};
}

if (require.main === module) {
  try {
    const {config,tls,host,port} = loadConfig(process.env);
    createGateway(config,{tls}).listen(port,host,() => console.log(`Sprechzimmer bridge listening on ${host}:${port}.`));
  } catch (error) {console.error(error.message);process.exitCode = 1;}
}

module.exports = {createGateway,loadConfig};
