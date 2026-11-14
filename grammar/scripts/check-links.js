// Opens every reference link once and reports pages that are gone.
// Needs network access; not part of npm test.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assembleContent } from './assemble-content.js';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (link check for a grammar course)' };

async function check(url) {
  try {
    const response = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!response.ok) return `HTTP ${response.status}`;
    if (/pdf/i.test(response.headers.get('content-type') || '')) return null;
    const html = await response.text();
    // DWDS answers unknown words with a search page instead of a 404.
    if (/dwds\.de\/wb\//.test(url) && /<title>Suche nach/i.test(html)) return 'no dictionary entry';
    return null;
  } catch (error) {
    return error.name === 'TimeoutError' ? 'timeout' : error.message;
  }
}

async function main() {
  const content = await assembleContent();
  const users = new Map();
  for (const lesson of content.lessons) for (const url of lesson.links) users.set(url, [...(users.get(url) || []), lesson.id]);
  let failed = 0;
  for (const [url, lessons] of users) {
    const problem = await check(url);
    if (problem) {
      failed++;
      console.log(`✗ ${problem}  ${url}  (${lessons.join(', ')})`);
    } else console.log(`✓ ${url}`);
  }
  console.log(`\n${users.size - failed} of ${users.size} links work.`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
