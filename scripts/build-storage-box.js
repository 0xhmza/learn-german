'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {root,publicDirectory} = require('../lib/project-paths');

// The public manifest key gives local installations the same extension ID.
const key = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAokWgepE92t50R0qvjHC+SZ7GwbQbabmc9T7I35pGuuvCHNQv/o52tcR00AlYAHoHuROnJAXdQ3RM6xNj0yTOGm0C6e5pcCDqYmbrTp5hN3FzDKaxFX8AascAl10eEE0Ei4Kiuof9FHAadu5eBvRihMYRNYD90r0EeeV4olRm3ILUSxZDktmDyMAMNWdozJ2lK2IfU8040mj2tKf/gbI8repnp2wXjjjQth8wZCzcNicjJnfofKWfKSuORyp7ic8Vi/iyJgLY0h99BMU9BaXy9Q8fWgrWdmt+CIwbgf5FL2EnlTYvScfInxreaRf57zePVSDRGal6rcXC28hQLztsAwIDAQAB';

async function build(value) {
  if (!value) throw new Error('Pass your site URL: npm run build:storage-box -- https://you.github.io/learn-german/');
  const url = new URL(value);
  const loopback = ['127.0.0.1','localhost'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash || url.pathname.includes('*')) {
    throw new Error('Use the published HTTPS site URL or a localhost preview URL.');
  }
  if (url.pathname.endsWith('/index.html')) url.pathname = url.pathname.slice(0,-10);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  const output = path.join(root,'deploy','storage-box-extension');
  await fs.mkdir(output,{recursive:true});
  const manifest = {
    manifest_version:3,name:'Sprechzimmer Storage Box',version:'1.0.0',minimum_chrome_version:'140',key,
    description:'Connects your Sprechzimmer site directly to Hetzner Storage Box over WebDAV.',
    host_permissions:['https://*.your-storagebox.de/*'],
    externally_connectable:{matches:[`${url.protocol}//${url.hostname}${url.pathname}*`]},
    background:{service_worker:'background.js'}
  };
  await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await fs.writeFile(path.join(output,'site.js'),`globalThis.SprechzimmerSite = ${JSON.stringify(url.href)};\n`);
  await fs.copyFile(path.join(root,'extension','background.js'),path.join(output,'background.js'));
  await fs.copyFile(path.join(publicDirectory,'secure-format.js'),path.join(output,'secure-format.js'));
  console.log(`Storage Box extension for ${url.href} is in ${output}.`);
}

build(process.argv[2]).catch(error => {console.error(error.message);process.exitCode = 1;});
