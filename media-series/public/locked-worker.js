'use strict';

const prefix = new URL('_/',self.registration.scope);
self.addEventListener('install',event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event => event.waitUntil(self.clients.claim()));

async function respond(event,path) {
  const page = await self.clients.get(event.clientId);
  if (!page) return new Response(null,{status:404});
  const channel = new MessageChannel();
  try {
    return await new Promise(resolve => {
      const finish = response => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(response);
      };
      const timer = setTimeout(() => finish(new Response(null,{status:504})),30000);
      channel.port1.onmessage = ({data}) => {
        try {finish(new Response(data.body,{status:data.status,headers:data.headers}));}
        catch {finish(new Response(null,{status:502}));}
      };
      page.postMessage({path,method:event.request.method,range:event.request.headers.get('Range')},[channel.port2]);
    });
  } catch {
    channel.port1.close();
    return new Response(null,{status:502});
  }
}

self.addEventListener('fetch',event => {
  const url = new URL(event.request.url);
  if (url.origin !== prefix.origin || !url.pathname.startsWith(prefix.pathname)) return;
  if (!['GET','HEAD'].includes(event.request.method)) {
    event.respondWith(new Response(null,{status:405}));
    return;
  }
  event.respondWith(respond(event,url.pathname.slice(prefix.pathname.length)));
});
