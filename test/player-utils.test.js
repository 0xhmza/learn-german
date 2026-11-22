'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../public/player-utils');
const event = (key,extra = {}) => ({key,...extra});
test('player shortcuts respect editing, dialogs, modifiers and page scope',() => {
  const context = {watching:true};
  assert.equal(P.shortcut(event('K'),context),'play');
  for (const blocked of [{},{watching:true,editing:true},{watching:true,dialogOpen:true}]) assert.equal(P.shortcut(event('k'),blocked),null);
  for (const modifier of ['ctrlKey','metaKey','altKey','repeat']) assert.equal(P.shortcut(event('s',{[modifier]:true}),context),null);
});
test('focused buttons retain Space but allow letter shortcuts and seeking; sliders retain arrows',() => {
  const button = {watching:true,nativeControl:true};
  assert.equal(P.shortcut(event(' '),button),null);
  assert.equal(P.shortcut(event('k'),button),'play');
  assert.equal(P.shortcut(event('ArrowRight'),button),'forward');
  assert.equal(P.shortcut(event('ArrowLeft',{shiftKey:true}),button),'previous');
  assert.equal(P.shortcut(event('ArrowRight'),{...button,rangeControl:true}),null);
  assert.equal(P.shortcut(event('r'),{...button,rangeControl:true}),'replay');
});
test('seeking and playback rate changes stop at valid media boundaries',() => {
  assert.equal(P.seek(2,-5,100),0);assert.equal(P.seek(98,5,100),100);
  assert.equal(P.seek(20,5,NaN),0);assert.equal(P.seek(20,5,100),25);
  assert.equal(P.speed(0.5,-1),0.5);assert.equal(P.speed(2,1),2);assert.equal(P.speed(1,-1),0.75);
});
test('continue watching uses the newest unfinished available episode and skips completed media',() => {
  const progress = {s06e01:{time:99,duration:100,updated:4},s06e02:{time:10,duration:100,updated:2},s06e03:{time:20,duration:100,updated:3},missing:{time:30,duration:100,updated:9}};
  assert.equal(P.continueEpisode(progress,['s06e01','s06e02','s06e03'],'s06e01'),'s06e03');
  assert.equal(P.continueEpisode(progress,['s06e01','s06e04'],'s06e01'),'s06e04');
  assert.equal(P.continueEpisode(progress,[],'s06e02'),'demo');
});
