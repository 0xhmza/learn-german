'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/catalog');
test('collections preserve old Simpsons IDs and isolate SpongeBob progress and files',() => {
  assert.equal(C.episodes.length,90);
  assert.equal(new Set(C.episodes.map(item => item.id)).size,C.episodes.length);
  assert.equal(C.get('s06e01').series,'simpsons');
  assert.equal(C.get('spongebob.s03e01').series,'spongebob');
  assert.equal(C.inCollection('spongebob-s03').length,20);
  assert.equal(C.next('spongebob.s03e01'),'spongebob.s03e02');
  assert.equal(C.next('spongebob.s03e20'),undefined);
  assert.equal(C.get('simpsons.s07e01').collection,'simpsons-s07');
  assert.equal(C.get('spongebob.s04e01').collection,'spongebob-s04');
});
test('filename matching accepts configured episodes and subtitle languages without cross-series collisions',() => {
  assert.equal(C.fromFile('simpsons.s06e01.mp4').episode.id,'s06e01');
  assert.equal(C.fromFile('spongebob.s03e01.de.srt').episode.id,'spongebob.s03e01');
  assert.equal(C.fromFile('SPONGEBOB.S03E20.AR.VTT').language,'ar');
  assert.equal(C.fromFile('simpsons.s07e25.de.srt').episode.id,'simpsons.s07e25');
  assert.equal(C.fromFile('spongebob.s04e20.ar.srt').episode.id,'spongebob.s04e20');
  for (const file of ['spongebob.s03e21.mp4','unknown.s03e01.mp4','spongebob.s03e01.mp4.part','simpsons.s06e26.mp4']) assert.equal(C.fromFile(file),null);
});
