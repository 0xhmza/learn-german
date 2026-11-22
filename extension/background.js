'use strict';

importScripts('site.js','secure-format.js');
const site = new URL(globalThis.SprechzimmerSite);
const format = globalThis.SecureFormat;
const maxProgress = 256 * 1024;

function operation(message) {
  const {type,file,range,etag,body} = message;
  if (type === 'list') {
    return {path:'library/',limit:format.chunkBytes,method:'PROPFIND',headers:{Depth:'1','Content-Type':'application/xml'},
      body:'<propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>'};
  }
  if (typeof file !== 'string') throw new Error('Missing encrypted filename.');
  if (type === 'catalog' && (format.catalogFilename.test(file) || file === 'library.szc')) {
    return {path:`library/${file}`,limit:format.chunkBytes};
  }
  if (type === 'range' && file.endsWith('.szc') && format.assetID.test(file.slice(0,-4))) {
    const match = /^bytes=(\d+)-(\d+)$/.exec(range);
    const start = Number(match?.[1]), end = Number(match?.[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || end-start+1 > format.chunkBytes+format.overhead) {
      throw new Error('Invalid encrypted byte range.');
    }
    return {path:`library/${file}`,limit:end-start+1,headers:{Range:range}};
  }
  if (/^[a-f0-9]{64}\.szc$/.test(file)) {
    const path = `progress/${file}`;
    if (type === 'progress') return {path,limit:maxProgress};
    if (type === 'save' && typeof etag === 'string' && (etag === '*' || /^"[\x21\x23-\x7e]{1,200}"$/.test(etag)) &&
        typeof body === 'string' && body.length <= Math.ceil(maxProgress/3)*4) {
      const bytes = Uint8Array.fromBase64(body);
      if (bytes.length < format.overhead || bytes.length > maxProgress) throw new Error('Invalid encrypted progress size.');
      const revision = etag === '*' ? {'If-None-Match':'*'} : {'If-Match':etag};
      return {path,limit:0,method:'PUT',headers:{...revision,'Content-Type':'application/octet-stream'},body:bytes};
    }
  }
  throw new Error('Invalid Storage Box request.');
}

async function readBytes(response,limit) {
  if (!limit || !response.body) {
    await response.body?.cancel();
    return '';
  }
  const bytes = new Uint8Array(limit);
  let offset = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const {value,done} = await reader.read();
      if (done) return bytes.subarray(0,offset).toBase64();
      if (offset+value.length > limit) throw new Error('Storage Box response exceeds the expected size.');
      bytes.set(value,offset);
      offset += value.length;
    }
  } finally {await reader.cancel().catch(() => {});}
}

async function request(message) {
  const root = new URL(message.root);
  if (root.protocol !== 'https:' || !/^[a-z0-9-]+\.your-storagebox\.de$/.test(root.hostname) ||
      root.port || root.username || root.password || root.search || root.hash || !root.pathname.endsWith('/')) {
    throw new Error('Enter a Hetzner Storage Box HTTPS address.');
  }
  const {username,password} = message;
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_.@-]{1,128}$/.test(username) ||
      typeof password !== 'string' || !password.length || password.length > 4096) {
    throw new Error('Enter your Storage Box username and password.');
  }
  const {path,method,headers,body,limit} = operation(message);
  const authorization = new TextEncoder().encode(`${username}:${password}`).toBase64();
  let response;
  try {
    response = await fetch(new URL(path,root),{
      method,headers:{...headers,Authorization:`Basic ${authorization}`},body,
      credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(25000)
    });
  } catch {
    throw new Error('Could not reach Storage Box. Check the HTTPS address, WebDAV and External Reachability.');
  }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    throw new Error('Storage Box denied access. Check the username, password and folder permissions.');
  }
  const keepBody = response.ok && (message.type !== 'range' || response.status === 206);
  return {
    status:response.status,range:response.headers.get('Content-Range'),etag:response.headers.get('ETag'),
    bytes:await readBytes(response,keepBody ? limit : 0)
  };
}

chrome.runtime.onMessageExternal.addListener((message,sender,reply) => {
  if (!sender.url || sender.frameId !== 0) return;
  const url = new URL(sender.url);
  if (url.origin !== site.origin || (url.pathname !== site.pathname && url.pathname !== `${site.pathname}index.html`)) return;
  request(message).then(reply,error => reply({error:error.message}));
  return true;
});
