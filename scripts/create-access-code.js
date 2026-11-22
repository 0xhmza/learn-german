'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {Writable} = require('node:stream');
const {createInterface} = require('node:readline/promises');
const {parseArgs} = require('node:util');
const {uploadLibrary,keyFile,root} = require('../lib/project-paths');
const codec = require('../public/lock-codec');
const format = require('../public/secure-format');

async function prompt(bridge) {
  if (!process.stdin.isTTY) throw new Error('Run in an interactive terminal, or pass profile JSON to --stdin.');
  let hidden = false;
  const output = new Writable({
    write(chunk,encoding,done) {if (!hidden) process.stdout.write(chunk);done();}
  });
  const input = createInterface({input:process.stdin,output,terminal:true});
  try {
    const profile = bridge
      ? {mode:'bridge',address:await input.question('SFTP address: '),gateway:await input.question('HTTPS bridge URL: ')}
      : {mode:'storage-box',root:await input.question('Storage Box HTTPS URL: ')};
    if (!bridge) profile.catalogFile = await input.question('Encrypted catalog filename (Enter to use the latest local pack): ');
    profile.username = await input.question('Username: ');
    hidden = true;
    process.stdout.write('Password: ');
    profile.password = await input.question('');
    process.stdout.write('\n');
    return profile;
  } finally {input.close();}
}

async function stdin() {
  process.stdin.setEncoding('utf8');
  let data = '';
  for await (const chunk of process.stdin) {
    data += chunk;
    if (data.length > 12000) throw new Error('Profile is too large.');
  }
  try {return JSON.parse(data);}
  catch {throw new Error('Expected JSON profile on standard input.');}
}

async function profileFor(input) {
  const username = input?.username?.trim();
  const password = input?.password;
  if (!/^[a-zA-Z0-9_.@-]{1,128}$/.test(username || '') || typeof password !== 'string' || !password.length || password.length > 4096) {
    throw new Error('Enter a valid username and password.');
  }
  if (input.mode === 'bridge') {
    const address = format.sftpAddress(input.address.trim()).address;
    const gateway = new URL(input.gateway.trim()).href;
    return {mode:'bridge',username,password,address,gateway};
  }
  if (input.mode !== 'storage-box') throw new Error('Choose Storage Box or a bridge.');
  const url = new URL(input.root.trim());
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.your-storagebox\.de$/.test(url.hostname) ||
      url.port || url.username || url.password || url.search || url.hash) throw new Error('Enter a Storage Box HTTPS URL.');
  let catalogFile = input.catalogFile?.trim();
  if (!catalogFile) {
    const files = await fs.readdir(uploadLibrary).catch(error => {if (error.code === 'ENOENT') return [];throw error;});
    const catalogs = files.filter(name => format.catalogFilename.test(name));
    if (catalogs.length !== 1) throw new Error('Enter the .szi filename from the library you uploaded.');
    [catalogFile] = catalogs;
  }
  if (!format.catalogFilename.test(catalogFile)) throw new Error('Enter just the .szi filename from the library you uploaded.');
  return {mode:'storage-box',username,password,root:url.href,catalogFile};
}

async function main() {
  const {values} = parseArgs({options:{bridge:{type:'boolean'},stdin:{type:'boolean'}}});
  const profile = await profileFor(values.stdin ? await stdin() : await prompt(values.bridge));
  const secret = (process.env.PAGES_UNLOCK_KEY || await fs.readFile(keyFile,'utf8')).trim();
  const code = await codec.makeCode(secret,profile);
  if (code.length > 16384) throw new Error('Access code exceeds the login field limit.');
  const target = path.join(root,'private','access-code.txt');
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.writeFile(target,code+'\n',{mode:0o600});
  console.log(`Access code saved to ${target}.`);
}

main().catch(error => {console.error(error.message);process.exitCode = 1;});
