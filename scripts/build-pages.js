'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {gzipSync} = require('node:zlib');

const {publicDirectory,pagesOutput,keyFile} = require('../lib/project-paths');
const codec = require('../public/lock-codec');
const files = [
  'app.js','caption-style.js','catalog.js','icon.svg','player-utils.js','practice.mp4','secure-client.js',
  'secure-format.js','secure-media.js','secure.css','storage-box.js','storage.js','style.css','subtitles.js','theme.js',
  'vendor/media-chrome.js','vendor/media-chrome.LICENSE','vendor/media-chrome.version.json'
];
const published = ['index.html','.nojekyll','codec.js','access.js','worker.js','data.bin'];
const mime = {'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.mp4':'video/mp4','.json':'application/json'};
const legacy = [...files,'secure-worker.js'];
const shell = policy => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex,nofollow"><title>Access</title>
<style id="gate-style">
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101010;color:#f4f4f4;font:16px system-ui,sans-serif}
form{width:min(420px,calc(100% - 32px));padding:28px;border:1px solid #383838;border-radius:14px;background:#191919}
label{display:block;font-weight:650;margin-bottom:12px}input,button{width:100%;font:inherit;border-radius:8px;padding:12px}
input{border:1px solid #626262;color:inherit;background:#101010}button{margin-top:12px;border:0;color:#111;background:#eee;font-weight:650;cursor:pointer}
button:disabled{opacity:.55}p{margin:12px 0 0;font-size:14px}p:empty{display:none}
</style>
<script src="./codec.js" defer></script><script src="./access.js" defer></script>
</head><body><form method="post">
<label for="access">Access code</label><input id="access" type="password" required maxlength="16384" autocomplete="off" spellcheck="false">
<button>Unlock</button><p role="status"></p>
</form></body></html>
`;
const dialog = `<dialog id="secure-dialog" aria-labelledby="secure-title">
  <form method="dialog" class="dialog-head">
    <div><div class="section-kicker">YOUR PRIVATE LIBRARY</div><h2 id="secure-title">Connect your library<span>.</span></h2></div>
    <button class="close" aria-label="Close connection settings">×</button>
  </form>
  <form method="dialog" id="secure-form">
    <label for="secure-mode">CONNECTION TYPE</label>
    <select id="secure-mode"><option value="storage-box">Hetzner Storage Box</option><option value="bridge">SFTP with a bridge</option></select>
    <div id="secure-storage-box-fields">
      <label for="secure-root">STORAGE BOX WEBDAV URL</label><input id="secure-root" type="url" placeholder="https://u123456-sub1.your-storagebox.de/" required spellcheck="false">
      <p class="secure-hint">Requires the Sprechzimmer Storage Box extension for Chrome or Edge. Use the URL of the folder containing library/ and progress/.</p>
      <label for="secure-catalog">ENCRYPTED CATALOG FILENAME (OPTIONAL)</label><input id="secure-catalog" placeholder="Filename ending in .szi" maxlength="156" spellcheck="false" autocomplete="off">
      <p class="secure-hint">Paste the .szi filename from library/ if your account blocks folder listings.</p>
    </div>
    <div id="secure-bridge-fields" hidden>
      <label for="secure-address">SFTP ADDRESS</label><input id="secure-address" type="url" placeholder="sftp://media.example.com:22" required disabled spellcheck="false">
      <label for="secure-bridge">SPRECHZIMMER BRIDGE URL</label><input id="secure-bridge" type="url" placeholder="https://bridge.example.com" required disabled spellcheck="false">
    </div>
    <div class="secure-row">
      <div><label for="secure-user">USERNAME</label><input id="secure-user" autocomplete="username" required spellcheck="false"></div>
      <div><label for="secure-password">PASSWORD</label><input id="secure-password" type="password" autocomplete="current-password" required></div>
    </div>
    <label for="secure-key">MEDIA DECRYPTION KEY</label><input id="secure-key" type="password" autocomplete="off" spellcheck="false" maxlength="64">
    <label class="secure-remember"><input id="secure-remember" type="checkbox" checked> Remember on this browser</label>
    <p class="secure-hint">Your media key stays in this browser.</p>
    <p id="secure-status" class="secure-status" role="status"></p>
    <p id="secure-sync-status" class="secure-status" role="status"></p>
    <div class="dialog-actions"><button id="secure-forget" class="outline" type="button">Forget and disconnect</button><button id="secure-connect" class="primary">Unlock library →</button></div>
  </form>
</dialog>`;

async function checkOutput(output,relative = '') {
  let entries;
  try {entries = await fs.readdir(path.join(output,relative),{withFileTypes:true});}
  catch (error) {if (error.code === 'ENOENT') return;throw error;}
  const allowed = new Set([...legacy,...published]);
  for (const entry of entries) {
    const name = path.posix.join(relative,entry.name);
    if (entry.isDirectory() && name === 'vendor') await checkOutput(output,name);
    else if (!entry.isFile() || !allowed.has(name)) throw new Error(`Unexpected file in the Pages output: ${name}. Move it before building.`);
  }
}

async function build({preview = false} = {}) {
  const output = pagesOutput;
  const secret = process.env.PAGES_UNLOCK_KEY || (await fs.readFile(keyFile,'utf8').catch(error => {
    if (error.code === 'ENOENT') throw new Error('Pack the library first or set PAGES_UNLOCK_KEY.');
    throw error;
  })).trim();
  const key = await codec.key(codec.fromHex(secret));
  const stat = await fs.lstat(output).catch(error => {if (error.code !== 'ENOENT') throw error;});
  if (stat && !stat.isDirectory()) throw new Error('The Pages output must be a regular directory.');
  await checkOutput(output);
  const connect = preview ? "'self' https: http://127.0.0.1:* http://localhost:*" : "'self' https:";
  const policy = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src ${connect}; media-src 'self' blob:; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'self'`;
  const index = (await fs.readFile(path.join(publicDirectory,'index.html'),'utf8'))
    .replace('<html lang="en">','<html lang="en" data-remote>')
    .replace(/(src|href)="\/(?!\/)/g,'$1="./_/')
    .replace('<script src="./_/app.js" defer></script>','<link rel="stylesheet" href="./_/secure.css"><script src="./_/secure-format.js" defer></script><script src="./_/storage-box.js" defer></script><script src="./_/secure-media.js" defer></script><script src="./_/secure-client.js" defer></script><script src="./_/app.js" defer></script>')
    .replace('<span class="local-pill"><span class="dot"></span> Local library</span>','<button id="secure-open" class="theme-button" title="Private library settings"><span class="dot"></span><span id="secure-state">Connect library</span></button>')
    .replace('↻ Refresh folder','↻ Refresh library')
    .replace('</body>',`${dialog}\n</body>`);
  if (!index.includes('id="secure-open"') || !index.includes('src="./_/secure-client.js"')) throw new Error('The Pages template did not contain the expected app entry points.');
  const assets = await Promise.all(files.map(async file => [
    file,mime[path.extname(file)] || 'text/plain',(await fs.readFile(path.join(publicDirectory,file))).toString('base64')
  ]));
  const encrypted = await codec.seal(key,'01',gzipSync(JSON.stringify({html:index,files:assets})));
  await fs.mkdir(output,{recursive:true});
  // Remove only known files from the old generated Pages build.
  for (const file of legacy) await fs.unlink(path.join(output,file)).catch(error => {if (error.code !== 'ENOENT') throw error;});
  await fs.rmdir(path.join(output,'vendor')).catch(error => {if (error.code !== 'ENOENT') throw error;});
  for (const [source,target] of [['lock-codec.js','codec.js'],['locked-runtime.js','access.js'],['locked-worker.js','worker.js']]) {
    await fs.copyFile(path.join(publicDirectory,source),path.join(output,target));
  }
  await fs.writeFile(path.join(output,'data.bin'),encrypted);
  await fs.writeFile(path.join(output,'index.html'),shell(policy));
  await fs.writeFile(path.join(output,'.nojekyll'),'');
  console.log(`Static Pages files are in ${output}.`);
}

if (require.main === module) build({preview:process.argv.includes('--local-preview')}).catch(error => {console.error(error.message);process.exitCode = 1;});
module.exports = {build};
