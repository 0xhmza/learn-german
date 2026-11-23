// Builds dist/site (hostable folder) and dist/Deutsch-Grammatik-B1.html
// (one self-contained file that works offline by double-click).
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build, transform } from 'esbuild';
import { assembleContent } from './assemble-content.js';
import { validateContent } from './validate-content.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const site = path.join(dist, 'site');
export const singleFile = path.join(dist, 'Deutsch-Grammatik-B1.html');
// The single file embeds the original B1 recordings for offline use.
const BUDGET = { single: 4.25 * 1024 * 1024, script: 280 * 1024 };

const between = (text, start, end, replacement) => {
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a < 0 || b < 0) throw new Error(`Marker ${start} missing in index.html`);
  return text.slice(0, a) + replacement + text.slice(b + end.length);
};
const kb = bytes => `${(bytes / 1024).toFixed(0)} KB`;

export async function buildAll({ quiet = false } = {}) {
  const content = await assembleContent();
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
  const recordingIds = Object.keys(content.listeningTimings);
  const recordings = await Promise.all(recordingIds.map(async id => [id, await readFile(path.join(root, 'listening-audio', `${id}.mp3`))]));
  const sharedSubtitles = await readFile(path.resolve(root, '../public/subtitles.js'), 'utf8');
  const listeningAudio = Object.fromEntries(recordings.map(([id, audio]) => [id, `data:audio/mpeg;base64,${audio.toString('base64')}`]));
  const contentJson = JSON.stringify(content);
  const json = JSON.stringify({ ...content, listeningAudio }).replace(/</g, '\\u003c');

  await rm(dist, { recursive: true, force: true });
  await mkdir(path.join(site, 'fonts'), { recursive: true });
  await mkdir(path.join(site, 'listening-audio'), { recursive: true });
  await mkdir(path.join(site, 'shared'), { recursive: true });
  await Promise.all(recordings.map(([id, audio]) => writeFile(path.join(site, 'listening-audio', `${id}.mp3`), audio)));
  await writeFile(path.join(site, 'shared', 'subtitles.js'), sharedSubtitles);

  // Hostable folder.
  let page = between(index, '<!-- styles -->', '<!-- /styles -->', '<link rel="stylesheet" href="app.css">');
  page = between(page, '<!-- script -->', '<!-- /script -->', '<script src="shared/subtitles.js" defer></script><script src="app.js" defer></script>');
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
  single = between(single, '<!-- script -->', '<!-- /script -->', `<script>${sharedSubtitles.replace(/<\/script/gi, '<\\/script')}\n${script.replace(/<\/script/gi, '<\\/script')}</script>`);
  await writeFile(singleFile, single);

  const sizes = { single: Buffer.byteLength(single), script: Buffer.byteLength(script), content: Buffer.byteLength(contentJson), css: Buffer.byteLength(css) };
  if (!quiet) {
    console.log(`✓ dist/site: index.html, app.js (${kb(sizes.script)}), app.css (${kb(sizes.css)}), content.json (${kb(sizes.content)}), fonts/`);
    console.log(`✓ dist/Deutsch-Grammatik-B1.html (${kb(sizes.single)}) – ${content.lessons.length} lessons, content ${content.version}`);
  }
  if (sizes.single > BUDGET.single) throw new Error(`Single file is ${kb(sizes.single)}, budget ${kb(BUDGET.single)}.`);
  if (sizes.script > BUDGET.script) throw new Error(`Script is ${kb(sizes.script)}, budget ${kb(BUDGET.script)}.`);
  return sizes;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildAll().catch(error => {
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
  });
}
