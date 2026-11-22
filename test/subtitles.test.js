'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const S = require('../public/subtitles');

test('corrected audio transcripts replace cached folder copies and legacy backups',() => {
  const track = {kind:'audio-transcript'};
  for (const deSource of [undefined,'folder-subtitles','restored','audio-transcript','copied-from-folder']) assert.equal(S.preferFolderGerman({deSource},track),true);
  for (const deSource of ['user','user-edited']) assert.equal(S.preferFolderGerman({deSource},track),false);
  assert.equal(S.preferFolderGerman({},undefined),false);
  assert.equal(S.preferFolderGerman({},{source:'Imported file'}),false);
});

test('new audio timing discards obsolete subtitle delay while retaining Arabic settings',() => {
  const old = {de:12,tracks:{ar:1.5}};
  const track = {kind:'audio-transcript',revision:'text-version',timingReference:'video-hash'};
  const migrated = S.timingForGermanTrack(old,track);
  assert.deepEqual(migrated,{de:0,deReference:'video-hash',tracks:{ar:1.5}});
  assert.equal(old.de,12);
  migrated.de = 0.2;
  assert.equal(S.timingForGermanTrack(migrated,{...track,revision:'spelling-fix'}),migrated);
  assert.equal(S.timingForGermanTrack(old,{source:'Imported file'}),old);
});

test('SRT parser handles BOM, Windows line endings, markup, multiline Arabic and unsorted cues',() => {
  const cues = S.parse('\uFEFF2\r\n00:00:05,000 --> 00:00:07,125\r\n<b>Hallo &amp; willkommen!</b>\r\n\r\n1\r\n00:00:01,250 --> 00:00:03,500\r\nمرحبا\r\nبكم\r\n');
  assert.deepEqual(cues,[{start:1.25,end:3.5,text:'مرحبا\nبكم'},{start:5,end:7.125,text:'Hallo & willkommen!'}]);
});
test('WebVTT identifiers, positions, voice markup and comments are handled',() => {
  const cues = S.parse('WEBVTT\n\nNOTE do not show\n00:01.000 --> 00:03.000\nComment\n\nfirst\n01:02.100 --> 01:03.500 align:start position:10%\n<v Lisa>Guten Tag!</v>\n');
  assert.deepEqual(cues,[{start:62.1,end:63.5,text:'Guten Tag!'}]);
});
test('malformed timing and empty files are rejected',() => {
  for (const input of ['', 'not subtitles','1\n00:99:01,000 --> 00:99:02,000\nHi','1\n00:00:02,000 --> 00:00:01,000\nHi']) assert.throws(() => S.parse(input));
});
test('cue lookup handles gaps, exact boundaries and overlapping long cues',() => {
  const idx = S.index([{start:0,end:10,text:'long'},{start:2,end:3,text:'short'},{start:12,end:13,text:'later'}]);
  assert.equal(S.at(idx,-1),-1);assert.equal(S.at(idx,2),1);assert.equal(S.at(idx,3),0);assert.equal(S.at(idx,10),-1);assert.equal(S.at(idx,12),2);assert.equal(S.at(idx,13),-1);
});
test('translation alignment matches time overlap rather than cue number',() => {
  const primary = [{start:0,end:2},{start:3,end:5},{start:8,end:10}];
  const secondary = [{start:0.5,end:1,text:'أهلاً'},{start:1,end:4,text:'بكم'},{start:4,end:6,text:'هنا'}];
  assert.deepEqual(S.align(primary,secondary),['أهلاً\nبكم','بكم\nهنا','']);
});
test('SRT export preserves Arabic, multiline text and millisecond boundaries',() => {
  const cues = [{start:0.001,end:3661.999,text:'مرحبا\nHallo!'}];
  assert.deepEqual(S.parse(S.srt(cues)),cues);
  assert.match(S.srt([{start:59.9996,end:61,text:'round'}]),/00:01:00,000/);
});
test('binary lookup remains correct with a large transcript',() => {
  const cues = Array.from({length:30000},(_,i) => ({start:i*2,end:i*2+1,text:`line ${i}`}));
  const idx = S.index(cues);assert.equal(S.at(idx,50000.5),25000);assert.equal(S.at(idx,50001.5),-1);
});
