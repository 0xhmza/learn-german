'use strict';

((root) => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8',{fatal:true});

  function encode(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  function decode(text) {
    if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('Invalid code.');
    return Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),char => char.charCodeAt(0));
  }

  function fromHex(text) {
    if (!/^[a-f0-9]{64}$/i.test(text)) throw new Error('Expected a 64-character key.');
    return Uint8Array.from(text.match(/../g),byte => parseInt(byte,16));
  }

  function key(bytes) {
    if (bytes.length !== 32) throw new Error('Invalid key.');
    return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
  }

  function params(label,iv) {
    return {name:'AES-GCM',iv,additionalData:encoder.encode('v1/'+label)};
  }

  async function seal(key,label,plain) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(params(label,iv),key,plain);
    const result = new Uint8Array(iv.length+cipher.byteLength);
    result.set(iv);
    result.set(new Uint8Array(cipher),iv.length);
    return result;
  }

  function open(key,label,bytes) {
    return crypto.subtle.decrypt(params(label,bytes.subarray(0,12)),key,bytes.subarray(12));
  }

  async function makeCode(secret,profile) {
    const bytes = fromHex(secret);
    const encrypted = await seal(await key(bytes),'02',encoder.encode(JSON.stringify(profile)));
    return ['1',encode(bytes),encode(encrypted)].join('.');
  }

  async function readCode(code) {
    const [version,encodedKey,encrypted,...extra] = code.trim().split('.');
    if (code.length > 16384 || version !== '1' || encodedKey?.length !== 43 || !encrypted || extra.length) throw new Error('Invalid access code.');
    const bytes = decode(encodedKey);
    const secret = Array.from(bytes,byte => byte.toString(16).padStart(2,'0')).join('');
    const profile = JSON.parse(decoder.decode(await open(await key(bytes),'02',decode(encrypted))));
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('Invalid access code.');
    return {secret,profile};
  }

  const api = {key,fromHex,seal,open,makeCode,readCode};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AccessCodec = api;
})(globalThis);
