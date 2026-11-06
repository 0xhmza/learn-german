'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.join(__dirname,'..');
const files = [
  'app.js','caption-style.js','catalog.js','icon.svg','player-utils.js','practice.mp4','secure-client.js',
  'secure-format.js','secure-worker.js','secure.css','storage.js','style.css','subtitles.js','theme.js',
  'vendor/media-chrome.js','vendor/media-chrome.LICENSE','vendor/media-chrome.version.json'
];
const dialog = `<dialog id="secure-dialog" aria-labelledby="secure-title">
  <form method="dialog" class="dialog-head">
    <div><div class="section-kicker">YOUR PRIVATE LIBRARY</div><h2 id="secure-title">Connect to SFTP<span>.</span></h2></div>
    <button class="close" aria-label="Close connection settings">×</button>
  </form>
  <p>Enter your SFTP connection and the key used to encrypt your library.</p>
  <form method="dialog" id="secure-form">
    <label for="secure-address">SFTP ADDRESS</label><input id="secure-address" type="url" placeholder="sftp://media.example.com:22" required spellcheck="false">
    <label for="secure-bridge">HTTPS BRIDGE</label><input id="secure-bridge" type="url" placeholder="https://bridge.example.com" required spellcheck="false">
    <div class="secure-row">
      <div><label for="secure-user">SFTP USERNAME</label><input id="secure-user" autocomplete="username" required spellcheck="false"></div>
      <div><label for="secure-password">SFTP PASSWORD</label><input id="secure-password" type="password" autocomplete="current-password" required></div>
    </div>
    <label for="secure-key">MEDIA DECRYPTION KEY</label><input id="secure-key" type="password" autocomplete="off" required spellcheck="false" maxlength="64">
    <label class="secure-remember"><input id="secure-remember" type="checkbox" checked> Remember on this browser</label>
    <p class="secure-hint">Use your own trusted bridge. Your media key stays in this browser.</p>
    <p id="secure-status" class="secure-status" role="status"></p>
    <p id="secure-sync-status" class="secure-status" role="status"></p>
    <div class="dialog-actions"><button id="secure-forget" class="outline" type="button">Forget and disconnect</button><button id="secure-connect" class="primary">Unlock library →</button></div>
  </form>
</dialog>`;

async function checkOutput(output,relative = '') {
  let entries;
  try {entries = await fs.readdir(path.join(output,relative),{withFileTypes:true});}
  catch (error) {if (error.code === 'ENOENT') return;throw error;}
  const allowed = new Set([...files,'index.html','.nojekyll']);
  for (const entry of entries) {
    const name = path.posix.join(relative,entry.name);
    if (entry.isDirectory() && name === 'vendor') await checkOutput(output,name);
    else if (!entry.isFile() || !allowed.has(name)) throw new Error(`Unexpected file in dist: ${name}. Move it before building.`);
  }
}

async function build({preview = false} = {}) {
  const output = path.join(root,'dist');
  const stat = await fs.lstat(output).catch(error => {if (error.code !== 'ENOENT') throw error;});
  if (stat && !stat.isDirectory()) throw new Error('dist must be a regular directory.');
  await checkOutput(output);
  await fs.mkdir(path.join(output,'vendor'),{recursive:true});
  for (const file of files) await fs.copyFile(path.join(root,'public',file),path.join(output,file));
  const connect = preview ? "'self' https: http://127.0.0.1:* http://localhost:*" : "'self' https:";
  const policy = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src ${connect}; media-src 'self' blob:; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'self'`;
  const index = (await fs.readFile(path.join(root,'public/index.html'),'utf8'))
    .replace('<html lang="en">','<html lang="en" data-remote>')
    .replace(/(src|href)="\/(?!\/)/g,'$1="./')
    .replace('<head>','<head>\n  <meta charset="utf-8">')
    .replace('<meta charset="utf-8"><meta name="viewport"',`<meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta name="viewport"`)
    .replace('<script src="./app.js" defer></script>','<link rel="stylesheet" href="./secure.css"><script src="./secure-format.js" defer></script><script src="./secure-client.js" defer></script><script src="./app.js" defer></script>')
    .replace('<span class="local-pill"><span class="dot"></span> Local library</span>','<button id="secure-open" class="theme-button" title="SFTP connection settings"><span class="dot"></span><span id="secure-state">Connect SFTP</span></button>')
    .replace('↻ Refresh folder','↻ Refresh library')
    .replace('</body>',`${dialog}\n</body>`);
  if (!index.includes('id="secure-open"') || !index.includes('src="./secure-client.js"')) throw new Error('The Pages template did not contain the expected app entry points.');
  await fs.writeFile(path.join(output,'index.html'),index);
  await fs.writeFile(path.join(output,'.nojekyll'),'');
  console.log(`Static Pages files are in ${output}.`);
}

if (require.main === module) build({preview:process.argv.includes('--local-preview')}).catch(error => {console.error(error.message);process.exitCode = 1;});
module.exports = {build};
