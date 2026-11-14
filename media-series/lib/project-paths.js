'use strict';

const path = require('node:path');

const root = path.resolve(__dirname,'..');
const uploadRoot = path.join(root,'deploy','sftp-upload-short');

module.exports = {
  root,
  uploadRoot,
  uploadLibrary:path.join(uploadRoot,'library'),
  mediaDirectory:path.join(root,'media'),
  keyFile:path.join(root,'private','media-decryption.key'),
  publicDirectory:path.join(root,'public'),
  pagesOutput:path.join(root,'deploy','pages')
};
