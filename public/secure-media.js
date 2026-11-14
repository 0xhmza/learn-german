'use strict';

(() => {
  const format = window.SecureFormat;

  function serve({method,range},asset,key,readRange) {
    const selection = format.byteRange(range,asset.size);
    if (!selection) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${asset.size}`}});
    const headers = {
      'Content-Type':asset.type,'Content-Length':String(selection.end-selection.start+1),
      'Cache-Control':'no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'
    };
    if (selection.partial) headers['Content-Range'] = `bytes ${selection.start}-${selection.end}/${asset.size}`;
    const status = selection.partial ? 206 : 200;
    if (method === 'HEAD') return new Response(null,{status,headers});
    const abort = new AbortController();
    let index = Math.floor(selection.start/format.chunkBytes);
    const last = Math.floor(selection.end/format.chunkBytes);
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const block = index++;
          const chunk = format.chunkRange(asset.size,block);
          const response = await readRange(`bytes=${chunk.start}-${chunk.end}`,abort.signal);
          if (response.status !== 206 || response.range !== `bytes ${chunk.start}-${chunk.end}/${chunk.total}` ||
              response.bytes?.byteLength !== chunk.length+format.overhead) throw new Error('Invalid encrypted media range.');
          const bytes = await format.open(key,asset.id,block,response.bytes);
          if (abort.signal.aborted) return;
          if (bytes.length !== chunk.length) throw new Error('Invalid decrypted media length.');
          const offset = block*format.chunkBytes;
          controller.enqueue(bytes.subarray(Math.max(0,selection.start-offset),Math.min(bytes.length,selection.end-offset+1)));
          if (index > last) controller.close();
        } catch (error) {if (!abort.signal.aborted) controller.error(error);}
      },
      cancel() {abort.abort();}
    },{highWaterMark:0});
    return new Response(stream,{status,headers});
  }

  window.SecureMedia = {serve};
})();
