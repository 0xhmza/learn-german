// Builds dist/site (hostable folder) and dist/Deutsch-Grammatik-B1.html
// (one self-contained file that works offline by double-click).
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build, transform } from 'esbuild';
import { assembleContent } from './assemble-content.js';
import { validateContent } from './validate-content.js';
import { privateSeriesDirectory, readSeriesPack, seriesDirectory } from './series-pack.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
export const singleFile = path.join(dist, 'Deutsch-Grammatik-B1.html');
// The single file embeds the B1 recordings and series excerpts for offline use.
const BUDGET = { single: 6 * 1024 * 1024, script: 480 * 1024 };

const between = (text, start, end, replacement) => {
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a < 0 || b < 0) throw new Error(`Marker ${start} missing in index.html`);
  return text.slice(0, a) + replacement + text.slice(b + end.length);
};
const kb = bytes => `${(bytes / 1024).toFixed(0)} KB`;

export async function buildAll({ quiet = false, includeSeries = false } = {}) {
  const target = includeSeries ? path.join(dist, 'mit-serien') : dist;
  const site = path.resolve(target, 'site');
  const output = path.join(target, path.basename(singleFile));
  const original = await assembleContent();
  const privateSeries = includeSeries ? await readSeriesPack(privateSeriesDirectory) : null;
  const packDirectory = privateSeries ? privateSeriesDirectory : seriesDirectory;
  const listeningSeries = privateSeries ?? await readSeriesPack(packDirectory);
  if (!listeningSeries) throw new Error('The published listening series pack is missing.');
  const content = { ...original, listeningSeries };
  const errors = validateContent(content);
  if (errors.length) throw new Error(`Content has ${errors.length} problem(s). Run npm run validate.`);

  const bundle = await build({
    entryPoints: [path.join(src, 'js', 'main.js')],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    write: false,
    charset: 'utf8'
  });
  const script = bundle.outputFiles[0].text;

  const index = await readFile(path.join(src, 'index.html'), 'utf8');
  const sheets = [...index.matchAll(/<link rel="stylesheet" href="(styles\/[^"]+)">/g)].map(match => match[1]);
  const css = (await Promise.all(sheets.map(file => readFile(path.join(src, file), 'utf8')))).join('\n');
  const font = await readFile(path.join(src, 'fonts', 'NotoSansArabic-Variable.woff2'));
  const recordings = await Promise.all(Object.keys(content.listeningTimings).map(async id => ({
    id, folder: 'listening-audio', audio: await readFile(path.join(root, 'listening-audio', `${id}.mp3`))
  })));
  recordings.push(...await Promise.all(Object.keys(listeningSeries.timings).map(async id => ({
    id, folder: 'listening-clips', audio: await readFile(path.join(packDirectory, `${id}.mp3`))
  }))));
  const listeningAudio = Object.fromEntries(recordings.map(({ id, audio }) => [id, `data:audio/mpeg;base64,${audio.toString('base64')}`]));
  const contentJson = JSON.stringify(content);
  const json = JSON.stringify({ ...content, listeningAudio }).replace(/</g, '\\u003c');

  if (!site.startsWith(dist + path.sep)) throw new Error('Invalid output directory.');
  await rm(site, { recursive: true, force: true });
  await mkdir(path.join(site, 'fonts'), { recursive: true });
  for (const folder of new Set(recordings.map(recording => recording.folder))) await mkdir(path.join(site, folder), { recursive: true });
  await Promise.all(recordings.map(({ id, folder, audio }) => writeFile(path.join(site, folder, `${id}.mp3`), audio)));

  // Hostable folder.
  let page = between(index, '<!-- styles -->', '<!-- /styles -->', '<link rel="stylesheet" href="app.css">');
  page = between(page, '<!-- script -->', '<!-- /script -->', '<script src="app.js" defer></script>');
  page = page.replace('<!-- content -->\n', '');
  await writeFile(path.join(site, 'index.html'), page);
  await writeFile(path.join(site, 'app.css'), css.replaceAll('url(../fonts/', 'url(fonts/'));
  await writeFile(path.join(site, 'app.js'), script);
  await writeFile(path.join(site, 'content.json'), contentJson);
  await copyFile(path.join(src, 'fonts', 'NotoSansArabic-Variable.woff2'), path.join(site, 'fonts', 'NotoSansArabic-Variable.woff2'));
  await copyFile(path.join(src, 'fonts', 'OFL.txt'), path.join(site, 'fonts', 'OFL.txt'));

  // Single offline file: everything inline, the font as a data URL.
  const license = (await readFile(path.join(src, 'fonts', 'OFL.txt'), 'utf8'))
    .replace(/[ \t]+$/gm, '')
    .replaceAll('*/', '* /');
  const compactCss = await transform(css, { loader: 'css', minifyWhitespace: true, charset: 'utf8' });
  const inlineCss = `/*\nNoto Sans Arabic\n${license}*/\n` + compactCss.code.replaceAll('url(../fonts/NotoSansArabic-Variable.woff2)', `url(data:font/woff2;base64,${font.toString('base64')})`);
  let single = between(index, '<!-- styles -->', '<!-- /styles -->', `<style>\n${inlineCss.replace(/<\/style/gi, '<\\/style')}\n</style>`);
  single = single.replace('<!-- content -->', `<script id="content-data" type="application/json">${json}</script>`);
  single = between(single, '<!-- script -->', '<!-- /script -->', `<script>${script.replace(/<\/script/gi, '<\\/script')}</script>`);
  await writeFile(output, single);

  const sizes = { single: Buffer.byteLength(single), script: Buffer.byteLength(script), content: Buffer.byteLength(contentJson), css: Buffer.byteLength(css) };
  if (!quiet) {
    console.log(`✓ ${path.relative(root, site)}: index.html, app.js (${kb(sizes.script)}), app.css (${kb(sizes.css)}), content.json (${kb(sizes.content)}), fonts/`);
    console.log(`✓ ${path.relative(root, output)} (${kb(sizes.single)}) – ${content.lessons.length} lessons, content ${content.version}`);
  }
  const budget = includeSeries ? 5.75 * 1024 * 1024 : BUDGET.single;
  if (sizes.single > budget) throw new Error(`Single file is ${kb(sizes.single)}, budget ${kb(budget)}.`);
  if (sizes.script > BUDGET.script) throw new Error(`Script is ${kb(sizes.script)}, budget ${kb(BUDGET.script)}.`);
  return sizes;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildAll({ includeSeries: process.argv.includes('--with-series') }).catch(error => {
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
  });
}
