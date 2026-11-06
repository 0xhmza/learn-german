'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/caption-style');

test('subtitle preferences accept supported values from HTML controls and survive JSON backup',() => {
  const value = C.sanitize({font:'mono',scale:'1.5',color:'#AAbbCC',secondColor:'#ffff00',background:'#112233',backgroundOpacity:'0',textOpacity:'0.75',edge:'outline'});
  assert.deepEqual(C.sanitize(JSON.parse(JSON.stringify(value))),value);
  assert.equal(value.scale,1.5);assert.equal(value.color,'#aabbcc');assert.equal(value.backgroundOpacity,0);
  const css = C.variables(value);
  assert.equal(css['--caption-color'],'rgba(170,187,204,0.75)');assert.equal(css['--caption-background'],'rgba(17,34,51,0)');
});
test('malformed backup settings cannot insert CSS or unsupported style values',() => {
  const hostile = {font:'serif; color:red',scale:'999',color:'#fff;url(https://outside)',secondColor:'red',background:'var(--secret)',backgroundOpacity:-1,textOpacity:2,edge:'url(https://outside)'};
  for (const input of [hostile,null,[],false]) assert.deepEqual(C.sanitize(input),C.defaults);
  assert.deepEqual(C.sanitize({font:'__proto__',scale:Infinity}),C.defaults);
  assert.deepEqual(C.variables(hostile),C.variables(C.defaults));
});
