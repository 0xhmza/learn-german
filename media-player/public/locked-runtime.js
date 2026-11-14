'use strict';

(() => {
  const codec = window.AccessCodec;
  const root = new URL('./',location.href);
  const worker = new URL('worker.js',root);
  const form = document.querySelector('form');
  const input = document.querySelector('input');
  const status = document.querySelector('[role=status]');
  const button = document.querySelector('button');
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8',{fatal:true});
  let busy = false;

  async function vault(operation,value) {
    const db = await new Promise((resolve,reject) => {
      const request = indexedDB.open('access',1);
      request.onupgradeneeded = () => request.result.createObjectStore('items');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve,reject) => {
        const tx = db.transaction('items',operation === 'get' ? 'readonly' : 'readwrite');
        const store = tx.objectStore('items');
        const id = root.pathname;
        const request = operation === 'get' ? store.get(id) : operation === 'put' ? store.put(value,id) : store.delete(id);
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error);
      });
    } finally {db.close();}
  }

  async function control() {
    if (!navigator.serviceWorker) throw new Error('Open this page over HTTPS.');
    await navigator.serviceWorker.register(worker);
    if (navigator.serviceWorker.controller?.scriptURL === worker.href) return;
    await new Promise((resolve,reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('controllerchange',check);
      };
      const check = () => {
        if (navigator.serviceWorker.controller?.scriptURL !== worker.href) return;
        cleanup();
        resolve();
      };
      const timer = setTimeout(() => {cleanup();reject(new Error('Could not start. Reload and try again.'));},12000);
      navigator.serviceWorker.addEventListener('controllerchange',check);
      check();
    });
  }

  async function mount(secret,profile) {
    const response = await fetch(new URL('data.bin',root),{cache:'no-store'});
    if (!response.ok) throw new Error('Could not load this page.');
    const key = await codec.key(codec.fromHex(secret));
    let bytes;
    try {bytes = await codec.open(key,'01',new Uint8Array(await response.arrayBuffer()));}
    catch {throw new Error('This access code does not unlock this page.');}
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const {html,files} = await new Response(stream).json();
    const template = new DOMParser().parseFromString(html,'text/html');
    const assets = new Map(files.map(([name,type,data]) => [name,{
      type,bytes:Uint8Array.from(atob(data),char => char.charCodeAt(0))
    }]));
    await control();

    window.PrivateRuntime = {
      consume() {
        const result = {profile,secret};
        profile = null;
        return result;
      },
      accepts(value) {return value.toLowerCase() === secret;},
      async save(value) {
        const key = await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
        const encrypted = await codec.seal(key,'03',encoder.encode(JSON.stringify({secret,profile:value})));
        await vault('put',{key,encrypted});
      },
      forget() {return vault('delete');},
      url(path) {return new URL('_/'+path,root).href;},
      blob(path) {
        const asset = assets.get(path);
        return URL.createObjectURL(new Blob([asset.bytes],{type:asset.type}));
      }
    };
    navigator.serviceWorker.addEventListener('message',async event => {
      const port = event.ports[0];
      if (event.source?.scriptURL !== worker.href || !port) return;
      const {path,method,range} = event.data;
      const asset = assets.get(path);
      try {
        const result = asset ? new Response(method === 'HEAD' ? null : asset.bytes,{
          headers:{'Content-Type':asset.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
        }) : await window.PrivateRuntime.respond?.({path,method,range});
        const body = result?.body || null;
        port.postMessage({body,status:result?.status || 404,headers:[...(result?.headers || [])]},body ? [body] : []);
      } catch {port.postMessage({status:502});}
      finally {port.close();}
    });

    for (const attr of template.documentElement.attributes) document.documentElement.setAttribute(attr.name,attr.value);
    document.querySelector('#gate-style').remove();
    document.body.replaceChildren(...template.body.childNodes);
    for (const element of template.head.children) {
      if (element.tagName !== 'SCRIPT') {
        if (!element.matches('meta[charset],meta[name=viewport]')) document.head.append(element.cloneNode(true));
        continue;
      }
      await new Promise((resolve,reject) => {
        const script = document.createElement('script');
        script.onload = resolve;
        script.onerror = () => reject(new Error('Could not start. Reload and try again.'));
        script.src = element.getAttribute('src');
        document.head.append(script);
      });
    }
  }

  async function unlock(load) {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      const {secret,profile} = await load();
      await mount(secret,profile);
    } catch (error) {
      status.textContent = error.message;
      busy = false;
      button.disabled = false;
    }
  }

  form.onsubmit = event => {
    event.preventDefault();
    const code = input.value;
    input.value = '';
    status.textContent = '';
    void unlock(async () => {
      try {return await codec.readCode(code);}
      catch {throw new Error('Invalid access code.');}
    });
  };
  void (async () => {
    try {
      const saved = await vault('get');
      if (!saved || busy) return;
      const remembered = JSON.parse(decoder.decode(await codec.open(saved.key,'03',saved.encrypted)));
      if (!busy) await unlock(() => remembered);
    } catch {}
  })();
})();
