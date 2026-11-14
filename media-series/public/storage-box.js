'use strict';

(() => {
  const extensionID = 'kckggoolnhhjklenofbfakllapjclmno';
  const format = window.SecureFormat;
  const encoder = new TextEncoder();

  function rootURL(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.your-storagebox\.de$/.test(url.hostname) ||
        url.port || url.username || url.password || url.search || url.hash) {
      throw new Error('Enter your Storage Box WebDAV address, such as https://u123456.your-storagebox.de/.');
    }
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url;
  }

  function send(profile,message) {
    return new Promise((resolve,reject) => {
      const runtime = window.chrome?.runtime;
      const unavailable = 'Install or reload the Sprechzimmer Storage Box extension for this exact site URL, then reload the page.';
      if (!runtime?.sendMessage) return reject(new Error(unavailable));
      const {root,username,password} = profile;
      runtime.sendMessage(extensionID,{...message,root,username,password},result => {
        if (runtime.lastError || !result) return reject(new Error(unavailable));
        if (result.error) return reject(new Error(result.error));
        resolve(result);
      });
    });
  }

  function response(result) {
    const bytes = result.bytes ? Uint8Array.fromBase64(result.bytes) : null;
    const headers = {'Content-Length':String(bytes?.length || 0)};
    if (result.range) headers['Content-Range'] = result.range;
    if (result.etag) headers.ETag = result.etag;
    return new Response(bytes,{status:result.status,headers});
  }

  async function library(profile) {
    if (profile.catalogFile) {
      if (!format.catalogFilename.test(profile.catalogFile) && profile.catalogFile !== 'library.szc') {
        throw new Error('Enter just the encrypted catalog filename from library/, including the .szi extension.');
      }
      return response(await send(profile,{type:'catalog',file:profile.catalogFile}));
    }
    const result = await send(profile,{type:'list'});
    if (result.status === 405) {
      throw new Error('Storage Box blocks folder listings. Enter the .szi filename from library/ to open it directly. Check the account’s Read only setting if you want to sync progress.');
    }
    if (result.status !== 207) throw new Error(`Could not list the Storage Box library folder (HTTP ${result.status}). Check the URL and upload path.`);
    const directory = new URL('library/',profile.root);
    const xml = new TextDecoder().decode(Uint8Array.fromBase64(result.bytes));
    const doc = new DOMParser().parseFromString(xml,'application/xml');
    const names = new Set();
    for (const node of doc.getElementsByTagNameNS('DAV:','response')) {
      const href = node.getElementsByTagNameNS('DAV:','href')[0]?.textContent;
      if (!href) continue;
      const entry = new URL(href,directory);
      if (entry.origin !== directory.origin || !entry.pathname.startsWith(directory.pathname)) continue;
      const filename = entry.pathname.slice(directory.pathname.length);
      if (format.catalogFilename.test(filename)) names.add(filename);
    }
    if (names.size > 1) throw new Error('The Storage Box library contains more than one encrypted catalog.');
    const file = names.values().next().value || 'library.szc';
    return response(await send(profile,{type:'catalog',file}));
  }

  async function progress(profile,options) {
    const hash = await crypto.subtle.digest('SHA-256',encoder.encode(profile.username));
    const file = `${new Uint8Array(hash).toHex()}.szc`;
    if (options.method === 'PUT') {
      const result = await send(profile,{
        type:'save',file,etag:options.headers['If-Match'],body:new Uint8Array(options.body).toBase64()
      });
      return response(result);
    }
    const result = await send(profile,{type:'progress',file});
    if (result.status === 404) return new Response(null,{status:204,headers:{ETag:'*'}});
    if (result.status === 200 && !result.etag?.startsWith('"')) throw new Error('Storage Box did not return a progress revision.');
    return response(result);
  }

  async function range(profile,id,range) {
    const result = await send(profile,{type:'range',file:`${id}.szc`,range});
    return {
      status:result.status,range:result.range,
      bytes:result.bytes ? Uint8Array.fromBase64(result.bytes).buffer : null
    };
  }

  window.StorageBox = {rootURL,library,progress,range};
})();
