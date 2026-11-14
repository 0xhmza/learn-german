import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { safePath, createApp } from '../server.js';

test('the dev server never leaves its folder', () => {
  const base = path.resolve('src');
  assert.equal(safePath(base, '/js/main.js'), path.join(base, 'js', 'main.js'));
  assert.equal(safePath(base, '/../package.json'), path.join(base, 'package.json'));
  assert.equal(safePath(base, '/%2e%2e/%2e%2e/secret'), path.join(base, 'secret'));
  assert.equal(safePath(base, '/a%00b'), null);
  assert.equal(safePath(base, '/%E0%A4%A'), null);
});

test('the dev server serves the page and the assembled content', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address();
  try {
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<script type="module" src="js\/main.js">/);
    const content = await (await fetch(`http://127.0.0.1:${port}/content.json`)).json();
    assert.equal(content.lessons.length, 51);
    assert.equal((await fetch(`http://127.0.0.1:${port}/nope.js`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/`, { method: 'POST' })).status, 405);
  } finally {
    server.close();
  }
});
