import { copyFile, cp, mkdir, writeFile } from 'node:fs/promises';
import { buildAll as buildGrammar } from '../../grammar/scripts/build.js';
import mediaPages from './build-pages.js';

const root = new URL('../../', import.meta.url);
const output = new URL('grammar/dist/pages/', root);

await mediaPages.build();
await buildGrammar();
await mkdir(output);
await Promise.all([
  copyFile(new URL('index.html', root), new URL('index.html', output)),
  cp(new URL('grammar/dist/site/', root), new URL('grammar/', output), { recursive: true }),
  cp(new URL('media-player/deploy/pages/', root), new URL('media-player/', output), { recursive: true }),
  writeFile(new URL('.nojekyll', output), '')
]);

console.log('Combined GitHub Pages site is in grammar/dist/pages/.');
