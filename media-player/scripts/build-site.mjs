import { copyFile } from 'node:fs/promises';
import { buildAll as buildGrammar } from '../../grammar/scripts/build.js';
import mediaPages from './build-pages.js';

const root = new URL('../../', import.meta.url);
const grammar = new URL('grammar/', root);
const player = new URL('media-player/', root);

await mediaPages.build();
await buildGrammar();
await Promise.all([
  copyFile(new URL('dist/Deutsch-Grammatik-B1.html', grammar), new URL('index.html', grammar)),
  ...['index.html', 'access.js', 'codec.js', 'worker.js', 'data.bin'].map(file =>
    copyFile(new URL(`deploy/pages/${file}`, player), new URL(file, player))
  )
]);

console.log('Refreshed the static entry points in grammar/ and media-player/.');
