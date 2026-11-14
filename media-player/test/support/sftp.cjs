'use strict';

const {spawn} = require('node:child_process');
const {createHash} = require('node:crypto');
const {existsSync} = require('node:fs');
const path = require('node:path');
const {Server,utils} = require('ssh2');

const executable = [process.env.TEST_SFTP_SERVER,'C:/Program Files/Git/usr/lib/ssh/sftp-server.exe',
  '/usr/lib/openssh/sftp-server','/usr/libexec/openssh/sftp-server'].find(file => file && existsSync(file));
const credentials = {username:'fixture-learner',password:'test-only-password'};
const sftpPath = file => process.platform === 'win32' ? file.replace(/\\/g,'/').replace(/^([a-z]):/i,(_,drive) => `/${drive.toLowerCase()}`) : file;

async function serveSftp() {
  const key = utils.generateKeyPairSync('ed25519');
  const hostKey = createHash('sha256').update(utils.parseKey(key.private).getPublicSSH()).digest();
  const peers = new Set();
  const server = new Server({hostKeys:[key.private]},client => {
    peers.add(client);
    client.on('error',() => {});
    client.once('close',() => peers.delete(client));
    client.on('authentication',context => {
      if (context.method === 'password' && context.username === credentials.username && context.password === credentials.password) context.accept();
      else context.reject(['password']);
    });
    client.on('ready',() => client.on('session',acceptSession => {
      acceptSession().on('subsystem',(accept,reject,{name}) => {
        if (name !== 'sftp') return reject();
        const channel = accept();
        const options = {windowsHide:true,stdio:['pipe','pipe','ignore']};
        if (process.platform === 'win32') {
          const gitBin = path.resolve(path.dirname(executable),'../../bin');
          options.env = {...process.env,Path:gitBin+path.delimiter+process.env.Path};
        }
        const child = spawn(executable,[],options);
        child.on('error',() => channel.close());
        child.stdin.on('error',() => {});
        channel.pipe(child.stdin);child.stdout.pipe(channel);
        channel.once('close',() => child.kill());
        child.once('exit',() => channel.end());
      });
    }));
  });
  await new Promise((resolve,reject) => server.once('error',reject).listen(0,'127.0.0.1',resolve));
  return {
    address:`sftp://127.0.0.1:${server.address().port}`,hostKey,
    async close() {
      for (const peer of peers) peer.end();
      await new Promise(resolve => server.close(resolve));
    }
  };
}

module.exports = {executable,credentials,sftpPath,serveSftp};
